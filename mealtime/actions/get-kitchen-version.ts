import { defineAction } from "@agent-native/core/action";
import { z } from "zod";

import { kitchenArg } from "../server/lib/action-args.js";
import { loadKitchen } from "../server/lib/kitchen.js";

export default defineAction({
  description: "Cheap poll: the kitchen's current version number, so phones know when to refetch.",
  schema: z.object({ kitchen: kitchenArg }),
  outputSchema: z.object({ version: z.number() }),
  http: { method: "GET" },
  agentTool: false,
  persistInBrowser: false,
  run: async ({ kitchen }) => ({ version: (await loadKitchen(kitchen)).row.version }),
});
