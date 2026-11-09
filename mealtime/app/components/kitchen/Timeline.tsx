import { fmtTime, type PlanStep } from "@/lib/kitchen-client";

interface Props {
  steps: PlanStep[];
  cooks: string[];
  serveAt: number;
  projectedServeAt: number;
  now: number;
  selectedId?: string;
  onSelect: (id: string) => void;
}

const MIN = 60_000;

/** One lane per cook (hands-on work), plus the oven and the stovetop. */
export function Timeline({ steps, cooks, serveAt, projectedServeAt, now, selectedId, onSelect }: Props) {
  if (!steps.length) return null;
  const start = Math.min(...steps.map((s) => s.start), now);
  const end = Math.max(projectedServeAt, ...steps.map((s) => s.end)) + 10 * MIN;
  const span = end - start;
  const pct = (t: number) => `${((t - start) / span) * 100}%`;

  const lanes: { name: string; items: PlanStep[] }[] = [
    ...cooks.map((c) => ({ name: c, items: steps.filter((s) => s.handsOn && s.assignedCook === c) })),
    { name: "Oven", items: steps.filter((s) => s.need === "oven") },
    { name: "Stovetop", items: steps.filter((s) => s.need === "burner" && !s.handsOn) },
    { name: "Waiting", items: steps.filter((s) => s.need === "none" && !s.handsOn) },
  ].filter((l) => l.items.length);

  const ticks: number[] = [];
  const first = Math.ceil(start / (30 * MIN)) * 30 * MIN;
  for (let t = first; t < end; t += 30 * MIN) ticks.push(t);

  return (
    <div className="relative select-none overflow-x-auto rounded-lg border bg-card">
      <div className="relative min-w-[720px]">
        <div className="relative ml-24 h-6 border-b text-[11px] text-muted-foreground">
          {ticks.map((t) => (
            <span key={t} className="absolute -translate-x-1/2 pt-1" style={{ left: pct(t) }}>
              {fmtTime(t)}
            </span>
          ))}
        </div>
        {lanes.map((lane) => (
          <div key={lane.name} className="flex border-b last:border-b-0">
            <div className="w-24 shrink-0 border-r px-2 py-2 text-xs font-medium">{lane.name}</div>
            <div className="relative h-12 flex-1">
              {lane.items.map((s) => (
                <button
                  key={`${lane.name}-${s.id}`}
                  type="button"
                  onClick={() => onSelect(s.id)}
                  title={`${s.dishName}: ${s.label} (${fmtTime(s.start)}–${fmtTime(s.end)})`}
                  className={[
                    "absolute top-1.5 h-9 overflow-hidden rounded px-1.5 text-left text-[11px] leading-tight",
                    s.state === "done" ? "bg-muted text-muted-foreground line-through" : "bg-primary/15 text-foreground",
                    s.state === "running" ? "ring-2 ring-amber-500" : "",
                    s.timeSource === "estimate" && !s.confirmed ? "border border-dashed border-amber-600" : "border border-primary/30",
                    selectedId === s.id ? "outline outline-2 outline-offset-1 outline-foreground" : "",
                  ].join(" ")}
                  style={{ left: pct(s.start), width: `max(6px, calc(${pct(s.end)} - ${pct(s.start)}))` }}
                >
                  <span className="block truncate font-medium">{s.label}</span>
                  <span className="block truncate text-muted-foreground">{s.dishName}</span>
                </button>
              ))}
            </div>
          </div>
        ))}
        <div className="pointer-events-none absolute inset-y-0 left-24 right-0">
          <div className="absolute inset-y-0 w-px bg-red-500" style={{ left: pct(now) }} title="Now" />
          <div className="absolute inset-y-0 w-0.5 bg-emerald-600" style={{ left: pct(serveAt) }} title="Dinner" />
          {projectedServeAt !== serveAt ? (
            <div className="absolute inset-y-0 w-0.5 border-l-2 border-dashed border-red-600" style={{ left: pct(projectedServeAt) }} />
          ) : null}
        </div>
      </div>
    </div>
  );
}
