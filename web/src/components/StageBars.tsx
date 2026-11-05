import { useState } from "react";
import type { Customer, Stage } from "../lib/types";
import { daysSince, money } from "../lib/format";

/** Single-series horizontal bars: open deals per pipeline stage (one hue, direct labels, hover detail). */
export default function StageBars({ stages, customers }: { stages: Stage[]; customers: Customer[] }) {
  const [hover, setHover] = useState<string | null>(null);
  const open = customers.filter((c) => c.status === "open");
  const data = stages.map((s) => {
    const inStage = open.filter((c) => c.stage_id === s.ghl_stage_id);
    const days = inStage.map((c) => daysSince(c.stage_changed_at)).filter((d): d is number => d != null);
    return {
      id: s.ghl_stage_id,
      name: s.name,
      count: inStage.length,
      value: inStage.reduce((sum, c) => sum + Number(c.monetary_value ?? 0), 0),
      avgDays: days.length ? Math.round(days.reduce((a, b) => a + b, 0) / days.length) : null,
    };
  });
  const max = Math.max(1, ...data.map((d) => d.count));

  return (
    <div className="space-y-1" role="table" aria-label="Open deals by stage">
      {data.map((d) => (
        <div
          key={d.id}
          role="row"
          className="group relative grid grid-cols-[minmax(0,10rem)_1fr_2.5rem] items-center gap-3 rounded-md px-1 py-1 hover:bg-surface-2"
          onMouseEnter={() => setHover(d.id)}
          onMouseLeave={() => setHover(null)}
        >
          <span role="cell" className="truncate text-sm text-ink-2">{d.name}</span>
          <span role="cell" className="h-4">
            {d.count > 0 && (
              <span
                className="block h-full rounded-r-[4px] bg-series-1"
                style={{ width: `${(d.count / max) * 100}%`, minWidth: 4 }}
              />
            )}
          </span>
          <span role="cell" className="tabular text-right text-sm font-medium">{d.count}</span>
          {hover === d.id && (
            <div className="pointer-events-none absolute left-40 top-full z-10 mt-1 rounded-lg border border-line bg-surface px-3 py-2 text-xs shadow-lg">
              <div className="font-semibold">{d.name}</div>
              <div className="tabular mt-1 text-ink-2">
                {d.count} open · {money(d.value)} value{d.avgDays != null ? ` · avg ${d.avgDays}d in stage` : ""}
              </div>
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
