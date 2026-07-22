"use client"

import type { BugRow } from "@/lib/db"
import type { BugStatus } from "@pwrec/shared"
import { ExternalLink, Trash2 } from "lucide-react"
import { useRouter } from "next/navigation"
import * as React from "react"
import { BugAnnotator } from "@/components/bug-annotator"
import { BugStatusBadge } from "@/components/bug-status-badge"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog"
import { Button, buttonVariants } from "@/components/ui/button"
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
import { fmtDate } from "@/lib/format"
import { cn } from "@/lib/utils"

interface BugDetailClientProps {
  bug: BugRow
  autoAnnotate: boolean
}

const STATUSES: BugStatus[] = ["open", "in_progress", "resolved"]

export function BugDetailClient({ bug, autoAnnotate }: BugDetailClientProps) {
  const router = useRouter()
  const [title, setTitle] = React.useState(bug.title)
  const [description, setDescription] = React.useState(bug.description)
  const [status, setStatus] = React.useState<BugStatus>(bug.status)
  const mediaUrl = `/api/bugs/${bug.id}/media`

  const patch = async (body: Record<string, unknown>) => {
    await fetch(`/api/bugs/${bug.id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    })
    router.refresh()
  }

  const deleteBug = async () => {
    await fetch(`/api/bugs/${bug.id}`, { method: "DELETE" })
    router.push("/bugs")
    router.refresh()
  }

  const context = bug.context
  const problemLogs = context.console.filter((entry) =>
    ["warn", "error", "pageerror", "unhandledrejection"].includes(entry.level)
  )

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="flex flex-1 flex-col gap-3">
          <div className="flex flex-wrap items-center gap-2">
            <BugStatusBadge status={status} />
            <span className="text-xs text-muted-foreground">
              Captured {fmtDate(bug.createdAt)}
            </span>
          </div>
          <input
            className="w-full bg-transparent font-heading text-2xl font-semibold outline-none"
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            onBlur={() => patch({ title })}
          />
          <textarea
            className="min-h-20 w-full resize-y rounded-lg border bg-background p-3 text-sm outline-none"
            value={description}
            placeholder="Add expected behavior, impact, or triage notes..."
            onChange={(event) => setDescription(event.target.value)}
            onBlur={() => patch({ description })}
          />
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <select
            value={status}
            className="rounded-md border bg-background px-3 py-2 text-sm"
            onChange={(event) => {
              const next = event.target.value as BugStatus
              setStatus(next)
              patch({ status: next })
            }}
          >
            {STATUSES.map((item) => (
              <option key={item} value={item}>
                {item.replace("_", " ")}
              </option>
            ))}
          </select>
          <a
            href={bug.pageUrl}
            target="_blank"
            rel="noreferrer"
            className={cn(buttonVariants({ variant: "outline" }))}
          >
            <ExternalLink className="size-4" /> Open page
          </a>
          <AlertDialog>
            <AlertDialogTrigger render={<Button variant="destructive" />}>
              <Trash2 className="size-4" /> Delete
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Delete this bug?</AlertDialogTitle>
                <AlertDialogDescription>
                  This removes the captured media, annotations, and debug
                  context from local storage.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancel</AlertDialogCancel>
                <AlertDialogAction variant="destructive" onClick={deleteBug}>
                  Delete
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </div>
      </div>

      <div className="grid items-stretch gap-6 xl:grid-cols-[minmax(0,1.4fr)_minmax(380px,0.8fr)]">
        <Card className="flex max-h-[min(75vh,52rem)] flex-col overflow-hidden">
          <CardHeader className="shrink-0">
            <CardTitle className="text-sm capitalize">{bug.kind}</CardTitle>
          </CardHeader>
          <CardContent className="min-h-0 flex-1 overflow-auto">
            {bug.kind === "screenshot" ? (
              <BugAnnotator
                bugId={bug.id}
                mediaUrl={mediaUrl}
                initialAnnotations={bug.annotations}
                autoOpen={autoAnnotate}
              />
            ) : (
              <video
                src={mediaUrl}
                controls
                className="w-full rounded-lg border bg-black"
              />
            )}
          </CardContent>
        </Card>

        <Card className="flex max-h-[min(75vh,52rem)] flex-col overflow-hidden">
          <CardHeader className="shrink-0">
            <CardTitle className="text-sm">Debug context</CardTitle>
          </CardHeader>
          <CardContent className="flex min-h-0 flex-1 flex-col overflow-hidden">
            <Tabs
              defaultValue="steps"
              className="flex min-h-0 flex-1 flex-col gap-0"
            >
              <TabsList variant="line" className="shrink-0 flex-wrap">
                <TabsTrigger value="steps">
                  Steps ({context.events.length})
                </TabsTrigger>
                <TabsTrigger value="console">
                  Console ({problemLogs.length})
                </TabsTrigger>
                <TabsTrigger value="network">
                  Network ({context.network.length})
                </TabsTrigger>
                <TabsTrigger value="metadata">Metadata</TabsTrigger>
              </TabsList>
              <TabsContent
                value="steps"
                className="min-h-0 flex-1 overflow-auto pt-3"
              >
                {context.events.length ? (
                  <ol className="flex flex-col divide-y rounded-lg border text-sm">
                    {context.events.map((event, index) => (
                      <li key={index} className="flex gap-3 px-3 py-2">
                        <span className="text-muted-foreground tabular-nums">
                          {index + 1}
                        </span>
                        <span>{event.description}</span>
                      </li>
                    ))}
                  </ol>
                ) : (
                  <p className="text-sm text-muted-foreground">
                    No user events captured.
                  </p>
                )}
              </TabsContent>
              <TabsContent
                value="console"
                className="min-h-0 flex-1 overflow-auto pt-3"
              >
                {context.console.length ? (
                  <ul className="flex flex-col divide-y rounded-lg border font-mono text-xs">
                    {context.console.map((entry, index) => (
                      <li key={index} className="px-3 py-2">
                        <span className="mr-2 rounded bg-muted px-1.5 py-0.5">
                          {entry.level}
                        </span>
                        <span className="break-all whitespace-pre-wrap">
                          {entry.text}
                        </span>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="text-sm text-muted-foreground">
                    No console entries captured.
                  </p>
                )}
              </TabsContent>
              <TabsContent
                value="network"
                className="min-h-0 flex-1 overflow-auto pt-3"
              >
                {context.network.length ? (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Method</TableHead>
                        <TableHead>URL</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead>Time</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {context.network.slice(-100).map((entry, index) => (
                        <TableRow key={index}>
                          <TableCell className="font-mono text-xs">
                            {entry.method}
                          </TableCell>
                          <TableCell className="max-w-56 truncate text-xs">
                            {entry.url}
                          </TableCell>
                          <TableCell>{entry.status || "—"}</TableCell>
                          <TableCell>{entry.durationMs}ms</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                ) : (
                  <p className="text-sm text-muted-foreground">
                    No network entries captured.
                  </p>
                )}
              </TabsContent>
              <TabsContent
                value="metadata"
                className="min-h-0 flex-1 overflow-auto pt-3"
              >
                <dl className="grid gap-3 text-sm">
                  <div>
                    <dt className="text-muted-foreground">URL</dt>
                    <dd className="break-all">{context.pageUrl}</dd>
                  </div>
                  <div>
                    <dt className="text-muted-foreground">Browser</dt>
                    <dd className="break-all">{context.device.userAgent}</dd>
                  </div>
                  <div>
                    <dt className="text-muted-foreground">Platform</dt>
                    <dd>{context.device.platform}</dd>
                  </div>
                  <div>
                    <dt className="text-muted-foreground">Viewport</dt>
                    <dd>
                      {context.device.viewport.width} x{" "}
                      {context.device.viewport.height}
                    </dd>
                  </div>
                </dl>
              </TabsContent>
            </Tabs>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
