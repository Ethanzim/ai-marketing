// Mirrors the "Agency Sales" pipeline from your agency GHL sub-account into Supabase.
//
// Modes:
//   webhook  - GHL workflow (Opportunity Created / Pipeline Stage Changed) posts here;
//              we refetch that one opportunity and upsert it.
//   full     - cron (every 15 min) or the hub's "Sync now" button; pulls stages + every opportunity.
//
// Only GHL-owned columns are written. Hub-owned columns (niche, retainer, Vapi IDs, ...) are never touched.
import { admin, serveLogged } from "../_shared/handler.ts";
import { ghl, type GhlOpportunity, type GhlPipeline } from "../_shared/ghl.ts";

const TOKEN = Deno.env.get("GHL_AGENCY_TOKEN");
const LOCATION_ID = Deno.env.get("GHL_AGENCY_LOCATION_ID");
const PIPELINE_ID = Deno.env.get("GHL_PIPELINE_ID");
const PIPELINE_NAME = Deno.env.get("GHL_PIPELINE_NAME") ?? "Agency Sales";

async function syncStages(): Promise<{ pipelineId: string; stageIds: Set<string> }> {
  const { pipelines } = await ghl<{ pipelines: GhlPipeline[] }>(
    TOKEN!,
    `/opportunities/pipelines?locationId=${LOCATION_ID}`,
  );
  const p = pipelines.find((x) =>
    PIPELINE_ID ? x.id === PIPELINE_ID : x.name.trim().toLowerCase() === PIPELINE_NAME.toLowerCase()
  );
  if (!p) {
    throw new Error(
      `Pipeline ${PIPELINE_ID ?? `"${PIPELINE_NAME}"`} not found. Available: ${pipelines.map((x) => x.name).join(", ")}`,
    );
  }
  const rows = p.stages.map((s, i) => ({
    ghl_stage_id: s.id,
    ghl_pipeline_id: p.id,
    name: s.name,
    position: s.position ?? i,
    synced_at: new Date().toISOString(),
  }));
  const { error } = await admin.from("pipeline_stages").upsert(rows, { onConflict: "ghl_stage_id" });
  if (error) throw error;

  const ids = rows.map((r) => r.ghl_stage_id);
  await admin.from("pipeline_stages").delete().eq("ghl_pipeline_id", p.id).not("ghl_stage_id", "in", `(${ids.join(",")})`);
  return { pipelineId: p.id, stageIds: new Set(ids) };
}

function toRow(o: GhlOpportunity, stageIds: Set<string>) {
  return {
    ghl_opportunity_id: o.id,
    ghl_contact_id: o.contactId ?? o.contact?.id ?? null,
    name: o.name || o.contact?.companyName || o.contact?.name || "Untitled",
    contact_name: o.contact?.name ?? null,
    company_name: o.contact?.companyName ?? null,
    phone: o.contact?.phone ?? null,
    email: o.contact?.email ?? null,
    stage_id: stageIds.has(o.pipelineStageId) ? o.pipelineStageId : null,
    status: o.status ?? null,
    monetary_value: o.monetaryValue ?? null,
    ghl_created_at: o.createdAt ?? null,
    ghl_updated_at: o.updatedAt ?? null,
    stage_changed_at: o.lastStageChangeAt ?? null,
    synced_at: new Date().toISOString(),
  };
}

async function upsert(opps: GhlOpportunity[], stageIds: Set<string>) {
  if (!opps.length) return 0;
  const { error } = await admin
    .from("customers")
    .upsert(opps.map((o) => toRow(o, stageIds)), { onConflict: "ghl_opportunity_id" });
  if (error) throw error;
  return opps.length;
}

async function searchAll(pipelineId: string, extra = ""): Promise<GhlOpportunity[]> {
  const out: GhlOpportunity[] = [];
  const seen = new Set<string>();
  let cursor = "";
  for (let page = 0; page < 100; page++) {
    const res = await ghl<{ opportunities: GhlOpportunity[]; meta?: { startAfter?: number; startAfterId?: string } }>(
      TOKEN!,
      `/opportunities/search?location_id=${LOCATION_ID}&pipeline_id=${pipelineId}&limit=100${extra}${cursor}`,
    );
    const fresh = res.opportunities.filter((o) => !seen.has(o.id));
    fresh.forEach((o) => {
      seen.add(o.id);
      out.push(o);
    });
    if (res.opportunities.length < 100 || !fresh.length || !res.meta?.startAfterId) break;
    cursor = `&startAfter=${res.meta.startAfter}&startAfterId=${res.meta.startAfterId}`;
  }
  return out;
}

async function fullSync() {
  const { pipelineId, stageIds } = await syncStages();
  const opps = await searchAll(pipelineId);
  const upserted = await upsert(opps, stageIds);

  // opportunities deleted in GHL: keep the row (and its hub data) but flag it
  const live = new Set(opps.map((o) => o.id));
  const { data: existing } = await admin.from("customers").select("id, ghl_opportunity_id, status");
  const gone = (existing ?? []).filter((c) => !live.has(c.ghl_opportunity_id) && c.status !== "deleted");
  if (gone.length) {
    await admin.from("customers").update({ status: "deleted" }).in("id", gone.map((c) => c.id));
  }
  return { mode: "full", pipelineId, stages: stageIds.size, upserted, markedDeleted: gone.length };
}

serveLogged("ghl-sync", async (ctx) => {
  if (!TOKEN || !LOCATION_ID) {
    // don't spam the log every 15 minutes before setup is finished
    return {
      status: 503,
      body: { error: "Set GHL_AGENCY_TOKEN and GHL_AGENCY_LOCATION_ID in Supabase Edge Function secrets" },
      log: ctx.trigger !== "cron",
    };
  }

  const b = ctx.body ?? {};
  const cd = b.customData ?? {};
  const oppId: string | undefined = cd.opportunity_id ?? b.opportunity_id ?? b.opportunityId ?? b.opportunity?.id;
  const contactId: string | undefined = cd.contact_id ?? b.contact_id ?? b.contactId;

  if (ctx.query.mode === "full" || ctx.trigger === "cron" || (!oppId && !contactId)) {
    return { body: await fullSync() };
  }

  // webhook mode: refresh just the affected opportunity
  const { data: stageRows } = await admin.from("pipeline_stages").select("ghl_stage_id, ghl_pipeline_id");
  let stageIds = new Set((stageRows ?? []).map((s) => s.ghl_stage_id));
  let pipelineId = PIPELINE_ID ?? stageRows?.[0]?.ghl_pipeline_id;

  let opps: GhlOpportunity[];
  if (oppId) {
    const { opportunity } = await ghl<{ opportunity: GhlOpportunity }>(TOKEN, `/opportunities/${oppId}`);
    opps = [opportunity];
  } else {
    if (!pipelineId) ({ pipelineId, stageIds } = await syncStages());
    opps = await searchAll(pipelineId!, `&contact_id=${contactId}`);
  }

  // new stage added in GHL since the last sync -> refresh stage list
  if (opps.some((o) => !stageIds.has(o.pipelineStageId))) ({ pipelineId, stageIds } = await syncStages());

  const mine = opps.filter((o) => o.pipelineId === pipelineId);
  const upserted = await upsert(mine, stageIds);

  if (mine.length === 1) {
    const { data } = await admin.from("customers").select("id").eq("ghl_opportunity_id", mine[0].id).single();
    ctx.setCustomer(data?.id);
  }
  return { body: { mode: "webhook", upserted, ignoredOtherPipelines: opps.length - mine.length } };
});
