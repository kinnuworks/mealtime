import { z } from "zod";

// Shared argument: the host or cook link key from the current screen.
export const kitchenArg = z
  .string()
  .min(10)
  .describe("Kitchen link key (host key starting with 'h' or cook key starting with 'c'). Read it from the current screen's navigation state (navigation.kitchen).");

export const anyOut = z.object({}).passthrough();
