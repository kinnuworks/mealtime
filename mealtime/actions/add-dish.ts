import { defineAction } from "@agent-native/core/action";
import { z } from "zod";

import { anyOut, kitchenArg } from "../server/lib/action-args.js";
import { addLog, mutateKitchen, newId } from "../server/lib/kitchen.js";
import { fetchRecipe, parsePastedRecipe } from "../server/lib/recipe.js";

export default defineAction({
  description:
    "Add a dish from a recipe link (read from the page's own recipe markup) or from pasted recipe text. The dish arrives without steps; follow with read-recipe and set-dish-steps. Host link only.",
  schema: z.object({
    kitchen: kitchenArg,
    url: z.string().url().optional().describe("Recipe page link"),
    text: z.string().max(20000).optional().describe("Pasted recipe: name on the first line, then the method"),
    by: z.string().default("Agent"),
    via: z.enum(["timeline", "agent", "mcp"]).default("agent"),
  }),
  outputSchema: anyOut,
  mcpTool: true,
  mcpAnnotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: true },
  run: async ({ kitchen, url, text, by, via }) => {
    if (!url && !text) throw new Error("Give a recipe link or paste the recipe text");
    const r = url ? await fetchRecipe(url) : parsePastedRecipe(text!);
    if (!r) throw new Error("That page has no recipe markup I can read. Paste the recipe text instead.");
    if (!r.instructions.length) throw new Error("I couldn't find any method steps in that text");
    const id = newId(5);
    await mutateKitchen(kitchen, { hostOnly: true }, (doc) => {
      if (doc.dishes.length >= 8) throw new Error("This kitchen already has 8 dishes");
      doc.dishes.push({ id, name: r.name, sourceUrl: r.url, site: r.site, stated: r.stated, ingredients: r.ingredients, instructions: r.instructions, status: "needs-steps" });
      addLog(doc, by, via, `Added ${r.name}${r.site ? ` from ${r.site}` : " (pasted)"}`);
    });
    return { ok: true, dishId: id, name: r.name, instructionCount: r.instructions.length, stated: r.stated };
  },
});
