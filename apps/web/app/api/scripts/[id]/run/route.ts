import { eq } from "drizzle-orm"
import { NextResponse } from "next/server"
import { db, scripts } from "@/lib/db"
import { startRun } from "@/lib/runner/run"

export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const script = db.select().from(scripts).where(eq(scripts.id, id)).get()
  if (!script) {
    return NextResponse.json({ success: false, error: "Script not found" }, { status: 404 })
  }
  try {
    const runId = startRun(script)
    return NextResponse.json({ success: true, runId })
  } catch (err) {
    console.error("Failed to start run", err)
    return NextResponse.json({ success: false, error: "Failed to start run" }, { status: 500 })
  }
}
