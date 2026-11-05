import { Link } from "react-router";
import { useCalls, useCustomers, useRuns, useStages, useSyncNow, useTools } from "../lib/queries";
import { ago, money } from "../lib/format";
import { Button, Card, Empty, ErrorBox, PageHeader, StatTile } from "../components/ui";
import StageBars from "../components/StageBars";
import RunsTable from "../components/RunsTable";

const isRecurringStage = (name?: string) => !!name && /live|retainer/i.test(name);

export default function Dashboard() {
  const tools = useTools();
  const stages = useStages();
  const customers = useCustomers();
  const runs = useRuns({ limit: 10 });
  const calls = useCalls();
  const sync = useSyncNow();

  const t = tools.data ?? [];
  const ready = t.filter((x) => x.is_ready).length;
  const runRate = t.reduce((s, x) => s + Number(x.monthly_base_usd), 0);

  const c = customers.data ?? [];
  const stageName = (id: string | null) => stages.data?.find((s) => s.ghl_stage_id === id)?.name;
  const recurring = c.filter((x) => x.status !== "lost" && x.status !== "deleted" && isRecurringStage(stageName(x.stage_id)));
  const mrr = recurring.reduce((s, x) => s + Number(x.monthly_retainer ?? 0), 0);
  const open = c.filter((x) => x.status === "open");
  const openValue = open.reduce((s, x) => s + Number(x.monetary_value ?? 0), 0);

  const monthAgo = Date.now() - 30 * 86400000;
  const recentCalls = (calls.data ?? []).filter((x) => new Date(x.created_at).getTime() > monthAgo);
  const scored = recentCalls.filter((x) => x.qualified != null);
  const qualifiedPct = scored.length ? Math.round((scored.filter((x) => x.qualified).length / scored.length) * 100) : null;

  const lastSync = c.reduce<string | null>((m, x) => (x.synced_at && (!m || x.synced_at > m) ? x.synced_at : m), null);

  return (
    <>
      <PageHeader
        title="Dashboard"
        subtitle={<>Pipeline synced from GoHighLevel {ago(lastSync)}</>}
        actions={
          <Button onClick={() => sync.mutate()} disabled={sync.isPending}>
            {sync.isPending ? "Syncing…" : "↻ Sync now"}
          </Button>
        }
      />
      <div className="mb-4 space-y-2">
        <ErrorBox error={sync.error} />
        <ErrorBox error={tools.error ?? customers.error ?? stages.error} />
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatTile label="Stack readiness" value={`${ready} / ${t.length}`} sub={<Link to="/tools" className="hover:underline">tools up & running →</Link>}>
          <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-surface-2" role="progressbar" aria-valuenow={ready} aria-valuemax={t.length}>
            <div className="h-full rounded-full bg-series-1" style={{ width: `${t.length ? (ready / t.length) * 100 : 0}%` }} />
          </div>
        </StatTile>
        <StatTile label="MRR" value={money(mrr)} sub={`${recurring.length} live / retainer clients`} />
        <StatTile label="Open pipeline" value={open.length} sub={`${money(openValue)} in GHL opportunity value`} />
        <StatTile
          label="AI calls · 30 days"
          value={recentCalls.length}
          sub={qualifiedPct != null ? `${qualifiedPct}% qualified` : "no scored calls yet"}
        />
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-5">
        <Card title="Open deals by stage" className="lg:col-span-3" actions={<Link to="/pipeline" className="text-xs text-accent hover:underline">Pipeline →</Link>}>
          {stages.data?.length ? (
            <StageBars stages={stages.data} customers={c} />
          ) : (
            <Empty>
              No pipeline synced yet. Finish the <Link to="/setup" className="text-accent underline">GHL setup</Link>, then hit Sync now.
            </Empty>
          )}
          {!!c.filter((x) => x.status === "lost").length && (
            <p className="mt-3 text-xs text-ink-3">{c.filter((x) => x.status === "lost").length} lost / churned (not shown)</p>
          )}
        </Card>
        <Card title="Monthly cost vs revenue" className="lg:col-span-2">
          <dl className="space-y-3 text-sm">
            <Row label="Fixed tool run-rate" value={`${money(runRate)}/mo`} />
            <Row label="MRR" value={`${money(mrr)}/mo`} />
            <div className="border-t border-line pt-3">
              <Row label="Net before usage costs" value={`${money(mrr - runRate)}/mo`} strong />
            </div>
          </dl>
          <p className="mt-3 text-xs text-ink-3">Usage costs (Vapi minutes, SMS, numbers) are billed per client on top.</p>
        </Card>
      </div>

      <Card title="Recent automation runs" className="mt-4" actions={<Link to="/automations" className="text-xs text-accent hover:underline">All runs →</Link>}>
        <RunsTable runs={runs.data ?? []} compact />
      </Card>
    </>
  );
}

function Row({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <div className="flex items-baseline justify-between gap-4">
      <dt className="text-ink-2">{label}</dt>
      <dd className={strong ? "tabular font-semibold" : "tabular"}>{value}</dd>
    </div>
  );
}
