import { useEffect, useState, type FormEvent } from "react";
import { Link, useParams } from "react-router";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "../lib/supabase";
import { useCalls, useCustomer, useOnboarding, useRuns, useStageHistory, useStages, useTokenStatus } from "../lib/queries";
import { HUB_FIELDS, type Customer, type HubField } from "../lib/types";
import { ago, dateTime, daysSince, ghlContactUrl, money } from "../lib/format";
import { Badge, Button, Card, Empty, ErrorBox, Field, Input, Loading, PageHeader, StatusPill } from "../components/ui";
import RunsTable from "../components/RunsTable";

type Form = Record<HubField, string>;
const NUMERIC: HubField[] = ["setup_fee", "monthly_retainer"];

export default function CustomerDetail() {
  const { id = "" } = useParams();
  const customer = useCustomer(id);
  const stages = useStages();
  const runs = useRuns({ customerId: id, limit: 50 });

  if (customer.isLoading) return <Loading />;
  if (customer.error || !customer.data) return <ErrorBox error={customer.error ?? "Customer not found"} />;
  const c = customer.data;
  const stage = stages.data?.find((s) => s.ghl_stage_id === c.stage_id)?.name ?? "No stage";
  const ghl = ghlContactUrl(c.ghl_contact_id);

  return (
    <>
      <Link to="/pipeline" className="text-sm text-ink-3 hover:text-ink">← Pipeline</Link>
      <PageHeader
        title={c.name}
        subtitle={
          <span className="flex flex-wrap items-center gap-2">
            <Badge>{stage}</Badge>
            {c.status === "won" && <StatusPill kind="good">Won</StatusPill>}
            {c.status === "lost" && <StatusPill kind="critical">Lost</StatusPill>}
            {c.status === "deleted" && <StatusPill kind="neutral">Deleted in GHL</StatusPill>}
            <span className="text-ink-3">{daysSince(c.stage_changed_at) ?? 0}d in stage · synced {ago(c.synced_at)}</span>
          </span>
        }
        actions={ghl && <a href={ghl} target="_blank" rel="noreferrer"><Button>Open in GHL ↗</Button></a>}
      />

      <div className="grid gap-4 lg:grid-cols-3">
        <div className="space-y-4 lg:col-span-2">
          <HubFieldsForm c={c} />
          <Onboarding customerId={c.id} />
          <Calls customerId={c.id} />
          <Card title="Automation runs">
            <RunsTable runs={runs.data ?? []} compact />
          </Card>
        </div>
        <div className="space-y-4">
          <Card title="From GoHighLevel" actions={<span className="text-xs text-ink-3">read-only</span>}>
            <dl className="space-y-2 text-sm">
              <Info label="Contact" value={c.contact_name} />
              <Info label="Company" value={c.company_name} />
              <Info label="Phone" value={c.phone} />
              <Info label="Email" value={c.email} />
              <Info label="Opportunity value" value={c.monetary_value != null ? money(c.monetary_value) : null} />
              <Info label="Created" value={dateTime(c.ghl_created_at)} />
            </dl>
          </Card>
          <AutomationReadiness c={c} />
          <Timeline customerId={c.id} />
        </div>
      </div>
    </>
  );
}

function Info({ label, value }: { label: string; value: string | null | undefined }) {
  return (
    <div className="flex justify-between gap-3">
      <dt className="text-ink-3">{label}</dt>
      <dd className="truncate text-right">{value || "—"}</dd>
    </div>
  );
}

function HubFieldsForm({ c }: { c: Customer }) {
  const qc = useQueryClient();
  const toForm = (x: Customer) => Object.fromEntries(HUB_FIELDS.map((k) => [k, x[k] == null ? "" : String(x[k])])) as Form;
  const [form, setForm] = useState<Form>(toForm(c));
  useEffect(() => setForm(toForm(c)), [c]);

  const save = useMutation({
    mutationFn: async () => {
      const patch = Object.fromEntries(
        HUB_FIELDS.map((k) => [k, form[k].trim() === "" ? null : NUMERIC.includes(k) ? Number(form[k]) : form[k].trim()]),
      );
      const { error } = await supabase.from("customers").update(patch).eq("id", c.id);
      if (error) throw new Error(error.message);
    },
    onSuccess: () => qc.invalidateQueries(),
  });

  const set = (k: HubField) => (e: { target: { value: string } }) => setForm({ ...form, [k]: e.target.value });
  const dirty = JSON.stringify(form) !== JSON.stringify(toForm(c));

  return (
    <Card title="Client details" actions={<span className="text-xs text-ink-3">stored in hub · not overwritten by sync</span>}>
      <form
        onSubmit={(e: FormEvent) => {
          e.preventDefault();
          save.mutate();
        }}
        className="grid gap-3 sm:grid-cols-2"
      >
        <Field label="Niche"><Input value={form.niche} onChange={set("niche")} placeholder="Roofing, Custom Pools…" /></Field>
        <Field label="Lead bucket">
          <select value={form.lead_bucket} onChange={set("lead_bucket")} className="w-full rounded-lg border border-line bg-surface px-3 py-1.5 text-sm">
            <option value="">—</option>
            <option value="A">A: no website, 10+ reviews</option>
            <option value="B">B: active website + ads</option>
          </select>
        </Field>
        <Field label="Tier"><Input value={form.tier} onChange={set("tier")} placeholder="Tier 1 / Tier 2 / Tier 3" /></Field>
        <Field label="Owner"><Input value={form.owner} onChange={set("owner")} placeholder="Team member" /></Field>
        <Field label="Setup fee ($)"><Input type="number" min={0} step="1" value={form.setup_fee} onChange={set("setup_fee")} /></Field>
        <Field label="Monthly retainer ($)"><Input type="number" min={0} step="1" value={form.monthly_retainer} onChange={set("monthly_retainer")} /></Field>

        <div className="pt-2 sm:col-span-2">
          <div className="text-xs font-semibold uppercase tracking-wide text-ink-3">AI receptionist wiring</div>
        </div>
        <Field label="Client GHL location ID" hint="Client sub-account → Settings → Business Profile">
          <Input value={form.client_location_id} onChange={set("client_location_id")} className="font-mono" />
        </Field>
        <Field label="Vapi assistant ID"><Input value={form.vapi_assistant_id} onChange={set("vapi_assistant_id")} className="font-mono" /></Field>
        <Field label="Vapi phone number ID"><Input value={form.vapi_phone_number_id} onChange={set("vapi_phone_number_id")} className="font-mono" /></Field>
        <div className="sm:col-span-2">
          <Field label="Notes">
            <textarea
              value={form.notes}
              onChange={set("notes")}
              rows={3}
              className="w-full rounded-lg border border-line bg-surface px-3 py-2 text-sm outline-none focus:border-accent"
            />
          </Field>
        </div>
        <div className="flex items-center gap-3 sm:col-span-2">
          <Button variant="primary" disabled={!dirty || save.isPending}>{save.isPending ? "Saving…" : "Save"}</Button>
          {save.isSuccess && !dirty && <span className="text-sm text-good-text">Saved</span>}
          <ErrorBox error={save.error} />
        </div>
      </form>
    </Card>
  );
}

function AutomationReadiness({ c }: { c: Customer }) {
  const tokens = useTokenStatus();
  const qc = useQueryClient();
  const [token, setToken] = useState("");
  const tokenRow = tokens.data?.find((t) => t.customer_id === c.id);

  const saveToken = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.rpc("set_client_ghl_token", { p_customer_id: c.id, p_token: token.trim() });
      if (error) throw new Error(error.message);
    },
    onSuccess: () => {
      setToken("");
      qc.invalidateQueries({ queryKey: ["token-status"] });
    },
  });

  const checks = [
    { ok: !!c.client_location_id, label: "Client GHL location ID" },
    { ok: !!c.vapi_assistant_id, label: "Vapi assistant ID" },
    { ok: !!c.vapi_phone_number_id, label: "Vapi phone number ID" },
    { ok: !!tokenRow, label: "Client GHL token (for call notes)" },
  ];

  return (
    <Card title="Automation readiness">
      <ul className="space-y-1.5 text-sm">
        {checks.map((x) => (
          <li key={x.label} className="flex items-center justify-between gap-2">
            <span className="text-ink-2">{x.label}</span>
            <StatusPill kind={x.ok ? "good" : "warning"}>{x.ok ? "Set" : "Missing"}</StatusPill>
          </li>
        ))}
      </ul>
      <form
        className="mt-4 space-y-2 border-t border-line pt-3"
        onSubmit={(e) => {
          e.preventDefault();
          if (token.trim()) saveToken.mutate();
        }}
      >
        <Field
          label={tokenRow ? `Replace GHL token (saved ${ago(tokenRow.updated_at)})` : "Client GHL Private Integration token"}
          hint="Write-only: stored server-side, never shown again. Scopes: contacts.write, contacts.readonly."
        >
          <Input type="password" autoComplete="off" value={token} onChange={(e) => setToken(e.target.value)} placeholder="pit-…" />
        </Field>
        <Button disabled={!token.trim() || saveToken.isPending}>Save token</Button>
        <ErrorBox error={saveToken.error} />
      </form>
    </Card>
  );
}

function Onboarding({ customerId }: { customerId: string }) {
  const tasks = useOnboarding(customerId);
  const qc = useQueryClient();
  const [title, setTitle] = useState("");
  const refresh = () => qc.invalidateQueries({ queryKey: ["onboarding", customerId] });

  const toggle = useMutation({
    mutationFn: async ({ id, done }: { id: number; done: boolean }) => {
      const { error } = await supabase.from("onboarding_tasks").update({ done }).eq("id", id);
      if (error) throw new Error(error.message);
    },
    onSettled: refresh,
  });
  const create = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.rpc("create_onboarding_checklist", { p_customer_id: customerId });
      if (error) throw new Error(error.message);
    },
    onSettled: refresh,
  });
  const add = useMutation({
    mutationFn: async () => {
      const position = Math.max(0, ...(tasks.data ?? []).map((t) => t.position)) + 1;
      const { error } = await supabase.from("onboarding_tasks").insert({ customer_id: customerId, title: title.trim(), position });
      if (error) throw new Error(error.message);
    },
    onSuccess: () => setTitle(""),
    onSettled: refresh,
  });

  const list = tasks.data ?? [];
  const done = list.filter((t) => t.done).length;

  return (
    <Card title="Onboarding checklist" actions={list.length ? <span className="tabular text-xs text-ink-3">{done} / {list.length} done</span> : null}>
      {!list.length ? (
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-sm text-ink-3">Created automatically when the deal reaches the Onboarding stage.</p>
          <Button onClick={() => create.mutate()} disabled={create.isPending}>Create checklist now</Button>
        </div>
      ) : (
        <>
          <div className="mb-3 h-1.5 overflow-hidden rounded-full bg-surface-2">
            <div className="h-full rounded-full bg-series-1" style={{ width: `${(done / list.length) * 100}%` }} />
          </div>
          <ul className="space-y-1">
            {list.map((t) => (
              <li key={t.id}>
                <label className="flex cursor-pointer items-start gap-2 rounded-md px-1 py-1 text-sm hover:bg-surface-2">
                  <input
                    type="checkbox"
                    className="mt-0.5"
                    checked={t.done}
                    onChange={(e) => toggle.mutate({ id: t.id, done: e.target.checked })}
                  />
                  <span className={t.done ? "text-ink-3 line-through" : ""}>{t.title}</span>
                  {t.done_at && <span className="ml-auto whitespace-nowrap text-xs text-ink-3">{dateTime(t.done_at)}</span>}
                </label>
              </li>
            ))}
          </ul>
          <form
            className="mt-3 flex gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              if (title.trim()) add.mutate();
            }}
          >
            <Input placeholder="Add a task…" value={title} onChange={(e) => setTitle(e.target.value)} />
            <Button disabled={!title.trim()}>Add</Button>
          </form>
        </>
      )}
      <ErrorBox error={toggle.error ?? create.error ?? add.error} />
    </Card>
  );
}

function Calls({ customerId }: { customerId: string }) {
  const calls = useCalls(customerId);
  const list = calls.data ?? [];
  return (
    <Card title="AI receptionist calls" actions={<span className="tabular text-xs text-ink-3">{list.length}</span>}>
      {!list.length ? (
        <Empty>No calls yet. They appear when this client's form webhook fires.</Empty>
      ) : (
        <ul className="divide-y divide-line">
          {list.map((x) => (
            <li key={x.vapi_call_id} className="py-3 text-sm">
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-medium">{x.lead_name ?? x.lead_phone}</span>
                {x.qualified === true && <StatusPill kind="good">Qualified</StatusPill>}
                {x.qualified === false && <StatusPill kind="critical">Not qualified</StatusPill>}
                {x.status !== "ended" && <StatusPill kind="neutral">In progress</StatusPill>}
                {x.status === "ended" && !x.ghl_note_written && <StatusPill kind="warning">Note not written</StatusPill>}
                <span className="ml-auto text-xs text-ink-3">{dateTime(x.created_at)}</span>
              </div>
              {x.service_needed && <div className="mt-1 text-xs text-ink-2">Service: {x.service_needed}</div>}
              {x.preferred_time && <div className="text-xs text-ink-2">Preferred time: {x.preferred_time}</div>}
              {x.summary && <p className="mt-1 text-ink-2">{x.summary}</p>}
              <div className="tabular mt-1 flex gap-3 text-xs text-ink-3">
                {x.duration_seconds != null && <span>{Math.round(x.duration_seconds)}s</span>}
                {x.cost_usd != null && <span>${Number(x.cost_usd).toFixed(3)}</span>}
                {x.recording_url && <a href={x.recording_url} target="_blank" rel="noreferrer" className="text-accent hover:underline">Recording ↗</a>}
              </div>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

function Timeline({ customerId }: { customerId: string }) {
  const history = useStageHistory(customerId);
  const list = history.data ?? [];
  return (
    <Card title="Stage history">
      {!list.length ? (
        <p className="text-sm text-ink-3">No changes recorded yet.</p>
      ) : (
        <ol className="space-y-3 border-l border-line pl-4">
          {list.map((h) => (
            <li key={h.id} className="relative text-sm">
              <span className="absolute -left-[21px] top-1.5 h-2 w-2 rounded-full bg-series-1" />
              <div>
                {h.from_stage_name || h.from_status ? (
                  h.from_stage_name !== h.to_stage_name ? (
                    <>{h.from_stage_name ?? "—"} → <strong>{h.to_stage_name ?? "—"}</strong></>
                  ) : (
                    <>Status {h.from_status} → <strong>{h.to_status}</strong></>
                  )
                ) : (
                  <>Entered <strong>{h.to_stage_name ?? "pipeline"}</strong></>
                )}
              </div>
              <div className="text-xs text-ink-3">{dateTime(h.changed_at)}</div>
            </li>
          ))}
        </ol>
      )}
    </Card>
  );
}
