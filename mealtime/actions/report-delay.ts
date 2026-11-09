import { defineAction } from "@agent-native/core/action";
import { z } from "zod";

import { anyOut, kitchenArg } from "../server/lib/action-args.js";
import { addLog, kitchenNow, computePlan, mutateKitchen, newId } from "../server/lib/kitchen.js";

export default defineAction({
  description:
    "Something is running late: add minutes to a step (e.g. 'the potatoes need 10 more minutes'). Cooks and the host can both do this. The plan reflows at once; if dinner would be later than planned, a serving-time change is queued for the host to approve instead of being applied.",
  schema: z.object({
    kitchen: kitchenArg,
    stepId: z.string().describe("The step that is late, usually the one on screen"),
    extraMinutes: z.number().int().min(1).max(240),
    by: z.string().default("Agent"),
    via: z.enum(["timeline", "phone", "agent", "voice", "mcp"]).default("agent"),
  }),
  outputSchema: anyOut,
  mcpTool: true,
  mcpAnnotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: false },
  run: async ({ kitchen, stepId, extraMinutes, by, via }) => {
    let slip = 0;
    await mutateKitchen(kitchen, {}, (doc) => {
      const s = doc.steps.find((x) => x.id === stepId);
      if (!s) throw new Error(`No step ${stepId}`);
      s.minutes += extraMinutes;
      if (!s.startedAt && !s.doneAt) s.startedAt = kitchenNow(doc);
      addLog(doc, by, via, `${s.label} needs ${extraMinutes} more min`);
      const plan = computePlan(doc);
      slip = plan.slipMinutes;
      if (slip > 0 && !doc.approvals.some((a) => a.status === "pending" && a.change.kind === "serve-time")) {
        doc.approvals.push({
          id: newId(5), status: "pending", requestedBy: by, createdAt: Date.now(),
          summary: `Dinner would be ${slip} min late. Move serving time?`,
          change: { kind: "serve-time", serveAt: plan.projectedServeAt },
        });
      }
    });
    return { ok: true, dinnerSlipsBy: slip, needsHostApproval: slip > 0 };
  },
});
