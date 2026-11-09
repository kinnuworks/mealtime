import { defineAction } from "@agent-native/core/action";
import { z } from "zod";

import { DEMO_DISHES, DEMO_STEPS } from "../server/lib/demo-menu.js";
import { createKitchen, type KitchenDoc } from "../server/lib/kitchen.js";

const QUARTER = 15 * 60_000;

export default defineAction({
  description: "Make a new kitchen: a copy of the Thanksgiving demo menu, or an empty one. Returns the host and cook link keys.",
  schema: z.object({
    demo: z.boolean().default(true).describe("True for the demo Thanksgiving menu, false for an empty kitchen"),
    serveAt: z.number().optional().describe("Serving time, epoch ms. Defaults to about 4.5 hours from now"),
  }),
  outputSchema: z.object({ hostKey: z.string(), cookKey: z.string() }),
  agentTool: false,
  run: async ({ demo, serveAt }) => {
    const at = serveAt ?? Math.ceil((Date.now() + 4.5 * 3600_000) / QUARTER) * QUARTER;
    const doc: KitchenDoc = {
      title: demo ? "Thanksgiving dinner" : "Dinner",
      serveAt: at,
      units: "F",
      ovens: 1,
      ovenSlots: 2,
      burners: 4,
      tempTolerance: 25,
      cooks: ["You", "Sam"],
      dishes: demo ? structuredClone(DEMO_DISHES) : [],
      steps: demo ? structuredClone(DEMO_STEPS) : [],
      approvals: [],
      log: [{ at: Date.now(), by: "Host", via: "timeline", text: demo ? "Opened the demo kitchen" : "Started a new kitchen" }],
    };
    const { hostKey, cookKey } = await createKitchen(doc);
    return { hostKey, cookKey };
  },
});
