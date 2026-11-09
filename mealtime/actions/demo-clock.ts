import { defineAction } from "@agent-native/core/action";
import { z } from "zod";

import { anyOut, kitchenArg } from "../server/lib/action-args.js";
import { addLog, computePlan, kitchenNow, mutateKitchen } from "../server/lib/kitchen.js";

const QUARTER = 15 * 60_000;

export default defineAction({
  description: "Host controls for the clock: start cooking now (moves dinner so the first step starts now), or skip the demo clock ahead to watch the plan move.",
  schema: z.object({
    kitchen: kitchenArg,
    mode: z.enum(["start-now", "skip", "reset"]).describe('"start-now", "skip" or "reset"'),
    minutes: z.number().int().min(5).max(120).default(15),
  }),
  outputSchema: anyOut,
  agentTool: false,
  run: async ({ kitchen, mode, minutes }) => {
    await mutateKitchen(kitchen, { hostOnly: true }, (doc) => {
      if (mode === "skip") {
        doc.clockOffsetMs = (doc.clockOffsetMs ?? 0) + minutes * 60_000;
        addLog(doc, "Host", "timeline", `Demo clock: skipped ahead ${minutes} min`);
      } else if (mode === "reset") {
        doc.clockOffsetMs = 0;
        addLog(doc, "Host", "timeline", "Demo clock back to real time");
      } else {
        const plan = computePlan(doc);
        const length = plan.serveAt - plan.firstStart;
        doc.serveAt = Math.ceil((kitchenNow(doc) + length) / QUARTER) * QUARTER;
        addLog(doc, "Host", "timeline", "Starting now: dinner time moved to fit the plan");
      }
    });
    return { ok: true };
  },
});
