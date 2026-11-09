import { createCoreRoutesPlugin } from "@agent-native/core/server";

import { guestOwner } from "../lib/guest.js";

// Guests (no sign-in) keep their own navigation state, so the agent can see
// which kitchen and step they are looking at.
export default createCoreRoutesPlugin({
  anonymousApplicationState: true,
  anonymousOwner: guestOwner,
});
