import { integer, jsonb, pgTable, text } from "drizzle-orm/pg-core";

// One row per kitchen. The whole plan lives in `data` so every change is one
// atomic write, and `version` lets phones poll cheaply for changes.
export const kitchens = pgTable("mt_kitchens", {
  id: text("id").primaryKey(),
  hostKey: text("host_key").notNull(),
  cookKey: text("cook_key").notNull(),
  data: jsonb("data").notNull(),
  version: integer("version").notNull().default(1),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
});

// Agent messages per visitor per day, so a public demo can't run up the bill.
export const usage = pgTable("mt_usage", {
  id: text("id").primaryKey(), // "<owner>|<yyyy-mm-dd>"
  count: integer("count").notNull().default(0),
});
