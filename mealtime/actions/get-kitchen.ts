import { defineAction } from "@agent-native/core/action";
import { z } from "zod";

import { anyOut, kitchenArg } from "../server/lib/action-args.js";
import { computePlan, loadKitchen } from "../server/lib/kitchen.js";

export default defineAction({
  description:
    "Read a kitchen: dishes, every step with its scheduled start/end (epoch ms), assigned cook, time source (quoted/estimate/host) and quote, pending approvals, recent activity, projected serving time and the per-dish time check. Call this before changing a plan.",
  schema: z.object({ kitchen: kitchenArg }),
  outputSchema: anyOut,
  http: { method: "GET" },
  mcpTool: true,
  persistInBrowser: false,
  run: async ({ kitchen }) => {
    const { row, role } = await loadKitchen(kitchen);
    const plan = computePlan(row.doc);
    return {
      role,
      version: row.version,
      now: Date.now(),
      cookKey: role === "host" ? row.cookKey : undefined,
      title: row.doc.title,
      units: row.doc.units,
      kitchenSetup: { ovens: row.doc.ovens, ovenSlots: row.doc.ovenSlots, burners: row.doc.burners, tempTolerance: row.doc.tempTolerance, cooks: row.doc.cooks },
      dishes: row.doc.dishes.map(({ instructions, ingredients, ...d }) => ({ ...d, instructionCount: instructions.length })),
      approvals: row.doc.approvals.filter((a) => a.status === "pending"),
      log: row.doc.log.slice(-30).reverse(),
      plan,
    };
  },
});
