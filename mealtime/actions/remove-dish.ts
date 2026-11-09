import { defineAction } from "@agent-native/core/action";
import { z } from "zod";

import { anyOut, kitchenArg } from "../server/lib/action-args.js";
import { addLog, mutateKitchen } from "../server/lib/kitchen.js";

export default defineAction({
  description: "Remove a dish and its steps from the plan. Host link only.",
  schema: z.object({ kitchen: kitchenArg, dishId: z.string(), by: z.string().default("Agent"), via: z.enum(["timeline", "agent", "mcp"]).default("agent") }),
  outputSchema: anyOut,
  mcpTool: true,
  mcpAnnotations: { readOnlyHint: false, destructiveHint: true, openWorldHint: false },
  run: async ({ kitchen, dishId, by, via }) => {
    await mutateKitchen(kitchen, { hostOnly: true }, (doc) => {
      const d = doc.dishes.find((x) => x.id === dishId);
      if (!d) throw new Error(`No dish ${dishId}`);
      doc.dishes = doc.dishes.filter((x) => x.id !== dishId);
      doc.steps = doc.steps.filter((s) => s.dishId !== dishId);
      addLog(doc, by, via, `Removed ${d.name}`);
    });
    return { ok: true };
  },
});
