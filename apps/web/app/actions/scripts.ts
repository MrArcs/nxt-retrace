"use server"

import fs from "node:fs"
import { eq } from "drizzle-orm"
import { revalidatePath } from "next/cache"
import { redirect } from "next/navigation"
import { db, runs, scripts } from "@/lib/db"
import { startRun } from "@/lib/runner/run"

export async function runScript(scriptId: string): Promise<void> {
  const script = db.select().from(scripts).where(eq(scripts.id, scriptId)).get()
  if (!script) throw new Error("Script not found")
  const runId = startRun(script)
  redirect(`/runs/${runId}`)
}

export async function deleteScript(scriptId: string): Promise<void> {
  const scriptRuns = db.select().from(runs).where(eq(runs.scriptId, scriptId)).all()
  db.delete(scripts).where(eq(scripts.id, scriptId)).run()
  for (const run of scriptRuns) {
    fs.rmSync(run.runDir, { recursive: true, force: true })
  }
  revalidatePath("/")
}

export async function updateScriptCode(scriptId: string, code: string): Promise<void> {
  const trimmed = code.trim()
  if (!trimmed.includes("test(")) throw new Error("Code must contain a Playwright test() block")
  db.update(scripts)
    .set({ code: trimmed + "\n", codeEdited: true, updatedAt: new Date() })
    .where(eq(scripts.id, scriptId))
    .run()
  revalidatePath(`/scripts/${scriptId}`)
}

export async function renameScript(scriptId: string, name: string): Promise<void> {
  const trimmed = name.trim()
  if (!trimmed || trimmed.length > 200) throw new Error("Name must be 1–200 characters")
  db.update(scripts)
    .set({ name: trimmed, updatedAt: new Date() })
    .where(eq(scripts.id, scriptId))
    .run()
  revalidatePath(`/scripts/${scriptId}`)
  revalidatePath("/")
}
