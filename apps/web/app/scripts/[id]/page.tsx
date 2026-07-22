import { describeStep } from "@pwrec/shared"
import { desc, eq } from "drizzle-orm"
import Link from "next/link"
import { notFound } from "next/navigation"
import { renameScript, runScript, updateScriptCode } from "@/app/actions/scripts"
import { CopyButton } from "@/components/copy-button"
import { StatusBadge } from "@/components/status-badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { db, runs, scripts } from "@/lib/db"
import { fmtDate, fmtDuration } from "@/lib/format"

export const dynamic = "force-dynamic"

export default async function ScriptPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const script = db.select().from(scripts).where(eq(scripts.id, id)).get()
  if (!script) notFound()
  const scriptRuns = db
    .select()
    .from(runs)
    .where(eq(runs.scriptId, id))
    .orderBy(desc(runs.startedAt))
    .all()

  async function rename(formData: FormData) {
    "use server"
    await renameScript(id, String(formData.get("name") ?? ""))
  }

  async function saveCode(formData: FormData) {
    "use server"
    await updateScriptCode(id, String(formData.get("code") ?? ""))
  }

  return (
    <div className="flex flex-col gap-8">
      <div className="flex items-end justify-between gap-4">
        <form action={rename} className="flex items-center gap-2">
          <Input
            name="name"
            defaultValue={script.name}
            className="h-9 w-64 font-medium"
            aria-label="Script name"
          />
          <Button type="submit" size="sm" variant="ghost" className="text-muted-foreground">
            Rename
          </Button>
        </form>
        <form action={runScript.bind(null, script.id)}>
          <Button type="submit">▶ Play</Button>
        </form>
      </div>

      <section className="flex flex-col gap-2">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold">Playwright code</h2>
          <CopyButton text={script.code} />
        </div>
        <form action={saveCode} className="flex flex-col gap-2">
          <textarea
            name="code"
            defaultValue={script.code}
            rows={Math.min(script.code.split("\n").length + 2, 30)}
            spellCheck={false}
            className="w-full resize-y rounded-lg border bg-muted/40 p-4 font-mono text-xs leading-relaxed outline-none focus-visible:ring-2 focus-visible:ring-ring/30"
          />
          <div className="flex items-center gap-3">
            <Button type="submit" size="sm" variant="outline">
              Save code
            </Button>
            <p className="text-xs text-muted-foreground">
              Edit freely — ▶ Play runs exactly this code and captures errors into the report.
            </p>
          </div>
        </form>
      </section>

      <section className="flex flex-col gap-2">
        <h2 className="text-sm font-semibold">Steps</h2>
        <ol className="flex flex-col divide-y rounded-lg border text-sm">
          {script.steps.map((step, i) => (
            <li key={i} className="flex gap-3 px-4 py-2">
              <span className="tabular-nums text-muted-foreground">{i + 1}</span>
              {step.description ?? describeStep(step)}
            </li>
          ))}
        </ol>
      </section>

      <section className="flex flex-col gap-2">
        <h2 className="text-sm font-semibold">Runs</h2>
        {scriptRuns.length ? (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Status</TableHead>
                <TableHead>Started</TableHead>
                <TableHead>Duration</TableHead>
                <TableHead className="text-right">Report</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {scriptRuns.map((run) => (
                <TableRow key={run.id}>
                  <TableCell>
                    <StatusBadge status={run.status} />
                  </TableCell>
                  <TableCell className="text-muted-foreground">{fmtDate(run.startedAt)}</TableCell>
                  <TableCell className="text-muted-foreground">
                    {fmtDuration(run.startedAt, run.finishedAt)}
                  </TableCell>
                  <TableCell className="text-right">
                    <Link href={`/runs/${run.id}`} className="text-sm hover:underline">
                      View report →
                    </Link>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        ) : (
          <p className="text-sm text-muted-foreground">Not run yet.</p>
        )}
      </section>
    </div>
  )
}
