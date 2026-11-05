import { useMemo, useState } from "react";
import { Link } from "react-router";
import { useCustomers, useStages, useSyncNow } from "../lib/queries";
import type { Customer } from "../lib/types";
import { ago, daysSince, ghlContactUrl, money } from "../lib/format";
import { Badge, Button, Empty, ErrorBox, Input, Loading, PageHeader, StatusPill } from "../components/ui";

const select = "rounded-lg border border-line bg-surface px-2 py-1.5 text-sm";

export default function Pipeline() {
  const stages = useStages();
  const customers = useCustomers();
  const sync = useSyncNow();
  const [q, setQ] = useState("");
  const [niche, setNiche] = useState("");
  const [bucket, setBucket] = useState("");
  const [owner, setOwner] = useState("");
  const [showClosed, setShowClosed] = useState(false);

  const all = customers.data ?? [];
  const niches = useMemo(() => [...new Set(all.map((c) => c.niche).filter(Boolean))].sort() as string[], [all]);
  const owners = useMemo(() => [...new Set(all.map((c) => c.owner).filter(Boolean))].sort() as string[], [all]);

  const filtered = all.filter(
    (c) =>
      (showClosed || c.status === "open" || c.status === "won") &&
      (!niche || c.niche === niche) &&
      (!bucket || c.lead_bucket === bucket) &&
      (!owner || c.owner === owner) &&
      (!q || [c.name, c.contact_name, c.company_name, c.email, c.phone].some((v) => v?.toLowerCase().includes(q.toLowerCase()))),
  );
  const lastSync = all.reduce<string | null>((m, x) => (x.synced_at && (!m || x.synced_at > m) ? x.synced_at : m), null);

  return (
    <>
      <PageHeader
        title="Pipeline"
        subtitle={<>Read-only mirror of GHL “Agency Sales” · synced {ago(lastSync)} · move deals in GoHighLevel</>}
        actions={
          <Button onClick={() => sync.mutate()} disabled={sync.isPending}>
            {sync.isPending ? "Syncing…" : "↻ Sync now"}
          </Button>
        }
      />

      <div className="mb-4 flex flex-wrap items-center gap-2">
        <Input placeholder="Search name, email, phone…" value={q} onChange={(e) => setQ(e.target.value)} className="max-w-xs" />
        <select className={select} value={niche} onChange={(e) => setNiche(e.target.value)} aria-label="Niche">
          <option value="">All niches</option>
          {niches.map((n) => <option key={n}>{n}</option>)}
        </select>
        <select className={select} value={bucket} onChange={(e) => setBucket(e.target.value)} aria-label="Lead bucket">
          <option value="">All buckets</option>
          <option value="A">Bucket A (no website)</option>
          <option value="B">Bucket B (site + ads)</option>
        </select>
        <select className={select} value={owner} onChange={(e) => setOwner(e.target.value)} aria-label="Owner">
          <option value="">All owners</option>
          {owners.map((n) => <option key={n}>{n}</option>)}
        </select>
        <label className="flex items-center gap-1.5 text-sm text-ink-2">
          <input type="checkbox" checked={showClosed} onChange={(e) => setShowClosed(e.target.checked)} /> Show lost / deleted
        </label>
      </div>

      <div className="space-y-2">
        <ErrorBox error={sync.error ?? customers.error ?? stages.error} />
      </div>

      {stages.isLoading || customers.isLoading ? (
        <Loading />
      ) : !stages.data?.length ? (
        <Empty>
          No stages yet. Complete the <Link to="/setup" className="text-accent underline">Setup</Link> steps, then hit Sync now.
        </Empty>
      ) : (
        <div className="-mx-4 overflow-x-auto px-4 pb-4 md:-mx-8 md:px-8">
          <div className="flex gap-3">
            {stages.data.map((s) => {
              const cards = filtered.filter((c) => c.stage_id === s.ghl_stage_id);
              return (
                <section key={s.ghl_stage_id} className="flex w-64 shrink-0 flex-col rounded-xl bg-surface-2/70 p-2">
                  <header className="flex items-center justify-between px-1 pb-2 pt-1">
                    <h2 className="truncate text-sm font-semibold">{s.name}</h2>
                    <span className="tabular text-xs text-ink-3">{cards.length}</span>
                  </header>
                  <div className="space-y-2">
                    {cards.map((c) => <DealCard key={c.id} c={c} />)}
                    {!cards.length && <div className="px-1 py-4 text-center text-xs text-ink-3">—</div>}
                  </div>
                </section>
              );
            })}
          </div>
        </div>
      )}
    </>
  );
}

function DealCard({ c }: { c: Customer }) {
  const days = daysSince(c.stage_changed_at);
  const ghl = ghlContactUrl(c.ghl_contact_id);
  return (
    <article className="rounded-lg border border-line bg-surface p-3 shadow-xs">
      <Link to={`/customers/${c.id}`} className="block font-medium leading-snug hover:text-accent">
        {c.name}
      </Link>
      {c.contact_name && c.contact_name !== c.name && <div className="truncate text-xs text-ink-3">{c.contact_name}</div>}
      <div className="mt-2 flex flex-wrap items-center gap-1">
        {c.status === "won" && <StatusPill kind="good">Won</StatusPill>}
        {c.status === "lost" && <StatusPill kind="critical">Lost</StatusPill>}
        {c.status === "deleted" && <StatusPill kind="neutral">Deleted in GHL</StatusPill>}
        {c.niche && <Badge>{c.niche}</Badge>}
        {c.lead_bucket && <Badge>Bucket {c.lead_bucket}</Badge>}
      </div>
      <div className="tabular mt-2 flex items-center justify-between text-xs text-ink-2">
        <span>{c.monetary_value ? money(c.monetary_value) : "—"}</span>
        <span title="Days in this stage">{days != null ? `${days}d in stage` : ""}</span>
      </div>
      {(c.owner || ghl) && (
        <div className="mt-2 flex items-center justify-between border-t border-line pt-2 text-xs text-ink-3">
          <span>{c.owner ?? ""}</span>
          {ghl && (
            <a href={ghl} target="_blank" rel="noreferrer" className="text-accent hover:underline">
              Open in GHL ↗
            </a>
          )}
        </div>
      )}
    </article>
  );
}
