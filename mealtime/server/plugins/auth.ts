import { createToolkitAuthPlugin } from "@agent-native/toolkit/app/auth/server";

export default createToolkitAuthPlugin({
  workspaceAppPublicPaths: ["/"],
  // The kitchen pages and their actions work without an account: access is the
  // unguessable host or cook link, checked inside every action.
  publicPaths: ["/k", "/c", "/start", "/_agent-native/actions", "/_agent-native/agent-chat", "/_agent-native/application-state"],
  rootAuth: true,
  marketing: false,
});
