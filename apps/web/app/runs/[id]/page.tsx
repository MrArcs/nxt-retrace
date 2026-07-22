import fs from "node:fs"
import path from "node:path"
import {
  describeStep,
  type ConsoleEntry,
  type NetworkEntry,
} from "@pwrec/shared"
import { eq } from "drizzle-orm"
import Link from "next/link"
import { notFound } from "next/navigation"
import { runScript } from "@/app/actions/scripts"
import { StatusBadge } from "@/components/status-badge"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { db, runs, scripts } from "@/lib/db"
import { fmtDate, fmtDuration } from "@/lib/format"

export const dynamic = "force-dynamic"

function readJson<T>(dir: string, name: string): T | null {
  try {
    return JSON.parse(fs.readFileSync(path.join(dir, name), "utf8")) as T
  } catch {
    return null
  }
}

function listScreenshots(dir: string): string[] {
  try {
    return fs.readdirSync(dir).filter((f) => /^screenshot-\d+\.png$/.test(f))
  } catch {
    return []
  }
}

function stepScreenshotName(index: number): string {
  return `step-${String(index + 1).padStart(3, "0")}.png`
}

export default async function RunPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const run = db.select().from(runs).where(eq(runs.id, id)).get()
  if (!run) notFound()
  const script = db
    .select()
    .from(scripts)
    .where(eq(scripts.id, run.scriptId))
    .get()
  if (!script) notFound()

  if (run.status === "running") {
    return (
      <>
        {/* ponytail: meta refresh instead of client polling */}
        <meta httpEquiv="refresh" content="2" />
        <div className="flex flex-col items-center gap-3 py-24 text-center">
          <StatusBadge status="running" />
          <p className="text-sm text-muted-foreground">
            Running <b>{script.name}</b> — a Chromium window is open on your
            screen executing each step live. This page refreshes automatically
            and shows the report when it finishes.
          </p>
        </div>
      </>
    )
  }

  const consoleLogs = readJson<ConsoleEntry[]>(run.runDir, "console.json") ?? []
  const network = readJson<NetworkEntry[]>(run.runDir, "network.json") ?? []
  const consoleProblems = consoleLogs.filter((c) =>
    ["error", "pageerror", "warning"].includes(c.type)
  )
  const networkFailures = network.filter(
    (n) => n.status === 0 || n.status >= 400
  )
  const screenshots = listScreenshots(run.runDir)
  const stepScreenshots = script.steps.map((_, i) => {
    const name = stepScreenshotName(i)
    return fs.existsSync(path.join(run.runDir, name)) ? name : null
  })
  const hasStepScreenshots = stepScreenshots.some(Boolean)
  const hasTrace = fs.existsSync(path.join(run.runDir, "trace.zip"))
  const failed = run.status !== "passed"

  return (
    <div className="flex flex-col gap-8">
      <div className="flex items-end justify-between gap-4">
        <div className="flex flex-col gap-1">
          <div className="flex items-center gap-3">
            <h1 className="font-heading text-lg font-semibold">
              <Link href={`/scripts/${script.id}`} className="hover:underline">
                {script.name}
              </Link>
            </h1>
            <StatusBadge status={run.status} />
          </div>
          <p className="text-xs text-muted-foreground">
            {fmtDate(run.startedAt)} ·{" "}
            {fmtDuration(run.startedAt, run.finishedAt)}
          </p>
        </div>
        <form action={runScript.bind(null, script.id)}>
          <Button type="submit" variant="outline">
            ▶ Run again
          </Button>
        </form>
      </div>

      {failed && run.errorMessage && (
        <Card className="border-destructive/50">
          <CardHeader>
            <CardTitle className="text-sm">
              Failure
              {run.failedStepIndex != null && (
                <span className="ml-2 font-normal text-muted-foreground">
                  at step {run.failedStepIndex + 1}:{" "}
                  {describeStep(script.steps[run.failedStepIndex])}
                </span>
              )}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <pre className="overflow-x-auto font-mono text-xs whitespace-pre-wrap text-destructive">
              {run.errorMessage}
            </pre>
          </CardContent>
        </Card>
      )}

      <Tabs defaultValue="steps">
        <TabsList variant="line">
          <TabsTrigger value="steps">Repro steps</TabsTrigger>
          <TabsTrigger value="console">
            Console
            {consoleProblems.length > 0 && ` (${consoleProblems.length})`}
          </TabsTrigger>
          <TabsTrigger value="network">
            Network
            {networkFailures.length > 0 &&
              ` (${networkFailures.length} failed)`}
          </TabsTrigger>
          {(screenshots.length > 0 || hasTrace) && (
            <TabsTrigger value="artifacts">Artifacts</TabsTrigger>
          )}
          <TabsTrigger value="timeline">Timeline</TabsTrigger>
        </TabsList>

        <TabsContent value="steps" className="pt-2">
          <ol className="flex flex-col divide-y rounded-lg border text-sm">
            {script.steps.map((step, i) => {
              const isFailed = i === run.failedStepIndex
              const isAfterFailure =
                run.failedStepIndex != null && i > run.failedStepIndex
              return (
                <li
                  key={i}
                  className={`flex gap-3 px-4 py-2 ${isFailed ? "bg-destructive/10 font-medium" : ""} ${isAfterFailure ? "text-muted-foreground line-through decoration-border" : ""}`}
                >
                  <span className="text-muted-foreground tabular-nums">
                    {i + 1}
                  </span>
                  {step.description ?? describeStep(step)}
                  {isFailed && (
                    <Badge variant="destructive" className="ml-auto">
                      failed here
                    </Badge>
                  )}
                </li>
              )
            })}
          </ol>
        </TabsContent>

        <TabsContent value="console" className="pt-2">
          {consoleProblems.length ? (
            <ul className="flex flex-col divide-y rounded-lg border font-mono text-xs">
              {consoleProblems.map((entry, i) => (
                <li key={i} className="flex items-start gap-3 px-4 py-2">
                  <Badge
                    variant={
                      entry.type === "warning" ? "secondary" : "destructive"
                    }
                  >
                    {entry.type}
                  </Badge>
                  <span className="break-all whitespace-pre-wrap">
                    {entry.text}
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-muted-foreground">
              No console errors or warnings.
            </p>
          )}
        </TabsContent>

        <TabsContent value="network" className="flex flex-col gap-2 pt-2">
          <p className="text-xs text-muted-foreground">
            {networkFailures.length} failed of {network.length} requests
          </p>
          {networkFailures.length > 0 && (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Status</TableHead>
                  <TableHead>Method</TableHead>
                  <TableHead>URL</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {networkFailures.map((entry, i) => (
                  <TableRow key={i}>
                    <TableCell>
                      <Badge variant="destructive">
                        {entry.status || entry.failure || "failed"}
                      </Badge>
                    </TableCell>
                    <TableCell className="font-mono text-xs">
                      {entry.method}
                    </TableCell>
                    <TableCell className="max-w-96 truncate font-mono text-xs">
                      {entry.url}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
          {network.length > 0 && (
            <details className="text-sm">
              <summary className="cursor-pointer text-muted-foreground">
                All requests
              </summary>
              <div className="mt-2 max-h-96 overflow-auto rounded-lg border">
                <table className="w-full text-left font-mono text-xs">
                  <tbody>
                    {network.map((entry, i) => (
                      <tr key={i} className="border-b last:border-0">
                        <td className="px-3 py-1.5">{entry.status || "✕"}</td>
                        <td className="px-3 py-1.5">{entry.method}</td>
                        <td className="max-w-96 truncate px-3 py-1.5">
                          {entry.url}
                        </td>
                        <td className="px-3 py-1.5 text-muted-foreground">
                          {entry.resourceType}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </details>
          )}
          {!network.length && (
            <p className="text-sm text-muted-foreground">
              No network activity captured.
            </p>
          )}
        </TabsContent>

        {(screenshots.length > 0 || hasTrace) && (
          <TabsContent value="artifacts" className="flex flex-col gap-4 pt-2">
            {screenshots.length > 0 && (
              <div className="flex flex-wrap gap-3">
                {screenshots.map((name) => (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    key={name}
                    src={`/api/runs/${run.id}/files/${name}`}
                    alt={`Failure screenshot ${name}`}
                    className="max-w-xl rounded-lg border"
                  />
                ))}
              </div>
            )}
            {hasTrace && (
              <p className="text-sm text-muted-foreground">
                <a
                  href={`/api/runs/${run.id}/files/trace.zip`}
                  className="underline"
                  download
                >
                  Download trace.zip
                </a>{" "}
                and inspect it with{" "}
                <code className="rounded bg-muted px-1 font-mono text-xs">
                  npx playwright show-trace trace.zip
                </code>{" "}
                for full DOM snapshots and timing.
              </p>
            )}
          </TabsContent>
        )}

        <TabsContent value="timeline" className="pt-2">
          <ol className="relative ml-3 flex flex-col gap-4 border-l pl-6">
            {script.steps.map((step, i) => {
              const isFailed = i === run.failedStepIndex
              const isAfterFailure =
                run.failedStepIndex != null && i > run.failedStepIndex
              const screenshot = stepScreenshots[i]

              return (
                <li key={i} className="relative">
                  <span className="absolute -left-7.75 flex size-5 items-center justify-center rounded-full border bg-background text-[10px] text-muted-foreground tabular-nums">
                    {i + 1}
                  </span>
                  <Card
                    className={isFailed ? "border-destructive/50" : undefined}
                  >
                    <CardHeader className="gap-1 pb-3">
                      <div className="flex items-start gap-3">
                        <CardTitle className="text-sm">
                          {step.description ?? describeStep(step)}
                        </CardTitle>
                        {isFailed && (
                          <Badge variant="destructive" className="ml-auto">
                            failed here
                          </Badge>
                        )}
                        {isAfterFailure && (
                          <Badge variant="secondary" className="ml-auto">
                            not reached
                          </Badge>
                        )}
                      </div>
                    </CardHeader>
                    <CardContent>
                      {screenshot ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={`/api/runs/${run.id}/files/${screenshot}`}
                          alt={`Screenshot after step ${i + 1}`}
                          className="w-full rounded-lg border object-contain"
                        />
                      ) : (
                        <div className="flex min-h-32 items-center justify-center rounded-lg border border-dashed bg-muted/20 px-4 text-center text-sm text-muted-foreground">
                          {isAfterFailure
                            ? "This step did not run because an earlier step failed."
                            : "No screenshot was captured for this step."}
                        </div>
                      )}
                    </CardContent>
                  </Card>
                </li>
              )
            })}
          </ol>
          {!hasStepScreenshots && (
            <p className="mt-4 text-sm text-muted-foreground">
              Step screenshots are captured on new generated runs. Run this
              script again to populate the timeline screenshots.
            </p>
          )}
        </TabsContent>
      </Tabs>
    </div>
  )
}
