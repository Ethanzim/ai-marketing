import { Fragment, useState } from "react";
import { Link } from "react-router";
import { useCustomers, useRerun } from "../lib/queries";
import type { AutomationRun } from "../lib/types";
import { dateTime } from "../lib/format";
import { Badge, Button, Empty, ErrorBox, StatusPill } from "./ui";

export default function RunsTable({ runs, compact = false }: { runs: AutomationRun[]; compact?: boolean }) {
  const { data: customers } = useCustomers();
  const rerun = useRerun();
  const [open, setOpen] = useState<number | null>(null);
  const name = (id: string | null) => customers?.find((c) => c.id === id)?.name;

  if (!runs.length) return <Empty>No automation runs yet. They appear here as soon as a webhook or sync fires.</Empty>;

  return (
    <div className="-mx-4 overflow-x-auto">
      <ErrorBox error={rerun.error} />
      <table className="w-full min-w-[640px] text-sm">
        <thead>
          <tr className="text-left text-xs text-ink-3">
            <th className="px-4 py-2 font-medium">When</th>
            <th className="px-2 py-2 font-medium">Function</th>
            {!compact && <th className="px-2 py-2 font-medium">Trigger</th>}
            <th className="px-2 py-2 font-medium">Client</th>
            <th className="px-2 py-2 font-medium">Result</th>
            {!compact && <th className="px-2 py-2 text-right font-medium">Time</th>}
            <th className="px-4 py-2" />
          </tr>
        </thead>
        <tbody>
          {runs.map((r) => (
            <Fragment key={r.id}>
              <tr className="border-t border-line align-top">
                <td className="tabular whitespace-nowrap px-4 py-2 text-ink-2">{dateTime(r.created_at)}</td>
                <td className="px-2 py-2 font-medium">{r.function_name}</td>
                {!compact && (
                  <td className="px-2 py-2">
                    <Badge>{r.trigger}{r.rerun_of ? ` of #${r.rerun_of}` : ""}</Badge>
                  </td>
                )}
                <td className="px-2 py-2">
                  {r.customer_id ? (
                    <Link to={`/customers/${r.customer_id}`} className="text-accent hover:underline">
                      {name(r.customer_id) ?? "client"}
                    </Link>
                  ) : (
                    <span className="text-ink-3">—</span>
                  )}
                </td>
                <td className="px-2 py-2">
                  <StatusPill kind={r.status === "success" ? "good" : "critical"}>{r.status === "success" ? "OK" : "Failed"}</StatusPill>
                  {r.error && <div className="mt-1 max-w-md truncate text-xs text-critical-text" title={r.error}>{r.error}</div>}
                </td>
                {!compact && <td className="tabular px-2 py-2 text-right text-ink-3">{r.duration_ms ?? "—"} ms</td>}
                <td className="whitespace-nowrap px-4 py-2 text-right">
                  <Button variant="ghost" onClick={() => setOpen(open === r.id ? null : r.id)}>
                    {open === r.id ? "Hide" : "Details"}
                  </Button>
                  {r.status === "error" && r.function_name !== "ghl-sync" && (
                    <Button
                      disabled={rerun.isPending}
                      onClick={() => confirm(`Re-run ${r.function_name} #${r.id} with the same payload?`) && rerun.mutate(r)}
                    >
                      Re-run
                    </Button>
                  )}
                </td>
              </tr>
              {open === r.id && (
                <tr className="bg-surface-2/60">
                  <td colSpan={7} className="px-4 py-3">
                    <div className="grid gap-3 md:grid-cols-2">
                      <Json label="Request" value={r.request} />
                      <Json label="Response" value={r.response} />
                    </div>
                  </td>
                </tr>
              )}
            </Fragment>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function Json({ label, value }: { label: string; value: unknown }) {
  return (
    <div>
      <div className="mb-1 text-xs font-medium text-ink-3">{label}</div>
      <pre className="max-h-72 overflow-auto rounded-lg border border-line bg-surface p-3 text-xs leading-relaxed">
        {JSON.stringify(value, null, 2)}
      </pre>
    </div>
  );
}
