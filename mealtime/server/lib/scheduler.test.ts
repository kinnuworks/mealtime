import { describe, expect, it } from "vitest";

import { schedule, type SchedStep } from "./scheduler";

const kitchen = { ovens: 1, ovenSlots: 2, burners: 4, cooks: ["You", "Sam"], tempTolerance: 25 };
const turkey: SchedStep[] = [
  { id: "t1", minutes: 20, need: "none", handsOn: true, after: [] },
  { id: "t2", minutes: 180, need: "oven", temp: 325, handsOn: false, after: ["t1"] },
  { id: "t3", minutes: 30, need: "none", handsOn: false, after: ["t2"] },
];
const pie: SchedStep = { id: "p1", minutes: 50, need: "oven", temp: 425, handsOn: false, after: [] };
const mash: SchedStep[] = [
  { id: "m1", minutes: 20, need: "burner", handsOn: false, after: [] },
  { id: "m2", minutes: 10, need: "none", handsOn: true, after: ["m1"] },
];

const at = (r: ReturnType<typeof schedule>, id: string) => r.placed.find((p) => p.id === id)!;

describe("schedule", () => {
  it("lands every dish at serving time and respects order", () => {
    const r = schedule([...turkey, ...mash], kitchen);
    expect(r.conflicts).toEqual([]);
    expect(at(r, "t3").end).toBe(0);
    expect(at(r, "m2").end).toBe(0);
    expect(at(r, "t2").end).toBeLessThanOrEqual(at(r, "t3").start);
  });

  it("never puts far-apart temperatures in one oven at once", () => {
    const r = schedule([...turkey, pie], kitchen);
    const a = at(r, "t2");
    const b = at(r, "p1");
    expect(a.start < b.end && b.start < a.end).toBe(false);
  });

  it("lets close temperatures share the oven", () => {
    const r = schedule([...turkey, { ...pie, temp: 340 }], kitchen);
    const a = at(r, "t2");
    const b = at(r, "p1");
    expect(a.start < b.end && b.start < a.end).toBe(true);
  });

  it("gives a cook only one hands-on job at a time", () => {
    const solo = { ...kitchen, cooks: ["You"] };
    const steps: SchedStep[] = [
      { id: "a", minutes: 15, need: "none", handsOn: true, after: [] },
      { id: "b", minutes: 15, need: "none", handsOn: true, after: [] },
    ];
    const r = schedule(steps, solo);
    const [x, y] = [at(r, "a"), at(r, "b")];
    expect(x.start < y.end && y.start < x.end).toBe(false);
  });

  it("slips serving time when a step would have to start in the past", () => {
    const r = schedule(turkey, kitchen, -200);
    expect(r.slip).toBe(30);
    expect(Math.min(...r.placed.map((p) => p.start))).toBeGreaterThanOrEqual(-200);
  });

  it("keeps done and running steps where they are", () => {
    const steps = turkey.map((s) => (s.id === "t1" ? { ...s, fixedStart: -260, fixedEnd: -240 } : s));
    const r = schedule(steps, kitchen, -239);
    expect(at(r, "t1").start).toBe(-260);
    expect(at(r, "t2").start).toBeGreaterThanOrEqual(-240);
  });
});
