import { defineAction } from "@agent-native/core/action";
import { z } from "zod";

import { anyOut, kitchenArg } from "../server/lib/action-args.js";
import { addLog, mutateKitchen, newId } from "../server/lib/kitchen.js";

export default defineAction({
  description:
    "Ask the host to approve a change that affects everyone: moving serving time, or handing a step to a different cook. It appears as a one-tap card for the host; nothing changes until they approve.",
  schema: z.object({
    kitchen: kitchenArg,
    summary: z.string().describe("One plain sentence the host will read, e.g. 'Hand the gravy to Sam so you can carve?'"),
    change: z.discriminatedUnion("kind", [
      z.object({ kind: z.literal("serve-time"), serveAt: z.number().describe("New serving time, epoch ms") }),
      z.object({ kind: z.literal("reassign"), stepId: z.string(), cook: z.string().describe("Cook name from the kitchen's cooks") }),
    ]),
    by: z.string().default("Agent"),
  }),
  outputSchema: anyOut,
  mcpTool: true,
  mcpAnnotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: false },
  run: async ({ kitchen, summary, change, by }) => {
    const id = newId(5);
    await mutateKitchen(kitchen, {}, (doc) => {
      if (change.kind === "reassign" && !doc.cooks.includes(change.cook)) throw new Error(`No cook named ${change.cook}`);
      doc.approvals.push({ id, summary, change, requestedBy: by, createdAt: Date.now(), status: "pending" });
      addLog(doc, by, by === "Agent" ? "agent" : "phone", `Asked the host: ${summary}`);
    });
    return { ok: true, approvalId: id, status: "waiting for the host" };
  },
});
