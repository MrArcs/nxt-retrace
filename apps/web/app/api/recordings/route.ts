import { generateSpec, type Step } from "@pwrec/shared"
import { NextResponse } from "next/server"
import { z } from "zod"
import { db, scripts } from "@/lib/db"

const candidateSchema = z.object({
  kind: z.enum(["testId", "role", "label", "placeholder", "text", "css"]),
  value: z.string(),
  name: z.string().optional(),
  nth: z.number().int().nonnegative().optional(),
})

const stepSchema = z.object({
  type: z.enum(["goto", "click", "dblclick", "fill", "press", "select", "check", "uncheck", "upload"]),
  url: z.string().optional(),
  locator: z.array(candidateSchema).optional(),
  value: z.string().optional(),
  key: z.string().optional(),
  values: z.array(z.string()).optional(),
  fileName: z.string().optional(),
  description: z.string().optional(),
})

const bodySchema = z.object({
  name: z.string().trim().min(1).max(200),
  url: z.string().max(2000),
  steps: z.array(stepSchema).min(1).max(500),
})

export async function POST(request: Request) {
  let json: unknown
  try {
    json = await request.json()
  } catch {
    return NextResponse.json({ success: false, error: "Invalid JSON body" }, { status: 400 })
  }
  const parsed = bodySchema.safeParse(json)
  if (!parsed.success) {
    return NextResponse.json(
      { success: false, error: `Invalid recording: ${parsed.error.issues[0]?.message}` },
      { status: 400 },
    )
  }

  const { name, url, steps } = parsed.data
  const id = crypto.randomUUID()
  const now = new Date()
  try {
    const { code } = generateSpec(name, steps as Step[])
    db.insert(scripts)
      .values({ id, name, url, steps: steps as Step[], code, createdAt: now, updatedAt: now })
      .run()
  } catch (err) {
    console.error("Failed to save recording", err)
    return NextResponse.json({ success: false, error: "Failed to save recording" }, { status: 500 })
  }
  return NextResponse.json({ success: true, id })
}
