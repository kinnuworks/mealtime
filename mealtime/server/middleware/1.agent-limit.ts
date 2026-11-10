import { sql } from "drizzle-orm";
import { createError, defineEventHandler, getRequestURL } from "h3";

import { getDb } from "../db/index.js";
import { guestOwner } from "../lib/guest.js";

// The demo is public and needs no sign-up, so cap agent messages per visitor
// and across the whole site each day.
const PER_VISITOR = Number(process.env.MT_AGENT_LIMIT ?? 40);
const PER_SITE = Number(process.env.MT_AGENT_SITE_LIMIT ?? 2000);

async function bump(id: string): Promise<number> {
  const rows = await getDb().execute(
    sql`INSERT INTO mt_usage (id, count) VALUES (${id}, 1)
        ON CONFLICT (id) DO UPDATE SET count = mt_usage.count + 1
        RETURNING count`,
  );
  const r = (rows as unknown as { rows?: { count: number }[] }).rows ?? (rows as unknown as { count: number }[]);
  return Number(r[0]?.count ?? 0);
}

export default defineEventHandler(async (event) => {
  if (event.method !== "POST") return;
  if (getRequestURL(event).pathname !== "/_agent-native/agent-chat") return;
  const day = new Date().toISOString().slice(0, 10);
  const who = guestOwner(event) ?? "signed-in";
  const mine = await bump(`${who}|${day}`);
  const all = await bump(`*|${day}`);
  if (mine > PER_VISITOR || all > PER_SITE) {
    throw createError({
      statusCode: 429,
      statusMessage: "The kitchen agent has hit today's demo limit. The timeline and phones still work.",
    });
  }
});
