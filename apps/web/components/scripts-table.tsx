import { desc } from "drizzle-orm"
import Link from "next/link"
import { deleteScript, runScript } from "@/app/actions/scripts"
import { DeleteScriptButton } from "@/components/delete-script-button"
import { StatusBadge } from "@/components/status-badge"
import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { db, runs, scripts } from "@/lib/db"
import { fmtDate } from "@/lib/format"

/** server component: the full script library table with Play/Delete actions */
export function ScriptsTable() {
  const allScripts = db
    .select()
    .from(scripts)
    .orderBy(desc(scripts.updatedAt))
    .all()
  const allRuns = db.select().from(runs).orderBy(desc(runs.startedAt)).all()
  const lastRunByScript = new Map(
    allRuns.map((r) => [r.scriptId, r] as const).reverse()
  )

  if (!allScripts.length) {
    return (
      <Card className="mx-auto max-w-md text-center">
        <CardHeader>
          <CardTitle>No scripts yet</CardTitle>
          <CardDescription>
            Open the Retrace side panel in Chrome or Edge, hit{" "}
            <b>Start recording</b>, click through your flow, then save it here.
          </CardDescription>
        </CardHeader>
        <CardContent className="text-sm text-muted-foreground">
          Every saved recording becomes a runnable Playwright test.
        </CardContent>
      </Card>
    )
  }

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Name</TableHead>
          <TableHead>Steps</TableHead>
          <TableHead>Last run</TableHead>
          <TableHead>Updated</TableHead>
          <TableHead className="text-right">Actions</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {allScripts.map((script) => {
          const lastRun = lastRunByScript.get(script.id)
          return (
            <TableRow key={script.id}>
              <TableCell>
                <Link
                  href={`/scripts/${script.id}`}
                  className="font-medium hover:underline"
                >
                  {script.name}
                </Link>
                <div className="max-w-72 truncate text-xs text-muted-foreground">
                  {script.url}
                </div>
              </TableCell>
              <TableCell>{script.steps.length}</TableCell>
              <TableCell>
                {lastRun ? (
                  <Link href={`/runs/${lastRun.id}`}>
                    <StatusBadge status={lastRun.status} />
                  </Link>
                ) : (
                  <span className="text-muted-foreground">—</span>
                )}
              </TableCell>
              <TableCell className="text-muted-foreground">
                {fmtDate(script.updatedAt)}
              </TableCell>
              <TableCell className="text-right">
                <div className="flex justify-end gap-2">
                  <form action={runScript.bind(null, script.id)}>
                    {/* base-ui buttons default to type="button" — forms need explicit submit */}
                    <Button type="submit" size="sm">
                      ▶ Play
                    </Button>
                  </form>
                  <DeleteScriptButton
                    name={script.name}
                    action={deleteScript.bind(null, script.id)}
                  />
                </div>
              </TableCell>
            </TableRow>
          )
        })}
      </TableBody>
    </Table>
  )
}
