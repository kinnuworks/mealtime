import { sendToAgentChat } from "@agent-native/core/client/agent-chat";
import { buildSignInReturnHref } from "@agent-native/core/client/sign-in-return";
import { useSession } from "@agent-native/core/client/use-session";

// The kitchen, timeline and phones work without an account. The framework
// only lets signed-in people use the site's AI key, so the agent asks for a
// sign-in first and then brings you back to the same kitchen.
export function useSignedIn(): boolean {
  return useSession().status === "authenticated";
}

export function signInForAgent() {
  window.location.href = buildSignInReturnHref({ returnTo: window.location.pathname });
}

export function askAgent(signedIn: boolean, message: string) {
  if (signedIn) sendToAgentChat({ message, submit: true });
  else signInForAgent();
}
