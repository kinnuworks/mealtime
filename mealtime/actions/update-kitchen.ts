import { defineAction } from "@agent-native/core/action";
import { z } from "zod";

import { anyOut, kitchenArg } from "../server/lib/action-args.js";
import { addLog, mutateKitchen } from "../server/lib/kitchen.js";

export default defineAction({
  description:
    "Change the kitchen setup: title, number of ovens, dishes per oven, burners, oven temperature tolerance for sharing, cook names, or units. Serving time changes go through request-approval when the agent proposes them. Host link only.",
  schema: z.object({
    kitchen: kitchenArg,
    title: z.string().optional(),
    serveAt: z.number().optional().describe("Serving time, epoch ms (host UI only; the agent should use request-approval)"),
    ovens: z.number().int().min(1).max(3).optional(),
    ovenSlots: z.number().int().min(1).max(4).optional(),
    burners: z.number().int().min(1).max(8).optional(),
    tempTolerance: z.number().min(0).max(100).optional(),
    cooks: z.array(z.string().min(1).max(20)).min(1).max(6).optional(),
    units: z.enum(["F", "C"]).optional(),
    by: z.string().default("Agent"),
    via: z.enum(["timeline", "agent", "voice", "mcp"]).default("agent"),
  }),
  outputSchema: anyOut,
  mcpTool: true,
  mcpAnnotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: false },
  run: async ({ kitchen, by, via, ...patch }) => {
    await mutateKitchen(kitchen, { hostOnly: true }, (doc) => {
      if (patch.serveAt !== undefined && via !== "timeline") throw new Error("Use request-approval to move serving time");
      const changed: string[] = [];
      for (const [k, v] of Object.entries(patch)) {
        if (v === undefined) continue;
        (doc as unknown as Record<string, unknown>)[k] = v;
        changed.push(k);
      }
      addLog(doc, by, via, `Kitchen setup changed: ${changed.join(", ")}`);
    });
    return { ok: true };
  },
});
