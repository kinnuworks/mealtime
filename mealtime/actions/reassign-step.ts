import { defineAction } from "@agent-native/core/action";
import { z } from "zod";

import { anyOut, kitchenArg } from "../server/lib/action-args.js";
import { addLog, mutateKitchen } from "../server/lib/kitchen.js";

export default defineAction({
  description:
    "Hand a hands-on step to a different cook. When the agent or an outside assistant calls it, the host is asked to approve first.",
  schema: z.object({
    kitchen: kitchenArg,
    stepId: z.string(),
    cook: z.string().describe("Cook name from the kitchen's cooks"),
    by: z.string().default("Agent"),
    via: z.enum(["timeline", "agent", "voice", "mcp"]).default("agent"),
  }),
  outputSchema: anyOut,
  mcpTool: true,
  mcpAnnotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: false },
  needsApproval: (_args, ctx) => ctx?.caller !== "frontend",
  run: async ({ kitchen, stepId, cook, by, via }) => {
    await mutateKitchen(kitchen, { hostOnly: true }, (doc) => {
      if (!doc.cooks.includes(cook)) throw new Error(`No cook named ${cook}`);
      const s = doc.steps.find((x) => x.id === stepId);
      if (!s) throw new Error(`No step ${stepId}`);
      s.cook = cook;
      addLog(doc, by, via, `${s.label} handed to ${cook}`);
    });
    return { ok: true };
  },
});
