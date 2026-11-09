import { defineEventHandler, getRequestURL, sendRedirect } from "h3";

import { ensureGuest } from "../lib/guest.js";

// Runs before the auth guard: give every visitor a guest cookie, and send the
// front door straight to a working demo kitchen (no sign-up).
export default defineEventHandler((event) => {
  ensureGuest(event);
  const url = getRequestURL(event);
  if (event.method === "GET" && url.pathname === "/") return sendRedirect(event, "/start", 302);
});
