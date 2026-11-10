import { defineAction } from "@agent-native/core/action";
import { z } from "zod";

import { anyOut, kitchenArg } from "../server/lib/action-args.js";
import { addLog, kitchenNow, mutateKitchen } from "../server/lib/kitchen.js";

export default defineAction({
  description:
    "Move dinner (serving time) and reflow every step. Use this when the host agrees dinner should move, e.g. after a delay. When the agent or an outside assistant calls it, the host is asked to approve first; nothing moves until they do.",
  schema: z.object({
    kitchen: kitchenArg,
    serveAt: z.number().optional().describe("New serving time, epoch ms"),
    minutesLater: z.number().int().min(-240).max(240).optional().describe("Or: move dinner by this many minutes"),
    reason: z.string().max(200).optional(),
    by: z.string().default("Agent"),
    via: z.enum(["timeline", "agent", "voice", "mcp"]).default("agent"),
  }),
  outputSchema: anyOut,
  mcpTool: true,
  mcpAnnotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: false },
  // A person clicking in the app has already decided. Anything else (the agent,
  // MCP clients, other agents) waits for the host's approval in the framework.
  needsApproval: (_args, ctx) => ctx?.caller !== "frontend",
  run: async ({ kitchen, serveAt, minutesLater, reason, by, via }) => {
    let at = 0;
    let moved = 0;
    await mutateKitchen(kitchen, { hostOnly: true }, (doc) => {
      at = serveAt ?? doc.serveAt + (minutesLater ?? 0) * 60_000;
      if (at < kitchenNow(doc)) throw new Error("Dinner can't move into the past");
      moved = Math.round((at - doc.serveAt) / 60_000);
      doc.serveAt = at;
      for (const a of doc.approvals) if (a.status === "pending" && a.change.kind === "serve-time") a.status = "approved";
      addLog(doc, by, via, `Dinner moved ${Math.abs(moved)} min ${moved >= 0 ? "later" : "earlier"}${reason ? `: ${reason}` : ""}`);
    });
    return { ok: true, serveAt: at, movedMinutes: moved };
  },
});
