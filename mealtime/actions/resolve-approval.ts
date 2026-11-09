import { defineAction } from "@agent-native/core/action";
import { z } from "zod";

import { anyOut, kitchenArg } from "../server/lib/action-args.js";
import { addLog, mutateKitchen } from "../server/lib/kitchen.js";

export default defineAction({
  description: "Host approves or declines a pending change card.",
  schema: z.object({ kitchen: kitchenArg, approvalId: z.string(), approve: z.boolean() }),
  outputSchema: anyOut,
  agentTool: false,
  run: async ({ kitchen, approvalId, approve }) => {
    await mutateKitchen(kitchen, { hostOnly: true }, (doc) => {
      const a = doc.approvals.find((x) => x.id === approvalId && x.status === "pending");
      if (!a) throw new Error("That card was already handled");
      a.status = approve ? "approved" : "declined";
      if (approve && a.change.kind === "serve-time") doc.serveAt = a.change.serveAt;
      if (approve && a.change.kind === "reassign") {
        const ch = a.change;
        const s = doc.steps.find((x) => x.id === ch.stepId);
        if (s) s.cook = ch.cook;
      }
      addLog(doc, "Host", "timeline", `${approve ? "Approved" : "Declined"}: ${a.summary}`);
    });
    return { ok: true };
  },
});
