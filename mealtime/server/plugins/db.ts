import { runMigrations } from "@agent-native/core/db";

export default runMigrations(
  [
    {
      version: 1,
      name: "mt-kitchens",
      sql: `CREATE TABLE IF NOT EXISTS mt_kitchens (
        id TEXT PRIMARY KEY,
        host_key TEXT NOT NULL,
        cook_key TEXT NOT NULL,
        data JSONB NOT NULL,
        version INTEGER NOT NULL DEFAULT 1,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      )`,
    },
    {
      version: 2,
      name: "mt-usage",
      sql: `CREATE TABLE IF NOT EXISTS mt_usage (
        id TEXT PRIMARY KEY,
        count INTEGER NOT NULL DEFAULT 0
      )`,
    },
  ],
  { table: "mt_migrations" },
);
