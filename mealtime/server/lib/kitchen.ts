import { randomBytes } from "node:crypto";

import { eq, or } from "drizzle-orm";

import { getDb, schema } from "../db/index.js";
import { schedule, type Need, type SchedStep } from "./scheduler.js";

export type TimeSource = "quoted" | "estimate" | "host";

export interface Dish {
  id: string;
  name: string;
  sourceUrl?: string;
  site?: string;
  stated?: { prep?: number; cook?: number; total?: number };
  ingredients: string[];
  instructions: string[];
  status: "needs-steps" | "ready";
}

export interface KStep {
  id: string;
  dishId: string;
  label: string;
  minutes: number;
  quote?: string;
  timeSource: TimeSource;
  confirmed: boolean;
  need: Need;
  temp?: number;
  handsOn: boolean;
  after: string[];
  cook?: string;
  pinnedStart?: number; // epoch ms
  startedAt?: number;
  doneAt?: number;
}

export interface Approval {
  id: string;
  summary: string;
  change:
    | { kind: "serve-time"; serveAt: number }
    | { kind: "reassign"; stepId: string; cook: string };
  requestedBy: string;
  createdAt: number;
  status: "pending" | "approved" | "declined";
}

export interface LogEntry {
  at: number;
  by: string; // "Host", "Sam", "Agent"
  via: "timeline" | "phone" | "agent" | "voice" | "mcp";
  text: string;
}

export interface KitchenDoc {
  title: string;
  serveAt: number;
  units: "F" | "C";
  ovens: number;
  ovenSlots: number;
  burners: number;
  tempTolerance: number;
  cooks: string[];
  dishes: Dish[];
  steps: KStep[];
  approvals: Approval[];
  log: LogEntry[];
  /** Demo clock: minutes skipped ahead so a judge can watch the plan move. */
  clockOffsetMs?: number;
}

export const kitchenNow = (doc: KitchenDoc) => Date.now() + (doc.clockOffsetMs ?? 0);

export type Role = "host" | "cook";

export interface KitchenRow {
  id: string;
  hostKey: string;
  cookKey: string;
  version: number;
  doc: KitchenDoc;
}

export const newId = (n = 6) => randomBytes(n).toString("base64url");
const MIN = 60_000;

export async function loadKitchen(key: string): Promise<{ row: KitchenRow; role: Role }> {
  if (!key || key.length < 10) throw new Error("Unknown kitchen link");
  const db = getDb();
  const rows = await db
    .select()
    .from(schema.kitchens)
    .where(or(eq(schema.kitchens.hostKey, key), eq(schema.kitchens.cookKey, key)))
    .limit(1);
  const r = rows[0];
  if (!r) throw new Error("Unknown kitchen link");
  return {
    row: { id: r.id, hostKey: r.hostKey, cookKey: r.cookKey, version: r.version, doc: r.data as KitchenDoc },
    role: r.hostKey === key ? "host" : "cook",
  };
}

export async function createKitchen(doc: KitchenDoc) {
  const id = newId(8);
  const hostKey = `h${newId(12)}`;
  const cookKey = `c${newId(12)}`;
  const now = new Date().toISOString();
  await getDb().insert(schema.kitchens).values({ id, hostKey, cookKey, data: doc, version: 1, createdAt: now, updatedAt: now });
  return { id, hostKey, cookKey };
}

/** Load, change and save a kitchen in one step, with a log line. */
export async function mutateKitchen(
  key: string,
  opts: { hostOnly?: boolean },
  fn: (doc: KitchenDoc, role: Role) => string | void,
) {
  const { row, role } = await loadKitchen(key);
  if (opts.hostOnly && role !== "host") throw new Error("Only the host can change the plan. Cooks can mark steps done or report delays.");
  const doc = structuredClone(row.doc);
  fn(doc, role);
  doc.log = doc.log.slice(-200);
  await getDb()
    .update(schema.kitchens)
    .set({ data: doc, version: row.version + 1, updatedAt: new Date().toISOString() })
    .where(eq(schema.kitchens.id, row.id));
  return { doc, role, version: row.version + 1 };
}

export function addLog(doc: KitchenDoc, by: string, via: LogEntry["via"], text: string) {
  doc.log.push({ at: kitchenNow(doc), by, via, text });
}

/** True when the quote is really in the recipe and mentions the minutes used. */
export function verifyQuote(dish: Dish, quote: string | undefined, minutes: number): boolean {
  if (!quote) return false;
  const norm = (s: string) => s.toLowerCase().replace(/[–—]/g, "-").replace(/\s+/g, " ").trim();
  const q = norm(quote);
  if (q.length < 6) return false;
  const text = norm(dish.instructions.join(" "));
  if (!text.includes(q)) return false;
  // Every number in the quote, with hours turned into minutes.
  const nums: number[] = [];
  const re = /(\d+(?:\.\d+)?)(?:\s*(?:-|to)\s*(\d+(?:\.\d+)?))?\s*(hours?|hrs?|h\b|minutes?|mins?|m\b)?/g;
  for (const m of q.matchAll(re)) {
    const unit = m[3] ?? "";
    const mult = /^h/.test(unit) ? 60 : 1;
    nums.push(Number(m[1]) * mult);
    if (m[2]) nums.push(Number(m[2]) * mult);
  }
  return nums.some((n) => Math.abs(n - minutes) <= Math.max(1, n * 0.05)) ||
    (nums.length >= 2 && minutes >= Math.min(...nums) && minutes <= Math.max(...nums));
}

export interface PlanStep extends KStep {
  start: number; // epoch ms
  end: number;
  assignedCook?: string;
  oven?: number;
  dishName: string;
  state: "done" | "running" | "next" | "later";
}

export interface Plan {
  steps: PlanStep[];
  serveAt: number;
  projectedServeAt: number;
  slipMinutes: number;
  firstStart: number;
  conflicts: { id: string; reason: string }[];
  timeCheck: { dishId: string; dishName: string; planned: number; stated?: number; ok: boolean | null }[];
}

const SLIP_GRACE = 2;

export function computePlan(doc: KitchenDoc, nowMs = kitchenNow(doc)): Plan {
  const rel = (t: number) => (t - doc.serveAt) / MIN;
  // A step that hasn't been marked but comes before one that's already cooking
  // must be finished: place it just before, and call it done.
  const byId = new Map(doc.steps.map((s) => [s.id, s]));
  const impliedEnd = new Map<string, number>();
  const mark = (id: string, endMs: number) => {
    for (const prevId of byId.get(id)?.after ?? []) {
      const prev = byId.get(prevId);
      if (!prev || prev.startedAt || prev.doneAt) continue;
      const end = Math.min(endMs, impliedEnd.get(prevId) ?? Infinity);
      impliedEnd.set(prevId, end);
      mark(prevId, end - prev.minutes * MIN);
    }
  };
  for (const s of doc.steps) if (s.startedAt) mark(s.id, s.startedAt);
  const steps: SchedStep[] = doc.steps.map((s) => {
    const base: SchedStep = { id: s.id, minutes: Math.max(1, Math.round(s.minutes)), need: s.need, temp: s.temp, handsOn: s.handsOn, after: s.after, cook: s.cook };
    const ie = impliedEnd.get(s.id);
    if (ie !== undefined) return { ...base, fixedStart: rel(ie) - base.minutes, fixedEnd: rel(ie) };
    if (s.doneAt && s.startedAt) return { ...base, fixedStart: rel(s.startedAt), fixedEnd: rel(s.doneAt) };
    if (s.startedAt) return { ...base, fixedStart: rel(s.startedAt), fixedEnd: Math.max(rel(s.startedAt) + base.minutes, rel(nowMs)) };
    if (s.pinnedStart) return { ...base, fixedStart: rel(s.pinnedStart), pinned: true };
    return base;
  });
  const anyStarted = doc.steps.some((s) => s.startedAt);
  const nowRel = anyStarted || nowMs > doc.serveAt - 36 * 60 * MIN ? rel(nowMs) : -Infinity;
  const r = schedule(steps, { ovens: doc.ovens, ovenSlots: doc.ovenSlots, burners: doc.burners, cooks: doc.cooks, tempTolerance: doc.tempTolerance }, nowRel);
  const dishName = new Map(doc.dishes.map((d) => [d.id, d.name]));
  const placed = new Map(r.placed.map((p) => [p.id, p]));
  const abs = (m: number) => doc.serveAt + m * MIN;
  const out: PlanStep[] = doc.steps.map((s) => {
    const p = placed.get(s.id);
    return { ...s, start: p ? abs(p.start) : doc.serveAt, end: p ? abs(p.end) : doc.serveAt, assignedCook: p?.cook ?? s.cook, oven: p?.oven, dishName: dishName.get(s.dishId) ?? "", state: "later" as const };
  }).sort((a, b) => a.start - b.start);
  const nextByCook = new Set<string>();
  for (const s of out) {
    if (s.doneAt || impliedEnd.has(s.id)) s.state = "done";
    else if (s.startedAt) s.state = "running";
    else {
      const who = s.assignedCook ?? "Anyone";
      if (!nextByCook.has(who)) { s.state = "next"; nextByCook.add(who); }
    }
  }
  const timeCheck = doc.dishes.map((d) => {
    const planned = doc.steps.filter((s) => s.dishId === d.id).reduce((a, s) => a + s.minutes, 0);
    const stated = d.stated?.total ?? ((d.stated?.prep ?? 0) + (d.stated?.cook ?? 0) || undefined);
    return { dishId: d.id, dishName: d.name, planned, stated, ok: stated ? Math.abs(planned - stated) <= Math.max(15, stated * 0.25) : null };
  });
  return {
    steps: out,
    serveAt: doc.serveAt,
    // A minute or two of drift isn't "late": nobody reschedules dinner over it.
    projectedServeAt: doc.serveAt + (r.slip > SLIP_GRACE ? r.slip : 0) * MIN,
    slipMinutes: r.slip > SLIP_GRACE ? r.slip : 0,
    firstStart: out[0]?.start ?? doc.serveAt,
    conflicts: r.conflicts,
    timeCheck,
  };
}
