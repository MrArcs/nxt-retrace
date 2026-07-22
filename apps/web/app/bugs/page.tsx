import type { BugStatus } from "@pwrec/shared"
import { desc } from "drizzle-orm"
import { Bug, Camera, Clapperboard } from "lucide-react"
import Link from "next/link"
import { BugStatusBadge } from "@/components/bug-status-badge"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardHeader } from "@/components/ui/card"
import { bugs, db } from "@/lib/db"
import { fmtDate } from "@/lib/format"
import { cn } from "@/lib/utils"

export const dynamic = "force-dynamic"

const FILTERS: { label: string; value: BugStatus | "all" }[] = [
  { label: "All", value: "all" },
  { label: "Open", value: "open" },
  { label: "In progress", value: "in_progress" },
  { label: "Resolved", value: "resolved" },
]

export default async function BugsPage({
  searchParams,
}: {
  searchParams?: Promise<{ status?: string }>
}) {
  const { status } = (await searchParams) ?? {}
  const activeStatus =
    status === "open" || status === "in_progress" || status === "resolved"
      ? status
      : "all"
  const allBugs = db.select().from(bugs).orderBy(desc(bugs.createdAt)).all()
  const visibleBugs =
    activeStatus === "all"
      ? allBugs
      : allBugs.filter((bug) => bug.status === activeStatus)

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-end justify-between gap-4">
        <div className="flex flex-col gap-1">
          <h1 className="font-heading text-lg font-semibold">Bugs</h1>
          <p className="text-sm text-muted-foreground">
            Screenshot and tab recordings captured from the extension.
          </p>
        </div>
        <Badge variant="outline" className="gap-1">
          <Bug className="size-3" />
          {allBugs.length} total
        </Badge>
      </div>

      <div className="flex flex-wrap gap-2">
        {FILTERS.map((filter) => {
          const href =
            filter.value === "all" ? "/bugs" : `/bugs?status=${filter.value}`
          const active = activeStatus === filter.value
          return (
            <Link
              key={filter.value}
              href={href}
              className={cn(
                "rounded-full border px-3 py-1 text-sm transition-colors hover:bg-muted",
                active && "bg-primary text-primary-foreground hover:bg-primary"
              )}
            >
              {filter.label}
            </Link>
          )
        })}
      </div>

      {visibleBugs.length ? (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {visibleBugs.map((bug) => (
            <Link key={bug.id} href={`/bugs/${bug.id}`} className="group">
              <Card className="h-full overflow-hidden transition-colors group-hover:border-primary/40">
                <div className="aspect-video bg-muted">
                  {bug.kind === "screenshot" ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={`/api/bugs/${bug.id}/media`}
                      alt=""
                      className="h-full w-full object-cover"
                    />
                  ) : (
                    <div className="flex h-full items-center justify-center text-muted-foreground">
                      <Clapperboard className="size-10" />
                    </div>
                  )}
                </div>
                <CardHeader className="gap-2">
                  <div className="flex items-center justify-between gap-2">
                    <Badge variant="outline" className="gap-1 capitalize">
                      {bug.kind === "screenshot" ? (
                        <Camera className="size-3" />
                      ) : (
                        <Clapperboard className="size-3" />
                      )}
                      {bug.kind}
                    </Badge>
                    <BugStatusBadge status={bug.status} />
                  </div>
                  <div className="min-w-0">
                    <h2 className="truncate font-heading text-sm font-semibold">
                      {bug.title}
                    </h2>
                    <p className="truncate text-xs text-muted-foreground">
                      {bug.pageUrl}
                    </p>
                  </div>
                </CardHeader>
                <CardContent className="text-xs text-muted-foreground">
                  Captured {fmtDate(bug.createdAt)}
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      ) : (
        <Card>
          <CardContent className="flex flex-col items-center gap-2 py-16 text-center text-sm text-muted-foreground">
            <Bug className="size-8" />
            No {activeStatus === "all"
              ? ""
              : activeStatus.replace("_", " ")}{" "}
            bugs captured yet.
          </CardContent>
        </Card>
      )}
    </div>
  )
}
