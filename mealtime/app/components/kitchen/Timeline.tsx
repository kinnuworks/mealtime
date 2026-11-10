import type { CSSProperties } from "react";

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

/** Dish colours: data colours, so each dish reads the same in every lane. */
const DISH_COLORS = ["#5E8F5B", "#C98F22", "#8A5784", "#4F76A3", "#9C6B4E", "#3F8A86"];

export function dishColor(dishIds: string[], dishId: string): CSSProperties {
  const c = DISH_COLORS[Math.max(0, dishIds.indexOf(dishId)) % DISH_COLORS.length];
  return { ["--bar" as string]: c, ["--bar-wash" as string]: `color-mix(in oklab, ${c} 14%, #fffefc)` };
}

const icon = {
  Oven: "M4 4h16v16H4zM4 9h16M8 6.5h.01M12 6.5h.01M8 13h8v4H8z",
  Stovetop: "M5 9h14v10H5zM8 9V6M12 9V5M16 9V6",
  Waiting: "M12 7v5l3 2M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18z",
} as const;

function LaneName({ name, isCook }: { name: string; isCook: boolean }) {
  return (
    <div className="mt-lane__name">
      {isCook ? (
        <span className="av">{name.slice(0, 1).toUpperCase()}</span>
      ) : (
        <span className="ic" aria-hidden="true">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">
            <path d={icon[name as keyof typeof icon]} />
          </svg>
        </span>
      )}
      <span>{name}</span>
    </div>
  );
}

/** One lane per cook (hands-on work), plus the oven, the stovetop and waiting time. */
export function Timeline({ steps, cooks, serveAt, projectedServeAt, now, selectedId, onSelect }: Props) {
  if (!steps.length) return null;
  const start = Math.min(...steps.map((s) => s.start), now) - 5 * MIN;
  const end = Math.max(projectedServeAt, ...steps.map((s) => s.end)) + 15 * MIN;
  const span = end - start;
  const pct = (t: number) => `${((t - start) / span) * 100}%`;
  const dishIds = [...new Set(steps.map((s) => s.dishId))];

  const lanes: { name: string; isCook: boolean; items: PlanStep[] }[] = [
    ...cooks.map((c) => ({ name: c, isCook: true, items: steps.filter((s) => s.handsOn && s.assignedCook === c) })),
    { name: "Oven", isCook: false, items: steps.filter((s) => s.need === "oven") },
    { name: "Stovetop", isCook: false, items: steps.filter((s) => s.need === "burner" && !s.handsOn) },
    { name: "Waiting", isCook: false, items: steps.filter((s) => s.need === "none" && !s.handsOn) },
  ].filter((l) => l.items.length);

  const ticks: number[] = [];
  const first = Math.ceil(start / (30 * MIN)) * 30 * MIN;
  for (let t = first; t < end; t += 30 * MIN) ticks.push(t);
  const late = projectedServeAt !== serveAt;

  return (
    <div className="mt-timeline">
      <div className="mt-timeline__inner">
        <div className="mt-ticks">
          {ticks.map((t) => (
            <span key={t} style={{ left: pct(t) }}>
              {fmtTime(t)}
            </span>
          ))}
        </div>
        {lanes.map((lane) => (
          <div key={lane.name} className="mt-lane">
            <LaneName name={lane.name} isCook={lane.isCook} />
            <div className="mt-lane__track">
              {lane.items.map((s) => (
                <button
                  key={`${lane.name}-${s.id}`}
                  type="button"
                  onClick={() => onSelect(s.id)}
                  title={`${s.dishName}: ${s.label} (${fmtTime(s.start)}–${fmtTime(s.end)})`}
                  className={[
                    "mt-bar",
                    s.state === "done" ? "mt-bar--done" : "",
                    s.state === "running" ? "mt-bar--running" : "",
                    s.timeSource === "estimate" && !s.confirmed ? "mt-bar--est" : "",
                    selectedId === s.id ? "mt-bar--sel" : "",
                  ].join(" ")}
                  style={{ ...dishColor(dishIds, s.dishId), left: pct(s.start), width: `max(8px, calc(${pct(s.end)} - ${pct(s.start)} - 3px))` }}
                >
                  <b>{s.label}</b>
                  <small>{s.dishName}</small>
                </button>
              ))}
            </div>
          </div>
        ))}
        <div className="pointer-events-none absolute inset-y-0 right-0" style={{ left: 112 }}>
          <div className="mt-mark" style={{ left: pct(serveAt), ["--c" as string]: "#2f7a4a" }}>
            <span>Dinner {fmtTime(serveAt)}</span>
          </div>
          {late ? (
            <div className="mt-mark mt-mark--dash" style={{ left: pct(projectedServeAt), ["--c" as string]: "#b3261e" }}>
              <span>Now {fmtTime(projectedServeAt)}</span>
            </div>
          ) : null}
          <div className="mt-mark" style={{ left: pct(now), ["--c" as string]: "#17150f" }}>
            <span>{fmtTime(now)}</span>
          </div>
        </div>
      </div>
    </div>
  );
}
