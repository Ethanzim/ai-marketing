// Replaces Make.com Scenario 2.
// Set each Vapi assistant's Server URL to this function (URL is on the hub's Setup page).
// On the end-of-call-report we store the result and write a note + tag on the lead's
// contact in the client's GHL sub-account. All other Vapi events are ignored.
import { admin, serveLogged } from "../_shared/handler.ts";
import { ghl } from "../_shared/ghl.ts";

const truthy = (v: unknown) =>
  v === true || (typeof v === "string" && ["true", "yes", "y", "1"].includes(v.trim().toLowerCase()));

serveLogged("vapi-callback", async (ctx) => {
  const msg = ctx.body?.message ?? ctx.body ?? {};
  if (msg.type !== "end-of-call-report") return { body: { ignored: msg.type ?? "unknown" }, log: false };

  const callId: string | undefined = msg.call?.id;
  if (!callId) throw new Error("end-of-call-report without call.id");

  const analysis = msg.analysis ?? {};
  const sd = analysis.structuredData ?? {};
  const summary: string = analysis.summary ?? msg.summary ?? "";
  const recordingUrl: string | null = msg.recordingUrl ?? msg.artifact?.recordingUrl ?? null;
  const qualified = sd.qualified === undefined ? null : truthy(sd.qualified);
  const meta = msg.call?.assistantOverrides?.metadata ?? msg.call?.metadata ?? {};

  const { data: existing } = await admin
    .from("calls")
    .select("customer_id, ghl_contact_id")
    .eq("vapi_call_id", callId)
    .maybeSingle();
  const customerId: string | null = existing?.customer_id ?? meta.customer_id ?? null;
  const contactId: string | null = existing?.ghl_contact_id ?? meta.ghl_contact_id ?? null;
  ctx.setCustomer(customerId);

  const { error: upErr } = await admin.from("calls").upsert({
    vapi_call_id: callId,
    customer_id: customerId,
    ghl_contact_id: contactId,
    lead_phone: msg.call?.customer?.number ?? undefined,
    status: "ended",
    qualified,
    preferred_time: sd.preferred_time ?? null,
    job_details: sd.job_details ?? null,
    summary,
    recording_url: recordingUrl,
    ended_reason: msg.endedReason ?? null,
    duration_seconds: msg.durationSeconds ?? null,
    cost_usd: msg.cost ?? null,
    ended_at: msg.endedAt ?? new Date().toISOString(),
  }, { onConflict: "vapi_call_id" });
  if (upErr) throw upErr;

  if (!customerId || !contactId) throw new Error("Call can't be matched to a hub client / GHL contact");

  const { data: secret } = await admin
    .from("customer_secrets")
    .select("ghl_location_token")
    .eq("customer_id", customerId)
    .maybeSingle();
  if (!secret) throw new Error("No GHL Private Integration token saved for this client (Customer page -> GHL token)");

  const verdict = qualified === null ? "Unknown" : qualified ? "QUALIFIED" : "Not qualified";
  const note = [
    `AI Receptionist call: ${verdict}`,
    sd.preferred_time ? `Preferred time: ${sd.preferred_time}` : null,
    sd.job_details ? `Job details: ${sd.job_details}` : null,
    summary ? `\nSummary:\n${summary}` : null,
    recordingUrl ? `\nRecording: ${recordingUrl}` : null,
  ].filter(Boolean).join("\n");

  await ghl(secret.ghl_location_token, `/contacts/${contactId}/notes`, {
    method: "POST",
    body: JSON.stringify({ body: note }),
  });
  if (qualified !== null) {
    await ghl(secret.ghl_location_token, `/contacts/${contactId}/tags`, {
      method: "POST",
      body: JSON.stringify({ tags: [qualified ? "ai-qualified" : "ai-not-qualified"] }),
    });
  }
  await admin.from("calls").update({ ghl_note_written: true }).eq("vapi_call_id", callId);

  return { body: { vapi_call_id: callId, qualified, contactId } };
});
