import { randomBytes } from "node:crypto";

import { getCookie, setCookie, type H3Event } from "h3";

export const GUEST_COOKIE = "mt_guest";

/** Each browser gets its own guest identity, so judges never share chats. */
export function ensureGuest(event: H3Event): string {
  let id = getCookie(event, GUEST_COOKIE);
  if (!id || !/^[A-Za-z0-9_-]{16,40}$/.test(id)) {
    id = randomBytes(16).toString("base64url");
    setCookie(event, GUEST_COOKIE, id, { httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", path: "/", maxAge: 60 * 60 * 24 * 30 });
  }
  return id;
}

export function guestOwner(event: H3Event): string | null {
  const id = getCookie(event, GUEST_COOKIE);
  return id && /^[A-Za-z0-9_-]{16,40}$/.test(id) ? `guest-${id.toLowerCase()}@guest.mealtime.app` : null;
}
