import { eq } from "drizzle-orm"
import { notFound } from "next/navigation"
import { BugDetailClient } from "@/components/bug-detail-client"
import { bugs, db } from "@/lib/db"

export const dynamic = "force-dynamic"

export default async function BugPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>
  searchParams?: Promise<{ annotate?: string }>
}) {
  const { id } = await params
  const { annotate } = (await searchParams) ?? {}
  const bug = db.select().from(bugs).where(eq(bugs.id, id)).get()
  if (!bug) notFound()

  return <BugDetailClient bug={bug} autoAnnotate={annotate === "1"} />
}
