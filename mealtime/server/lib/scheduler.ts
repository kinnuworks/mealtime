// Backward scheduler for a home kitchen. Code, not the model, decides timing.
//
// Every step is placed as late as it can go so all dishes finish at serving
// time, without double-booking an oven (temperatures must be within the
// tolerance to share), a burner, or a cook's hands. Steps that are done,
// running or pinned stay where they are. If the plan would need a step to
// start in the past, serving time slips and the result says by how much.

export type Need = "oven" | "burner" | "none";

export interface SchedStep {
  id: string;
  minutes: number;
  need: Need;
  temp?: number;
  handsOn: boolean;
  after: string[];
  cook?: string;
  /** Fixed start in minutes relative to serving time (done, running or pinned). */
  fixedStart?: number;
  fixedEnd?: number;
  pinned?: boolean;
}

export interface SchedKitchen {
  ovens: number;
  ovenSlots: number;
  burners: number;
  cooks: string[];
  tempTolerance: number;
}

export interface Placed {
  id: string;
  start: number;
  end: number;
  cook?: string;
  oven?: number;
}

export interface SchedResult {
  placed: Placed[];
  conflicts: { id: string; reason: string }[];
  /** Minutes serving time had to move later so nothing starts in the past. */
  slip: number;
}

const overlaps = (a: number, b: number, c: number, d: number) => a < d && c < b;

function placeAll(steps: SchedStep[], k: SchedKitchen, serveAt: number) {
  const byId = new Map(steps.map((s) => [s.id, s]));
  const succ = new Map<string, string[]>();
  for (const s of steps)
    for (const p of s.after)
      if (byId.has(p)) succ.set(p, [...(succ.get(p) ?? []), s.id]);

  const placed = new Map<string, Placed>();
  const conflicts: SchedResult["conflicts"] = [];

  const fits = (s: SchedStep, start: number, ignoreId?: string) => {
    const end = start + s.minutes;
    const busy = [...placed.values()].filter(
      (p) => p.id !== ignoreId && overlaps(start, end, p.start, p.end),
    );
    let cook: string | undefined;
    let oven: number | undefined;
    if (s.handsOn && k.cooks.length) {
      const pref = s.cook
        ? [s.cook, ...k.cooks.filter((c) => c !== s.cook)]
        : k.cooks;
      cook = pref.find((c) => !busy.some((p) => p.cook === c));
      if (!cook) return null;
    }
    if (s.need === "burner") {
      const used = busy.filter((p) => byId.get(p.id)?.need === "burner").length;
      if (used >= k.burners) return null;
    }
    if (s.need === "oven") {
      const temp = s.temp ?? 350;
      for (let o = 0; o < k.ovens; o++) {
        const inOven = busy.filter((p) => p.oven === o);
        const ok =
          inOven.length < k.ovenSlots &&
          inOven.every(
            (p) => Math.abs((byId.get(p.id)?.temp ?? 350) - temp) <= k.tempTolerance,
          );
        if (ok) {
          oven = o;
          break;
        }
      }
      if (oven === undefined) return null;
    }
    return { cook, oven };
  };

  // Fixed steps first: they hold their slots.
  for (const s of steps) {
    if (s.fixedStart === undefined) continue;
    const r = fits(s, s.fixedStart);
    const end = s.fixedEnd ?? s.fixedStart + s.minutes;
    if (!r && s.pinned)
      conflicts.push({ id: s.id, reason: "Pinned time clashes with another step" });
    placed.set(s.id, { id: s.id, start: s.fixedStart, end, ...(r ?? { cook: s.cook }) });
  }

  // Reverse topological order over the free steps.
  const free = steps.filter((s) => s.fixedStart === undefined);
  const waiting = new Map(
    free.map((s) => [
      s.id,
      (succ.get(s.id) ?? []).filter((n) => byId.get(n)?.fixedStart === undefined).length,
    ]),
  );
  const ready = free.filter((s) => waiting.get(s.id) === 0);
  const order: SchedStep[] = [];
  while (ready.length) {
    ready.sort((a, b) => b.minutes - a.minutes);
    const s = ready.shift()!;
    order.push(s);
    for (const p of s.after) {
      if (!waiting.has(p)) continue;
      waiting.set(p, waiting.get(p)! - 1);
      if (waiting.get(p) === 0) ready.push(byId.get(p)!);
    }
  }
  if (order.length !== free.length) throw new Error("Steps have a dependency loop");

  for (const s of order) {
    const latestEnd = Math.min(
      serveAt,
      ...(succ.get(s.id) ?? []).map((n) => placed.get(n)?.start ?? serveAt),
    );
    let done = false;
    for (let start = latestEnd - s.minutes; start >= latestEnd - s.minutes - 36 * 60; start--) {
      const r = fits(s, start);
      if (r) {
        placed.set(s.id, { id: s.id, start, end: start + s.minutes, ...r });
        done = true;
        break;
      }
    }
    if (!done) conflicts.push({ id: s.id, reason: "No free slot in the kitchen" });
  }
  return { placed, conflicts };
}

/**
 * @param now minutes relative to the requested serving time (e.g. -120 means
 *   two hours before dinner). Free steps may not start before it.
 */
export function schedule(
  steps: SchedStep[],
  k: SchedKitchen,
  now = -Infinity,
): SchedResult {
  let slip = 0;
  for (let i = 0; i < 12; i++) {
    const { placed, conflicts } = placeAll(steps, k, slip);
    const late = [...placed.values()].filter((p) => {
      const s = steps.find((x) => x.id === p.id)!;
      return s.fixedStart === undefined && p.start < now;
    });
    if (!late.length || now === -Infinity) {
      return {
        placed: [...placed.values()].sort((a, b) => a.start - b.start),
        conflicts,
        slip,
      };
    }
    slip += Math.max(1, Math.ceil(now - Math.min(...late.map((p) => p.start))));
  }
  const { placed, conflicts } = placeAll(steps, k, slip);
  return {
    placed: [...placed.values()].sort((a, b) => a.start - b.start),
    conflicts: [...conflicts, { id: "*", reason: "Could not fit the plan after the current time" }],
    slip,
  };
}
