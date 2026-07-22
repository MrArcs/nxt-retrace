import {
  CircleX,
  FileCode2,
  PlayCircle,
  TrendingDown,
  TrendingUp,
} from "lucide-react"
import Link from "next/link"
import { ScriptsTable } from "@/components/scripts-table"
import { StatusBadge } from "@/components/status-badge"
import { Badge } from "@/components/ui/badge"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
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
import { fmtDate, fmtDuration } from "@/lib/format"
import { cn } from "@/lib/utils"

export const dynamic = "force-dynamic"

const DAY_MS = 24 * 60 * 60 * 1000

type StatTone = "scripts" | "runs" | "passed" | "failed"

const STAT_TONES: Record<
  StatTone,
  {
    card: string
    active: string
    title: string
    value: string
    footer: string
    sub: string
    icon: string
  }
> = {
  scripts: {
    card: "border-emerald-500/15 bg-emerald-500/[0.04]",
    active: "ring-1 ring-emerald-500/35",
    title: "text-emerald-700/80 dark:text-emerald-300/80",
    value: "text-emerald-950 dark:text-emerald-50",
    footer: "text-emerald-900 dark:text-emerald-100",
    sub: "text-emerald-700/70 dark:text-emerald-300/70",
    icon: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300",
  },
  runs: {
    card: "border-sky-500/15 bg-sky-500/[0.04]",
    active: "ring-1 ring-sky-500/35",
    title: "text-sky-700/80 dark:text-sky-300/80",
    value: "text-sky-950 dark:text-sky-50",
    footer: "text-sky-900 dark:text-sky-100",
    sub: "text-sky-700/70 dark:text-sky-300/70",
    icon: "bg-sky-500/10 text-sky-700 dark:text-sky-300",
  },
  passed: {
    card: "border-lime-500/15 bg-lime-500/[0.04]",
    active: "ring-1 ring-lime-500/35",
    title: "text-lime-700/80 dark:text-lime-300/80",
    value: "text-lime-950 dark:text-lime-50",
    footer: "text-lime-900 dark:text-lime-100",
    sub: "text-lime-700/70 dark:text-lime-300/70",
    icon: "bg-lime-500/10 text-lime-700 dark:text-lime-300",
  },
  failed: {
    card: "border-rose-500/15 bg-rose-500/[0.04]",
    active: "ring-1 ring-rose-500/35",
    title: "text-rose-700/80 dark:text-rose-300/80",
    value: "text-rose-950 dark:text-rose-50",
    footer: "text-rose-900 dark:text-rose-100",
    sub: "text-rose-700/70 dark:text-rose-300/70",
    icon: "bg-rose-500/10 text-rose-700 dark:text-rose-300",
  },
}

interface StatCardProps {
  title: string
  value: string
  badge?: React.ReactNode
  footer: string
  sub: string
  icon: React.ReactNode
  tone: StatTone
  href?: string
  active?: boolean
}

function StatCard({
  title,
  value,
  badge,
  footer,
  sub,
  icon,
  tone,
  href,
  active,
}: StatCardProps) {
  const colors = STAT_TONES[tone]
  const card = (
    <Card className={cn(colors.card, active && colors.active)}>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardDescription className={colors.title}>{title}</CardDescription>
        {badge}
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        <span
          className={cn(
            "font-heading text-3xl font-semibold tabular-nums",
            colors.value
          )}
        >
          {value}
        </span>
        <div className="flex flex-col gap-0.5 text-sm">
          <span
            className={cn(
              "flex items-center gap-1.5 font-medium",
              colors.footer
            )}
          >
            {footer}
            <span
              className={cn(
                "inline-flex size-5 items-center justify-center rounded-full",
                colors.icon
              )}
            >
              {icon}
            </span>
          </span>
          <span className={colors.sub}>{sub}</span>
        </div>
      </CardContent>
    </Card>
  )

  if (!href) return card

  return (
    <Link href={href} className="group block">
      <div className="rounded-lg transition-colors group-hover:ring-1 group-hover:ring-border">
        {card}
      </div>
    </Link>
  )
}

export default async function DashboardPage({
  searchParams,
}: {
  searchParams?: Promise<{ filter?: string }>
}) {
  const { filter } = (await searchParams) ?? {}
  const allScripts = db.select().from(scripts).all()
  const allRuns = db.select().from(runs).all()
  const now = new Date().getTime()

  const scriptsThisWeek = allScripts.filter(
    (s) => now - s.createdAt.getTime() < 7 * DAY_MS
  ).length
  const runsToday = allRuns.filter(
    (r) => now - r.startedAt.getTime() < DAY_MS
  ).length
  const finished = allRuns.filter(
    (r) => r.status === "passed" || r.status === "failed"
  )
  const passed = finished.filter((r) => r.status === "passed").length
  const failed = finished.length - passed
  const passRate = finished.length
    ? Math.round((passed / finished.length) * 100)
    : null
  const healthy = passRate == null || passRate >= 50
  const scriptById = new Map(allScripts.map((script) => [script.id, script]))
  const failedRuns = allRuns
    .filter((run) => run.status === "failed")
    .sort((a, b) => b.startedAt.getTime() - a.startedAt.getTime())
  const passedRuns = allRuns
    .filter((run) => run.status === "passed")
    .sort((a, b) => b.startedAt.getTime() - a.startedAt.getTime())
  const sortedRuns = [...allRuns].sort(
    (a, b) => b.startedAt.getTime() - a.startedAt.getTime()
  )
  const runFilters = {
    runs: { title: "All run reports", rows: sortedRuns },
    passed: { title: "Passed run reports", rows: passedRuns },
    failed: { title: "Failed run reports", rows: failedRuns },
  }
  const runFilter =
    filter === "runs" || filter === "passed" || filter === "failed"
      ? filter
      : null
  const runReportView = runFilter ? runFilters[runFilter] : null

  return (
    <div className="flex flex-col gap-6">
      <h1 className="font-heading text-lg font-semibold">Dashboard</h1>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          title="Total Scripts"
          value={String(allScripts.length)}
          tone="scripts"
          href="/"
          active={!runFilter}
          badge={
            scriptsThisWeek > 0 ? (
              <Badge
                variant="outline"
                className="border-emerald-500/20 text-emerald-700 dark:text-emerald-300"
              >
                <TrendingUp /> +{scriptsThisWeek}
              </Badge>
            ) : undefined
          }
          footer={
            scriptsThisWeek > 0
              ? `${scriptsThisWeek} new this week`
              : "No new this week"
          }
          sub="Captured from the extension"
          icon={<FileCode2 className="size-3" />}
        />
        <StatCard
          title="Total Runs"
          value={String(allRuns.length)}
          tone="runs"
          href={allRuns.length > 0 ? "/?filter=runs#run-reports" : undefined}
          active={runFilter === "runs"}
          badge={
            runsToday > 0 ? (
              <Badge
                variant="outline"
                className="border-sky-500/20 text-sky-700 dark:text-sky-300"
              >
                <TrendingUp /> +{runsToday}
              </Badge>
            ) : undefined
          }
          footer={
            runsToday > 0
              ? `${runsToday} in the last 24h`
              : "None in the last 24h"
          }
          sub="Playwright executions"
          icon={<PlayCircle className="size-3" />}
        />
        <StatCard
          title="Pass Rate"
          value={passRate == null ? "—" : `${passRate}%`}
          tone="passed"
          href={
            passedRuns.length > 0 ? "/?filter=passed#run-reports" : undefined
          }
          active={runFilter === "passed"}
          badge={
            passRate != null ? (
              <Badge
                variant="outline"
                className="border-lime-500/20 text-lime-700 dark:text-lime-300"
              >
                {healthy ? <TrendingUp /> : <TrendingDown />} {passRate}%
              </Badge>
            ) : undefined
          }
          footer={`${passed} passed of ${finished.length} runs`}
          sub={healthy ? "Flows are stable" : "Flows need attention"}
          icon={
            healthy ? (
              <TrendingUp className="size-3" />
            ) : (
              <TrendingDown className="size-3" />
            )
          }
        />
        <StatCard
          title="Failed Runs"
          value={String(failed)}
          tone="failed"
          href={failed > 0 ? "/?filter=failed#run-reports" : undefined}
          active={runFilter === "failed"}
          badge={
            failed > 0 ? (
              <Badge
                variant="outline"
                className="border-rose-500/20 text-rose-700 dark:text-rose-300"
              >
                <CircleX /> {failed}
              </Badge>
            ) : undefined
          }
          footer={
            failed > 0 ? "Open the run report to debug" : "Nothing failing"
          }
          sub="Console, network & trace captured"
          icon={<CircleX className="size-3" />}
        />
      </div>

      <div className="flex flex-col gap-3">
        {runReportView ? (
          <>
            <div
              className="flex items-center justify-between gap-3"
              id="run-reports"
            >
              <h2 className="text-sm font-semibold">{runReportView.title}</h2>
              <Link
                href="/"
                className="text-xs text-muted-foreground hover:underline"
              >
                Show all scripts
              </Link>
            </div>
            {runReportView.rows.length ? (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Script</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Failed step</TableHead>
                    <TableHead>Started</TableHead>
                    <TableHead>Duration</TableHead>
                    <TableHead className="text-right">Report</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {runReportView.rows.map((run) => {
                    const script = scriptById.get(run.scriptId)

                    return (
                      <TableRow key={run.id}>
                        <TableCell>
                          {script ? (
                            <Link
                              href={`/scripts/${script.id}`}
                              className="font-medium hover:underline"
                            >
                              {script.name}
                            </Link>
                          ) : (
                            <span className="font-medium">Deleted script</span>
                          )}
                          {script?.url && (
                            <div className="max-w-96 truncate text-xs text-muted-foreground">
                              {script.url}
                            </div>
                          )}
                        </TableCell>
                        <TableCell>
                          <StatusBadge status={run.status} />
                        </TableCell>
                        <TableCell className="text-muted-foreground">
                          {run.failedStepIndex == null
                            ? "—"
                            : run.failedStepIndex + 1}
                        </TableCell>
                        <TableCell className="text-muted-foreground">
                          {fmtDate(run.startedAt)}
                        </TableCell>
                        <TableCell className="text-muted-foreground">
                          {fmtDuration(run.startedAt, run.finishedAt)}
                        </TableCell>
                        <TableCell className="text-right">
                          <Link
                            href={`/runs/${run.id}`}
                            className="hover:underline"
                          >
                            View report →
                          </Link>
                        </TableCell>
                      </TableRow>
                    )
                  })}
                </TableBody>
              </Table>
            ) : (
              <Card>
                <CardContent className="text-sm text-muted-foreground">
                  No {runFilter} runs found.
                </CardContent>
              </Card>
            )}
          </>
        ) : (
          <>
            <h2 className="text-sm font-semibold">All captured scripts</h2>
            <ScriptsTable />
          </>
        )}
      </div>
    </div>
  )
}
