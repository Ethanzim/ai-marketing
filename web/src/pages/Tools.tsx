import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "../lib/supabase";
import { useTools } from "../lib/queries";
import type { Tool } from "../lib/types";
import { dateTime, money } from "../lib/format";
import { Badge, ErrorBox, Input, Loading, PageHeader, StatusPill, cx } from "../components/ui";

const CATEGORIES: Tool["category"][] = ["Core", "Outbound & Lead Gen", "Support & Billing"];

export default function Tools() {
  const tools = useTools();
  const qc = useQueryClient();
  const update = useMutation({
    mutationFn: async ({ id, patch }: { id: number; patch: Partial<Tool> }) => {
      const { error } = await supabase.from("tools").update(patch).eq("id", id);
      if (error) throw new Error(error.message);
    },
    onMutate: async ({ id, patch }) => {
      await qc.cancelQueries({ queryKey: ["tools"] });
      qc.setQueryData<Tool[]>(["tools"], (old) => old?.map((t) => (t.id === id ? { ...t, ...patch } : t)));
    },
    onSettled: () => qc.invalidateQueries({ queryKey: ["tools"] }),
  });

  if (tools.isLoading) return <Loading />;
  const list = tools.data ?? [];
  const ready = list.filter((t) => t.is_ready).length;
  const base = list.reduce((s, t) => s + Number(t.monthly_base_usd), 0);

  return (
    <>
      <PageHeader
        title="Tech stack"
        subtitle={<>{ready} of {list.length} ready · {money(base)}/mo fixed base · architecture: GHL webhooks ⇄ Supabase functions ⇄ Vapi</>}
      />
      <ErrorBox error={tools.error ?? update.error} />
      <div className="space-y-8">
        {CATEGORIES.map((cat) => (
          <section key={cat}>
            <h2 className="mb-3 text-xs font-semibold uppercase tracking-wide text-ink-3">{cat}</h2>
            <div className="grid gap-3 lg:grid-cols-2">
              {list.filter((t) => t.category === cat).map((t) => (
                <ToolCard key={t.id} t={t} onChange={(patch) => update.mutate({ id: t.id, patch })} />
              ))}
            </div>
          </section>
        ))}
      </div>
    </>
  );
}

function ToolCard({ t, onChange }: { t: Tool; onChange: (p: Partial<Tool>) => void }) {
  const [open, setOpen] = useState(false);
  const [cost, setCost] = useState(String(t.monthly_base_usd));

  return (
    <article className={cx("rounded-xl border bg-surface p-4", t.is_ready ? "border-good/40" : "border-line")}>
      <div className="flex items-start gap-3">
        <input
          type="checkbox"
          aria-label={`${t.name} up and running`}
          className="mt-1 h-4 w-4 accent-[var(--good)]"
          checked={t.is_ready}
          onChange={(e) => onChange({ is_ready: e.target.checked })}
        />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="font-semibold">{t.name}</h3>
            {t.is_ready ? <StatusPill kind="good">Ready</StatusPill> : <StatusPill kind="neutral">Not set up</StatusPill>}
            {t.setup_step && <Badge>{t.setup_step}</Badge>}
          </div>
          <p className="mt-1 text-sm text-ink-2">{t.role}</p>

          <dl className="mt-3 grid gap-x-4 gap-y-1 text-xs sm:grid-cols-2">
            <div><dt className="inline text-ink-3">Base: </dt><dd className="inline">{t.base_cost}</dd></div>
            <div><dt className="inline text-ink-3">Usage: </dt><dd className="inline">{t.usage_cost}</dd></div>
          </dl>

          {open && (
            <div className="mt-3 space-y-2 border-t border-line pt-3 text-sm">
              <Detail label="Integrates with" value={t.integrates_with} />
              <Detail label="Keys / IDs to copy" value={t.required_keys} />
              <Detail label="Setup notes" value={t.notes} />
              <label className="flex items-center gap-2 text-xs text-ink-3">
                Counts toward fixed run-rate ($/mo)
                <Input
                  type="number"
                  min={0}
                  step="1"
                  value={cost}
                  className="w-24"
                  onChange={(e) => setCost(e.target.value)}
                  onBlur={() => Number(cost) !== Number(t.monthly_base_usd) && onChange({ monthly_base_usd: Number(cost) || 0 })}
                />
              </label>
              {t.ready_at && <p className="text-xs text-ink-3">Marked ready {dateTime(t.ready_at)}</p>}
            </div>
          )}

          <div className="mt-3 flex items-center gap-4 text-xs">
            <button onClick={() => setOpen(!open)} className="text-accent hover:underline">
              {open ? "Hide details" : "Setup details"}
            </button>
            {t.url && (
              <a href={t.url} target="_blank" rel="noreferrer" className="text-ink-3 hover:text-ink">
                {t.url.replace(/^https?:\/\//, "")} ↗
              </a>
            )}
          </div>
        </div>
      </div>
    </article>
  );
}

function Detail({ label, value }: { label: string; value: string | null }) {
  if (!value) return null;
  return (
    <div>
      <div className="text-xs font-medium text-ink-3">{label}</div>
      <p className="text-ink-2">{value}</p>
    </div>
  );
}
