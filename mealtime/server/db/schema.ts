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
