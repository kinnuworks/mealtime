import { defineAction } from "@agent-native/core/action";
import { z } from "zod";

import { anyOut, kitchenArg } from "../server/lib/action-args.js";
import { addLog, mutateKitchen } from "../server/lib/kitchen.js";

export default defineAction({
  description: "Start, finish or undo a step. Cooks and the host can both do this. Everyone's timeline reflows from it.",
  schema: z.object({
    kitchen: kitchenArg,
    stepId: z.string(),
    status: z.enum(["start", "done", "undo"]).describe('"start", "done" or "undo"'),
    by: z.string().default("Agent"),
    via: z.enum(["timeline", "phone", "agent", "voice", "mcp"]).default("agent"),
  }),
  outputSchema: anyOut,
  mcpTool: true,
  mcpAnnotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: false },
  run: async ({ kitchen, stepId, status, by, via }) => {
    await mutateKitchen(kitchen, {}, (doc) => {
      const s = doc.steps.find((x) => x.id === stepId);
      if (!s) throw new Error(`No step ${stepId}`);
      const now = Date.now();
      if (status === "start") s.startedAt = now;
      if (status === "done") { s.startedAt ??= now - s.minutes * 60_000; s.doneAt = now; }
      if (status === "undo") { s.startedAt = undefined; s.doneAt = undefined; }
      addLog(doc, by, via, `${status === "done" ? "Finished" : status === "start" ? "Started" : "Undid"} ${s.label}`);
    });
    return { ok: true };
  },
});
