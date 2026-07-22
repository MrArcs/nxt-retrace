import type { RunStatus, Step } from "@pwrec/shared"
import { integer, sqliteTable, text } from "drizzle-orm/sqlite-core"

export const scripts = sqliteTable("scripts", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  url: text("url").notNull(),
  steps: text("steps", { mode: "json" }).$type<Step[]>().notNull(),
  code: text("code").notNull(),
  codeEdited: integer("code_edited", { mode: "boolean" }).notNull().default(false),
  createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
  updatedAt: integer("updated_at", { mode: "timestamp_ms" }).notNull(),
})

export const runs = sqliteTable("runs", {
  id: text("id").primaryKey(),
  scriptId: text("script_id")
    .notNull()
    .references(() => scripts.id, { onDelete: "cascade" }),
  status: text("status").$type<RunStatus>().notNull(),
  startedAt: integer("started_at", { mode: "timestamp_ms" }).notNull(),
  finishedAt: integer("finished_at", { mode: "timestamp_ms" }),
  errorMessage: text("error_message"),
  failedStepIndex: integer("failed_step_index"),
  runDir: text("run_dir").notNull(),
})

export type ScriptRow = typeof scripts.$inferSelect
export type RunRow = typeof runs.$inferSelect
