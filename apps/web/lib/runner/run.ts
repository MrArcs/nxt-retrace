import { spawn } from "node:child_process"
import fs from "node:fs"
import { createRequire } from "node:module"
import path from "node:path"
import { generateSpec } from "@pwrec/shared"
import { eq } from "drizzle-orm"
import { RUNS_DIR } from "@/lib/config"
import { db, runs, scripts, type ScriptRow } from "@/lib/db"
import { CAPTURE_FIXTURE, PLAYWRIGHT_CONFIG } from "./templates"

// resolve the playwright CLI through node's resolver — survives npm workspace hoisting
const PLAYWRIGHT_CLI = createRequire(
  path.join(process.cwd(), "package.json")
).resolve("@playwright/test/cli")

interface ReportResult {
  status: string
  message?: string
  line?: number
}

interface PlaywrightError {
  message?: string
  location?: { file?: string; line?: number }
}

interface PlaywrightResult {
  status: string
  errors?: PlaywrightError[]
}

interface PlaywrightTest {
  results?: PlaywrightResult[]
}

interface PlaywrightSpec {
  tests?: PlaywrightTest[]
}

interface PlaywrightSuite {
  specs?: PlaywrightSpec[]
  suites?: PlaywrightSuite[]
}

interface PlaywrightReport {
  suites?: PlaywrightSuite[]
}

/** dig the first test result out of playwright's json reporter output */
function parseReport(runDir: string): ReportResult | null {
  try {
    const report = JSON.parse(
      fs.readFileSync(path.join(runDir, "report.json"), "utf8")
    ) as PlaywrightReport
    const specs: PlaywrightSpec[] = []
    const walk = (suite: PlaywrightSuite) => {
      specs.push(...(suite.specs ?? []))
      ;(suite.suites ?? []).forEach(walk)
    }
    ;(report.suites ?? []).forEach(walk)
    const result = specs[0]?.tests?.[0]?.results?.at(-1)
    if (!result) return null
    // the first error is often a bare "Test timeout" — the located one names the failing action
    const error = result.errors?.find((e) => e.location) ?? result.errors?.[0]
    const location = error?.location
    return {
      status: result.status,
      message: error?.message?.replace(/\u001b\[[0-9;]*m/g, ""),
      line: location?.file?.endsWith("spec.ts") ? location.line : undefined,
    }
  } catch {
    return null
  }
}

/** copy failure screenshots + trace out of playwright's nested output dir to stable names */
function collectArtifacts(runDir: string) {
  const artifactsDir = path.join(runDir, "artifacts")
  if (!fs.existsSync(artifactsDir)) return
  let shots = 0
  const walk = (dir: string) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name)
      if (entry.isDirectory()) walk(full)
      else if (entry.name.endsWith(".png")) {
        fs.copyFileSync(full, path.join(runDir, `screenshot-${++shots}.png`))
      } else if (entry.name === "trace.zip") {
        fs.copyFileSync(full, path.join(runDir, "trace.zip"))
      }
    }
  }
  walk(artifactsDir)
}

/**
 * Start a playwright run for a script. Inserts the run row synchronously and
 * finishes in the background; the report page polls the row's status.
 */
export function startRun(script: ScriptRow): string {
  const runId = crypto.randomUUID()
  const runDir = path.join(RUNS_DIR, runId)
  fs.mkdirSync(runDir, { recursive: true })

  // run dirs live outside the repo — symlink node_modules so '@playwright/test' resolves
  fs.symlinkSync(
    path.resolve(PLAYWRIGHT_CLI, "../../.."),
    path.join(runDir, "node_modules"),
    "dir"
  )

  // hand-edited code runs verbatim (no step mapping); otherwise regenerate from
  // steps so codegen improvements reach existing scripts
  const generated = generateSpec(script.name, script.steps, {
    importFrom: "./capture",
    captureStepScreenshots: true,
  })
  const specCode = script.codeEdited
    ? script.code.replace("from '@playwright/test'", "from './capture'")
    : generated.code
  const stepLines = script.codeEdited ? [] : generated.stepLines
  fs.writeFileSync(path.join(runDir, "flow.spec.ts"), specCode)
  if (!script.codeEdited) {
    // keep the displayed code in sync with what actually ran
    const display = generateSpec(script.name, script.steps).code
    if (display !== script.code) {
      db.update(scripts)
        .set({ code: display })
        .where(eq(scripts.id, script.id))
        .run()
    }
  }
  fs.writeFileSync(path.join(runDir, "capture.ts"), CAPTURE_FIXTURE)
  fs.writeFileSync(path.join(runDir, "playwright.config.ts"), PLAYWRIGHT_CONFIG)

  db.insert(runs)
    .values({
      id: runId,
      scriptId: script.id,
      status: "running",
      startedAt: new Date(),
      runDir,
    })
    .run()

  const child = spawn(
    process.execPath,
    [PLAYWRIGHT_CLI, "test", "--config", "playwright.config.ts"],
    {
      cwd: runDir,
      env: { ...process.env, CI: "1" },
      stdio: ["ignore", "pipe", "pipe"],
    }
  )
  let stderr = ""
  child.stderr?.on("data", (d) => (stderr += d))
  child.stdout?.on("data", (d) => (stderr += d))

  const finish = (patch: Partial<typeof runs.$inferInsert>) =>
    db
      .update(runs)
      .set({ finishedAt: new Date(), ...patch })
      .where(eq(runs.id, runId))
      .run()

  child.on("error", (err) => {
    finish({
      status: "error",
      errorMessage: `Could not start Playwright: ${err.message}`,
    })
  })
  child.on("exit", () => {
    try {
      collectArtifacts(runDir)
      const result = parseReport(runDir)
      if (!result) {
        finish({
          status: "error",
          errorMessage: `Playwright produced no report. Output:\n${stderr.slice(-2000)}`,
        })
        return
      }
      const passed = result.status === "passed"
      const failedStepIndex =
        result.line != null
          ? stepLines.findIndex((l) => l === result.line)
          : null
      finish({
        status: passed ? "passed" : "failed",
        errorMessage:
          result.message ?? (passed ? null : `Test ${result.status}`),
        failedStepIndex:
          failedStepIndex != null && failedStepIndex >= 0
            ? failedStepIndex
            : null,
      })
    } catch (err) {
      finish({
        status: "error",
        errorMessage: `Failed to parse run output: ${String(err)}`,
      })
    }
  })

  return runId
}
