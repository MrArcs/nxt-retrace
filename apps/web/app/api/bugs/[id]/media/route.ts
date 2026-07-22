import fs from "node:fs"
import path from "node:path"
import { eq } from "drizzle-orm"
import { NextResponse } from "next/server"
import { bugs, db } from "@/lib/db"

export const runtime = "nodejs"

const CONTENT_TYPES: Record<string, string> = {
  ".png": "image/png",
  ".webm": "video/webm",
  ".mp4": "video/mp4",
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const bug = db.select().from(bugs).where(eq(bugs.id, id)).get()
  if (!bug || !fs.existsSync(bug.mediaPath)) {
    return NextResponse.json(
      { success: false, error: "Media not found" },
      { status: 404 }
    )
  }
  return new NextResponse(new Uint8Array(fs.readFileSync(bug.mediaPath)), {
    headers: {
      "content-type":
        CONTENT_TYPES[path.extname(bug.mediaPath)] ??
        "application/octet-stream",
    },
  })
}
