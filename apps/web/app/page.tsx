import { CircleX, FileCode2, PlayCircle, TrendingDown, TrendingUp } from "lucide-react"
import { ScriptsTable } from "@/components/scripts-table"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardDescription, CardHeader } from "@/components/ui/card"
import { db, runs, scripts } from "@/lib/db"

export const dynamic = "force-dynamic"

const DAY_MS = 24 * 60 * 60 * 1000

interface StatCardProps {
  title: string
  value: string
  badge?: React.ReactNode
  footer: string
  sub: string
  icon: React.ReactNode
}

function StatCard({ title, value, badge, footer, sub, icon }: StatCardProps) {
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardDescription>{title}</CardDescription>
        {badge}
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        <span className="font-heading text-3xl font-semibold tabular-nums">{value}</span>
        <div className="flex flex-col gap-0.5 text-sm">
          <span className="flex items-center gap-1.5 font-medium">
            {footer} {icon}
          </span>
          <span className="text-muted-foreground">{sub}</span>
        </div>
      </CardContent>
    </Card>
  )
}

export default function DashboardPage() {
  const allScripts = db.select().from(scripts).all()
  const allRuns = db.select().from(runs).all()
  const now = Date.now()

  const scriptsThisWeek = allScripts.filter((s) => now - s.createdAt.getTime() < 7 * DAY_MS).length
  const runsToday = allRuns.filter((r) => now - r.startedAt.getTime() < DAY_MS).length
  const finished = allRuns.filter((r) => r.status === "passed" || r.status === "failed")
  const passed = finished.filter((r) => r.status === "passed").length
  const failed = finished.length - passed
  const passRate = finished.length ? Math.round((passed / finished.length) * 100) : null
  const healthy = passRate == null || passRate >= 50

  return (
    <div className="flex flex-col gap-6">
      <h1 className="font-heading text-lg font-semibold">Dashboard</h1>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          title="Total Scripts"
          value={String(allScripts.length)}
          badge={
            scriptsThisWeek > 0 ? (
              <Badge variant="outline">
                <TrendingUp /> +{scriptsThisWeek}
              </Badge>
            ) : undefined
          }
          footer={scriptsThisWeek > 0 ? `${scriptsThisWeek} new this week` : "No new this week"}
          sub="Captured from the extension"
          icon={<FileCode2 className="size-4 text-muted-foreground" />}
        />
        <StatCard
          title="Total Runs"
          value={String(allRuns.length)}
          badge={
            runsToday > 0 ? (
              <Badge variant="outline">
                <TrendingUp /> +{runsToday}
              </Badge>
            ) : undefined
          }
          footer={runsToday > 0 ? `${runsToday} in the last 24h` : "None in the last 24h"}
          sub="Playwright executions"
          icon={<PlayCircle className="size-4 text-muted-foreground" />}
        />
        <StatCard
          title="Pass Rate"
          value={passRate == null ? "—" : `${passRate}%`}
          badge={
            passRate != null ? (
              <Badge variant="outline">
                {healthy ? <TrendingUp /> : <TrendingDown />} {passRate}%
              </Badge>
            ) : undefined
          }
          footer={`${passed} passed of ${finished.length} runs`}
          sub={healthy ? "Flows are stable" : "Flows need attention"}
          icon={
            healthy ? (
              <TrendingUp className="size-4 text-muted-foreground" />
            ) : (
              <TrendingDown className="size-4 text-muted-foreground" />
            )
          }
        />
        <StatCard
          title="Failed Runs"
          value={String(failed)}
          badge={
            failed > 0 ? (
              <Badge variant="outline" className="text-destructive">
                <CircleX /> {failed}
              </Badge>
            ) : undefined
          }
          footer={failed > 0 ? "Open the run report to debug" : "Nothing failing"}
          sub="Console, network & trace captured"
          icon={<CircleX className="size-4 text-muted-foreground" />}
        />
      </div>

      <div className="flex flex-col gap-3">
        <h2 className="text-sm font-semibold">All captured scripts</h2>
        <ScriptsTable />
      </div>
    </div>
  )
}
