import fs from "node:fs"
import Database from "better-sqlite3"
import { drizzle } from "drizzle-orm/better-sqlite3"
import { DATA_DIR, DB_PATH } from "@/lib/config"
import * as schema from "./schema"

fs.mkdirSync(DATA_DIR, { recursive: true })

const sqlite = new Database(DB_PATH)
sqlite.pragma("journal_mode = WAL")
sqlite.pragma("foreign_keys = ON")

// ponytail: DDL-on-boot instead of drizzle-kit migrations; local single-user db
sqlite.exec(`
  CREATE TABLE IF NOT EXISTS scripts (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    url TEXT NOT NULL,
    steps TEXT NOT NULL,
    code TEXT NOT NULL,
    code_edited INTEGER NOT NULL DEFAULT 0,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL
  );
  CREATE TABLE IF NOT EXISTS runs (
    id TEXT PRIMARY KEY,
    script_id TEXT NOT NULL REFERENCES scripts(id) ON DELETE CASCADE,
    status TEXT NOT NULL,
    started_at INTEGER NOT NULL,
    finished_at INTEGER,
    error_message TEXT,
    failed_step_index INTEGER,
    run_dir TEXT NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_runs_script ON runs(script_id, started_at DESC);
`)

// ponytail: poor-man's migration for pre-existing dbs; errors mean the column exists
try {
  sqlite.exec("ALTER TABLE scripts ADD COLUMN code_edited INTEGER NOT NULL DEFAULT 0")
} catch {
  /* column already present */
}

export const db = drizzle(sqlite, { schema })
export * from "./schema"
