import fs from "node:fs"
import path from "node:path"
import type { BugAnnotations, BugStatus } from "@pwrec/shared"
import { eq } from "drizzle-orm"
import { NextResponse } from "next/server"
import { z } from "zod"
import { bugs, db } from "@/lib/db"

export const runtime = "nodejs"

const patchSchema = z.object({
  title: z.string().trim().min(1).max(200).optional(),
  description: z.string().max(4000).optional(),
  status: z.enum(["open", "in_progress", "resolved"]).optional(),
  annotations: z
    .object({
      version: z.literal(1),
      shapes: z.array(z.record(z.unknown())),
    })
    .optional(),
})

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const bug = db.select().from(bugs).where(eq(bugs.id, id)).get()
  if (!bug) {
    return NextResponse.json(
      { success: false, error: "Bug not found" },
      { status: 404 }
    )
  }
  return NextResponse.json({ success: true, bug })
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const body = await request.json().catch(() => null)
  const parsed = patchSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json(
      {
        success: false,
        error: parsed.error.issues[0]?.message ?? "Invalid update",
      },
      { status: 400 }
    )
  }
  const existing = db.select().from(bugs).where(eq(bugs.id, id)).get()
  if (!existing) {
    return NextResponse.json(
      { success: false, error: "Bug not found" },
      { status: 404 }
    )
  }

  db.update(bugs)
    .set({
      ...parsed.data,
      status: parsed.data.status as BugStatus | undefined,
      annotations: parsed.data.annotations as BugAnnotations | undefined,
      updatedAt: new Date(),
    })
    .where(eq(bugs.id, id))
    .run()

  return NextResponse.json({ success: true })
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const bug = db.select().from(bugs).where(eq(bugs.id, id)).get()
  if (!bug) {
    return NextResponse.json(
      { success: false, error: "Bug not found" },
      { status: 404 }
    )
  }
  db.delete(bugs).where(eq(bugs.id, id)).run()
  fs.rmSync(path.dirname(bug.mediaPath), { recursive: true, force: true })
  return NextResponse.json({ success: true })
}
