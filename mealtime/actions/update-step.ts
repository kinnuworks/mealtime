import { defineAction } from "@agent-native/core/action";
import { z } from "zod";

import { anyOut, kitchenArg } from "../server/lib/action-args.js";
import { addLog, mutateKitchen } from "../server/lib/kitchen.js";

export default defineAction({
  description:
    "Edit one step on the host's plan: duration, label, oven temperature, pin it to a start time (epoch ms) or unpin (null), or confirm an estimated time. Reassigning a step to another cook is done with request-approval, not here. Host link only.",
  schema: z.object({
    kitchen: kitchenArg,
    stepId: z.string(),
    minutes: z.number().positive().optional(),
    label: z.string().optional(),
    temp: z.number().optional(),
    pinnedStart: z.number().nullable().optional().describe("Epoch ms to pin the start, or null to unpin"),
    confirm: z.boolean().optional().describe("True to confirm an estimated time as right"),
    by: z.string().default("Agent"),
    via: z.enum(["timeline", "agent", "voice", "mcp"]).default("agent"),
  }),
  outputSchema: anyOut,
  mcpTool: true,
  mcpAnnotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: false },
  run: async ({ kitchen, stepId, by, via, ...patch }) => {
    await mutateKitchen(kitchen, { hostOnly: true }, (doc) => {
      const s = doc.steps.find((x) => x.id === stepId);
      if (!s) throw new Error(`No step ${stepId}`);
      const parts: string[] = [];
      if (patch.minutes !== undefined && patch.minutes !== s.minutes) {
        parts.push(`${s.minutes}→${Math.round(patch.minutes)} min`);
        s.minutes = Math.round(patch.minutes);
        s.timeSource = "host"; s.confirmed = true;
      }
      if (patch.label) { s.label = patch.label; parts.push("renamed"); }
      if (patch.temp !== undefined) { s.temp = patch.temp; parts.push(`${patch.temp}°`); }
      if (patch.pinnedStart !== undefined) { s.pinnedStart = patch.pinnedStart ?? undefined; parts.push(patch.pinnedStart ? "pinned" : "unpinned"); }
      if (patch.confirm) { s.confirmed = true; parts.push("time confirmed"); }
      addLog(doc, by, via, `${s.label}: ${parts.join(", ") || "no change"}`);
    });
    return { ok: true };
  },
});
