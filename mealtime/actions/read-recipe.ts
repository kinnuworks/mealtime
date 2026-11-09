import { defineAction } from "@agent-native/core/action";
import { z } from "zod";

import { anyOut, kitchenArg } from "../server/lib/action-args.js";
import { loadKitchen } from "../server/lib/kitchen.js";

export default defineAction({
  description:
    "Read one dish's full recipe text (numbered instructions and ingredients) and the times the recipe itself states. Use before set-dish-steps so every step can quote its sentence.",
  schema: z.object({ kitchen: kitchenArg, dishId: z.string().describe("Dish id from get-kitchen") }),
  outputSchema: anyOut,
  http: { method: "GET" },
  mcpTool: true,
  run: async ({ kitchen, dishId }) => {
    const { row } = await loadKitchen(kitchen);
    const d = row.doc.dishes.find((x) => x.id === dishId);
    if (!d) throw new Error(`No dish ${dishId}`);
    return {
      id: d.id,
      name: d.name,
      stated: d.stated ?? null,
      ingredients: d.ingredients,
      instructions: d.instructions.map((t, i) => `${i + 1}. ${t}`),
    };
  },
});
