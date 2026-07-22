import fs from "node:fs"
import path from "node:path"
import { eq } from "drizzle-orm"
import { NextResponse } from "next/server"
import { db, runs } from "@/lib/db"

const ALLOWED =
  /^(console|network|report)\.json$|^(screenshot-\d+|step-\d{3})\.png$|^trace\.zip$/

const CONTENT_TYPES: Record<string, string> = {
  ".json": "application/json",
  ".png": "image/png",
  ".zip": "application/zip",
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string; name: string }> }
) {
  const { id, name } = await params
  if (!ALLOWED.test(name)) {
    return NextResponse.json(
      { success: false, error: "Unknown artifact" },
      { status: 404 }
    )
  }
  const run = db.select().from(runs).where(eq(runs.id, id)).get()
  if (!run) {
    return NextResponse.json(
      { success: false, error: "Run not found" },
      { status: 404 }
    )
  }
  const file = path.join(run.runDir, name)
  if (!fs.existsSync(file)) {
    return NextResponse.json(
      { success: false, error: "Artifact not found" },
      { status: 404 }
    )
  }
  return new NextResponse(new Uint8Array(fs.readFileSync(file)), {
    headers: {
      "content-type":
        CONTENT_TYPES[path.extname(name)] ?? "application/octet-stream",
    },
  })
}
