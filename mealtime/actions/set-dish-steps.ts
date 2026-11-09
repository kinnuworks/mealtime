import { defineAction } from "@agent-native/core/action";
import { z } from "zod";

import { anyOut, kitchenArg } from "../server/lib/action-args.js";
import { addLog, mutateKitchen, newId, verifyQuote, type KStep } from "../server/lib/kitchen.js";

const step = z.object({
  label: z.string().describe("Short imperative step, e.g. 'Roast turkey'"),
  minutes: z.number().positive().describe("Duration in minutes"),
  quote: z
    .string()
    .optional()
    .describe("Exact sentence or phrase copied word for word from the recipe instructions that states this step's time, e.g. 'bake for 25 to 30 minutes'. Omit if the recipe gives no time for this step; it will be marked as an estimate."),
  need: z.enum(["oven", "burner", "none"]).describe('What the step occupies: "oven", "burner" or "none" (counter/fridge/resting)'),
  temp: z.number().optional().describe("Oven temperature in the kitchen's units, for oven steps"),
  handsOn: z.boolean().describe("True if a cook must actively work for the whole step; false for waiting (roasting, resting, chilling)"),
  afterPrevious: z.boolean().default(true).describe("True if this step must wait for the previous step in this list (default true)"),
});

export default defineAction({
  description:
    "Replace a dish's steps. Every duration should carry the exact recipe quote it came from; code verifies each quote against the recipe and marks unverified ones as estimates for the host to confirm. Host link only.",
  schema: z.object({ kitchen: kitchenArg, dishId: z.string(), steps: z.array(step).min(1).max(20), by: z.string().default("Agent").describe("Who is making the change") }),
  outputSchema: anyOut,
  mcpTool: true,
  mcpAnnotations: { readOnlyHint: false, destructiveHint: true, openWorldHint: false },
  run: async ({ kitchen, dishId, steps, by }) => {
    const report: { label: string; minutes: number; timeSource: string }[] = [];
    await mutateKitchen(kitchen, { hostOnly: true }, (doc) => {
      const dish = doc.dishes.find((d) => d.id === dishId);
      if (!dish) throw new Error(`No dish ${dishId}`);
      doc.steps = doc.steps.filter((s) => s.dishId !== dishId);
      let prev: string | undefined;
      for (const s of steps) {
        const ok = verifyQuote(dish, s.quote, s.minutes);
        const k: KStep = {
          id: newId(5), dishId, label: s.label, minutes: Math.round(s.minutes),
          quote: ok ? s.quote : undefined, timeSource: ok ? "quoted" : "estimate", confirmed: ok,
          need: s.need, temp: s.need === "oven" ? s.temp : undefined, handsOn: s.handsOn,
          after: s.afterPrevious && prev ? [prev] : [],
        };
        doc.steps.push(k);
        prev = k.id;
        report.push({ label: k.label, minutes: k.minutes, timeSource: k.timeSource });
      }
      dish.status = "ready";
      const q = report.filter((r) => r.timeSource === "quoted").length;
      addLog(doc, by, by === "Agent" ? "agent" : "timeline", `Split ${dish.name} into ${steps.length} steps (${q} times quoted from the recipe, ${steps.length - q} estimates to confirm)`);
    });
    return { ok: true, steps: report };
  },
});
