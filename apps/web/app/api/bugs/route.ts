import fs from "node:fs"
import path from "node:path"
import { randomUUID } from "node:crypto"
import type { BugAnnotations, BugContext, BugKind } from "@pwrec/shared"
import { desc } from "drizzle-orm"
import { NextResponse } from "next/server"
import { z } from "zod"
import { BUGS_DIR } from "@/lib/config"
import { bugs, db } from "@/lib/db"

export const runtime = "nodejs"

const kindSchema = z.enum(["screenshot", "recording"])

function parseJson<T>(value: FormDataEntryValue | null, fallback: T): T {
  if (typeof value !== "string") return fallback
  try {
    return JSON.parse(value) as T
  } catch {
    return fallback
  }
}

function mediaExt(kind: BugKind, file: File) {
  if (kind === "screenshot") return ".png"
  if (file.type === "video/mp4") return ".mp4"
  return ".webm"
}

export async function GET() {
  return NextResponse.json({
    success: true,
    bugs: db.select().from(bugs).orderBy(desc(bugs.createdAt)).all(),
  })
}

export async function POST(request: Request) {
  const form = await request.formData()
  const parsedKind = kindSchema.safeParse(form.get("kind"))
  const file = form.get("media")
  if (!parsedKind.success || !(file instanceof File)) {
    return NextResponse.json(
      { success: false, error: "Bug kind and media file are required" },
      { status: 400 }
    )
  }

  const id = randomUUID()
  const now = new Date()
  const bugDir = path.join(BUGS_DIR, id)
  fs.mkdirSync(bugDir, { recursive: true })

  const kind = parsedKind.data
  const mediaPath = path.join(bugDir, `media${mediaExt(kind, file)}`)
  fs.writeFileSync(mediaPath, Buffer.from(await file.arrayBuffer()))

  const context = parseJson<BugContext>(form.get("context"), {
    pageUrl: String(form.get("pageUrl") ?? ""),
    title: "Captured bug",
    timestamp: now.getTime(),
    device: {
      userAgent: "",
      platform: "",
      language: "",
      viewport: { width: 0, height: 0 },
      screen: { width: 0, height: 0 },
    },
    console: [],
    network: [],
    events: [],
  })
  const annotations: BugAnnotations = { version: 1, shapes: [] }
  const title = String(form.get("title") ?? context.title ?? "Captured bug")
    .trim()
    .slice(0, 200)

  db.insert(bugs)
    .values({
      id,
      title: title || "Captured bug",
      description: "",
      kind,
      mediaPath,
      annotations,
      status: "open",
      pageUrl: String(form.get("pageUrl") ?? context.pageUrl ?? ""),
      context,
      createdAt: now,
      updatedAt: now,
    })
    .run()

  return NextResponse.json({ success: true, id })
}
