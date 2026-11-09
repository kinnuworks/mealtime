import { getOrgContext } from "@agent-native/core/org";
import {
  createAgentChatPlugin,
  loadActionsFromStaticRegistry,
} from "@agent-native/core/server";

import { guestOwner } from "../lib/guest.js";
import { SPLIT_RULES } from "../lib/split-prompt.js";
import actionsRegistry from "../../.generated/actions-registry.js";
import {
  searchConversationReferences,
  validateConversationReferences,
} from "../lib/composer-references.js";

const INITIAL_TOOL_NAMES = [
  "view-screen",
  "get-kitchen",
  "read-recipe",
  "set-dish-steps",
  "report-delay",
  "mark-step",
  "update-step",
  "request-approval",
  "add-dish",
];

export default createAgentChatPlugin({
  appId: "mealtime",
  mentionProviders: {
    chats: {
      label: "composerSources.group",
      search: searchConversationReferences,
    },
  },
  prepareRequest: async ({ references }) => {
    await validateConversationReferences(references);
  },
  actions: loadActionsFromStaticRegistry(actionsRegistry),
  mcp: { connectorCatalog: [], appApprovalPage: true },
  initialToolNames: INITIAL_TOOL_NAMES,
  resolveOrgId: async (event) => (await getOrgContext(event)).orgId,
  // Judges use the app without signing in: each browser is its own guest.
  anonymousOwner: guestOwner,
  anonymousReadOnly: false,
  frameworkTools: "minimal",
  codeExecution: { production: "off" },
  systemPrompt: `You are the kitchen agent in Mealtime, a shared timeline that gets every dish of a big meal on the table at the same time.

The host's screen shows one kitchen. Its link key is navigation.kitchen in <current-screen>; pass it as "kitchen" to every action. navigation.selectedStepId (if set) is the step the person is looking at: "this", "it" or an unnamed step means that one.

How work is split:
- Code schedules. Never compute start times yourself; change durations, steps or setup through actions and the scheduler reflows everyone's phones.
- You turn recipes into steps. Before set-dish-steps, call read-recipe. Give every step's minutes from the recipe and copy the exact words that state that time into "quote" (word for word, e.g. "bake for 25 to 30 minutes"). If the recipe gives no time for a step, omit quote: it becomes an estimate the host confirms. Keep 3 to 8 steps per dish, mark waiting steps (roasting, resting, chilling) handsOn false, and give oven steps a temp.
- When someone says something is late ("the potatoes need 10 more minutes"), call report-delay on the step they mean. If dinner would slip, the host gets an approval card automatically; tell them by how much.
- Moving serving time or handing a step to a different cook always goes through request-approval. Never claim it happened until the host approves.
- Recipe splitting rules:
${SPLIT_RULES}
- Use by: "Agent" (the default). Keep replies to one or two short sentences; people are cooking.`,
});
