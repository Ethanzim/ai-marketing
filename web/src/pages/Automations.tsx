import { useState } from "react";
import { useRuns, useSyncNow } from "../lib/queries";
import { Button, Card, ErrorBox, Loading, PageHeader } from "../components/ui";
import RunsTable from "../components/RunsTable";

const FUNCTIONS = ["all", "ghl-sync", "lead-intake", "vapi-callback"];

export default function Automations() {
  const runs = useRuns({ limit: 300 });
  const sync = useSyncNow();
  const [fn, setFn] = useState("all");
  const [onlyErrors, setOnlyErrors] = useState(false);

  const list = (runs.data ?? []).filter((r) => (fn === "all" || r.function_name === fn) && (!onlyErrors || r.status === "error"));
  const errors = (runs.data ?? []).filter((r) => r.status === "error").length;

  return (
    <>
      <PageHeader
        title="Automations"
        subtitle="Every webhook and sync run (kept 90 days). Failed lead-intake / vapi-callback runs can be replayed."
        actions={
          <Button onClick={() => sync.mutate()} disabled={sync.isPending}>
            {sync.isPending ? "Syncing…" : "↻ Sync GHL now"}
          </Button>
        }
      />
      <ErrorBox error={sync.error ?? runs.error} />
      <div className="mb-4 flex flex-wrap items-center gap-2">
        {FUNCTIONS.map((f) => (
          <Button key={f} variant={fn === f ? "primary" : "secondary"} onClick={() => setFn(f)}>
            {f}
          </Button>
        ))}
        <label className="ml-2 flex items-center gap-1.5 text-sm text-ink-2">
          <input type="checkbox" checked={onlyErrors} onChange={(e) => setOnlyErrors(e.target.checked)} />
          Only failures ({errors})
        </label>
      </div>
      <Card>{runs.isLoading ? <Loading /> : <RunsTable runs={list} />}</Card>
    </>
  );
}
