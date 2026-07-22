"use client"

import type {
  AnnotationShape,
  AnnotationShapeType,
  BugAnnotations,
} from "@pwrec/shared"
import { Download, MousePointer2, PenLine, Save, Trash2, X } from "lucide-react"
import * as React from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { cn } from "@/lib/utils"

type EditorTool = "select" | AnnotationShapeType

const TOOLS: { type: AnnotationShapeType; label: string }[] = [
  { type: "rect", label: "Rect" },
  { type: "ellipse", label: "Circle" },
  { type: "arrow", label: "Arrow" },
  { type: "pen", label: "Pen" },
  { type: "highlight", label: "Highlight" },
  { type: "text", label: "Text" },
]
const COLORS = [
  "#ef4444",
  "#f59e0b",
  "#22c55e",
  "#06b6d4",
  "#6366f1",
  "#111827",
]

const HANDLE_CURSORS: Record<string, string> = {
  nw: "nwse-resize",
  se: "nwse-resize",
  ne: "nesw-resize",
  sw: "nesw-resize",
  a: "move",
  b: "move",
}

interface BugAnnotatorProps {
  bugId: string
  mediaUrl: string
  initialAnnotations: BugAnnotations
  autoOpen?: boolean
}

interface DragState {
  mode: "move" | "resize"
  handle: string | null
  id: string
  start: { x: number; y: number }
  original: AnnotationShape
  moved: boolean
}

function fontSize(shape: AnnotationShape) {
  return Math.max(12, shape.strokeWidth * 12)
}

function shapeBounds(shape: AnnotationShape) {
  if (shape.type === "arrow") {
    const x2 = shape.x2 ?? shape.x
    const y2 = shape.y2 ?? shape.y
    return {
      x: Math.min(shape.x, x2),
      y: Math.min(shape.y, y2),
      w: Math.abs(x2 - shape.x),
      h: Math.abs(y2 - shape.y),
    }
  }
  if (shape.type === "pen") {
    const points = shape.points ?? []
    if (!points.length) return { x: shape.x, y: shape.y, w: 0, h: 0 }
    const xs = points.map((p) => p.x)
    const ys = points.map((p) => p.y)
    const x = Math.min(...xs)
    const y = Math.min(...ys)
    return { x, y, w: Math.max(...xs) - x, h: Math.max(...ys) - y }
  }
  if (shape.type === "text") {
    const size = fontSize(shape)
    const w = Math.max(30, (shape.text?.length ?? 0) * size * 0.55)
    return { x: shape.x, y: shape.y - size, w, h: size * 1.2 }
  }
  return {
    x: shape.x,
    y: shape.y,
    w: shape.width ?? 0,
    h: shape.height ?? 0,
  }
}

function moveShape(
  original: AnnotationShape,
  dx: number,
  dy: number
): AnnotationShape {
  return {
    ...original,
    x: original.x + dx,
    y: original.y + dy,
    x2: original.x2 != null ? original.x2 + dx : original.x2,
    y2: original.y2 != null ? original.y2 + dy : original.y2,
    points: original.points?.map((p) => ({ x: p.x + dx, y: p.y + dy })),
  }
}

function resizeShape(
  original: AnnotationShape,
  handle: string,
  p: { x: number; y: number }
): AnnotationShape {
  if (original.type === "arrow") {
    return handle === "a"
      ? { ...original, x: p.x, y: p.y }
      : { ...original, x2: p.x, y2: p.y }
  }
  const b = shapeBounds(original)
  if (original.type === "text") {
    const factor = (p.x - b.x) / Math.max(20, b.w)
    const next = original.strokeWidth * Math.max(0.2, factor)
    return { ...original, strokeWidth: Math.min(40, Math.max(1, next)) }
  }
  const anchor = {
    x: handle.includes("w") ? b.x + b.w : b.x,
    y: handle.includes("n") ? b.y + b.h : b.y,
  }
  const nx = Math.min(anchor.x, p.x)
  const ny = Math.min(anchor.y, p.y)
  const nw = Math.abs(p.x - anchor.x)
  const nh = Math.abs(p.y - anchor.y)
  if (original.type === "pen") {
    const fx = b.w ? nw / b.w : 1
    const fy = b.h ? nh / b.h : 1
    return {
      ...original,
      x: nx,
      y: ny,
      points: original.points?.map((pt) => ({
        x: nx + (pt.x - b.x) * fx,
        y: ny + (pt.y - b.y) * fy,
      })),
    }
  }
  return { ...original, x: nx, y: ny, width: nw, height: nh }
}

function renderShape(shape: AnnotationShape, selected = false) {
  const common = {
    stroke: shape.color,
    strokeWidth: shape.strokeWidth,
    fill: "none",
    vectorEffect: "non-scaling-stroke" as const,
  }
  if (shape.type === "rect" || shape.type === "highlight") {
    return (
      <rect
        key={shape.id}
        x={shape.x}
        y={shape.y}
        width={shape.width ?? 0}
        height={shape.height ?? 0}
        fill={shape.type === "highlight" ? shape.color : "none"}
        fillOpacity={shape.type === "highlight" ? 0.22 : 0}
        stroke={shape.color}
        strokeWidth={selected ? shape.strokeWidth + 2 : shape.strokeWidth}
        vectorEffect="non-scaling-stroke"
      />
    )
  }
  if (shape.type === "ellipse") {
    return (
      <ellipse
        key={shape.id}
        cx={shape.x + (shape.width ?? 0) / 2}
        cy={shape.y + (shape.height ?? 0) / 2}
        rx={Math.abs(shape.width ?? 0) / 2}
        ry={Math.abs(shape.height ?? 0) / 2}
        {...common}
        strokeWidth={selected ? shape.strokeWidth + 2 : shape.strokeWidth}
      />
    )
  }
  if (shape.type === "arrow") {
    return (
      <line
        key={shape.id}
        x1={shape.x}
        y1={shape.y}
        x2={shape.x2 ?? shape.x}
        y2={shape.y2 ?? shape.y}
        markerEnd="url(#arrowhead)"
        {...common}
        strokeWidth={selected ? shape.strokeWidth + 2 : shape.strokeWidth}
      />
    )
  }
  if (shape.type === "text") {
    return (
      <text
        key={shape.id}
        x={shape.x}
        y={shape.y}
        fill={shape.color}
        fontSize={fontSize(shape)}
        fontWeight="700"
      >
        {shape.text}
      </text>
    )
  }
  const d = (shape.points ?? [])
    .map((p, i) => `${i === 0 ? "M" : "L"} ${p.x} ${p.y}`)
    .join(" ")
  return <path key={shape.id} d={d} {...common} />
}

/** invisible fat target so thin strokes are easy to grab with the select tool */
function renderHitArea(shape: AnnotationShape) {
  const grab = {
    fill: "transparent",
    stroke: "transparent",
    strokeWidth: 20,
    vectorEffect: "non-scaling-stroke" as const,
  }
  if (
    shape.type === "rect" ||
    shape.type === "highlight" ||
    shape.type === "ellipse" ||
    shape.type === "text"
  ) {
    const b = shapeBounds(shape)
    return <rect x={b.x} y={b.y} width={b.w} height={b.h} {...grab} />
  }
  if (shape.type === "arrow") {
    return (
      <line
        x1={shape.x}
        y1={shape.y}
        x2={shape.x2 ?? shape.x}
        y2={shape.y2 ?? shape.y}
        {...grab}
      />
    )
  }
  const d = (shape.points ?? [])
    .map((p, i) => `${i === 0 ? "M" : "L"} ${p.x} ${p.y}`)
    .join(" ")
  return <path d={d} {...grab} fill="none" />
}

export function BugAnnotator({
  bugId,
  mediaUrl,
  initialAnnotations,
  autoOpen,
}: BugAnnotatorProps) {
  const [open, setOpen] = React.useState(Boolean(autoOpen))
  const [tool, setTool] = React.useState<EditorTool>("select")
  const [color, setColor] = React.useState(COLORS[0])
  const [strokeWidth, setStrokeWidth] = React.useState(5)
  const [annotations, setAnnotations] = React.useState(initialAnnotations)
  const [history, setHistory] = React.useState<BugAnnotations[]>([])
  const [selected, setSelected] = React.useState<string | null>(null)
  const [draft, setDraft] = React.useState<AnnotationShape | null>(null)
  const [saving, setSaving] = React.useState(false)
  const [textDraft, setTextDraft] = React.useState<{
    x: number
    y: number
    value: string
  } | null>(null)
  // viewBox height in a width-normalized (0-1000) space; 0 until the image
  // loads so we never draw against a wrong (square) aspect ratio
  const [viewH, setViewH] = React.useState(0)
  const dragRef = React.useRef<DragState | null>(null)

  const onImgLoad = (event: React.SyntheticEvent<HTMLImageElement>) => {
    const img = event.currentTarget
    if (img.naturalWidth > 0) {
      setViewH(Math.round((img.naturalHeight / img.naturalWidth) * 1000))
    }
  }

  const imgRef = (img: HTMLImageElement | null) => {
    // Cached images may skip onLoad; sync aspect as soon as the node mounts.
    if (img?.complete && img.naturalWidth > 0 && viewH <= 0) {
      setViewH(Math.round((img.naturalHeight / img.naturalWidth) * 1000))
    }
  }

  const toPoint = (event: React.PointerEvent<SVGSVGElement>) => {
    const rect = event.currentTarget.getBoundingClientRect()
    return {
      x: ((event.clientX - rect.left) / rect.width) * 1000,
      y: ((event.clientY - rect.top) / rect.height) * viewH,
    }
  }

  const selectedShape =
    annotations.shapes.find((shape) => shape.id === selected) ?? null

  const pushAnnotations = (next: BugAnnotations) => {
    setHistory((items) => [...items.slice(-20), annotations])
    setAnnotations(next)
  }

  const removeSelected = React.useCallback(() => {
    if (!selected) return
    pushAnnotations({
      version: 1,
      shapes: annotations.shapes.filter((shape) => shape.id !== selected),
    })
    setSelected(null)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selected, annotations])

  React.useEffect(() => {
    if (!open) return
    const onKey = (event: KeyboardEvent) => {
      const key = typeof event.key === "string" ? event.key : ""
      if (!key) return
      const target = event.target as HTMLElement | null
      if (
        target?.tagName === "INPUT" ||
        target?.tagName === "TEXTAREA" ||
        target?.isContentEditable
      ) {
        return
      }
      if (key === "Delete" || key === "Backspace") removeSelected()
      if (key === "Escape") setSelected(null)
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [open, removeSelected])

  const onPointerDown = (event: React.PointerEvent<SVGSVGElement>) => {
    // Wait until natural size is known so viewBox matches the screenshot.
    if (viewH <= 0) return
    event.currentTarget.setPointerCapture(event.pointerId)
    const target = event.target as SVGElement
    const p = toPoint(event)

    if (tool === "select") {
      const handle = target.dataset.handle
      if (handle && selectedShape) {
        dragRef.current = {
          mode: "resize",
          handle,
          id: selectedShape.id,
          start: p,
          original: selectedShape,
          moved: false,
        }
        return
      }
      const shapeId =
        target.closest<SVGGElement>("[data-shape-id]")?.dataset.shapeId
      const shape = annotations.shapes.find((s) => s.id === shapeId)
      if (shape) {
        setSelected(shape.id)
        dragRef.current = {
          mode: "move",
          handle: null,
          id: shape.id,
          start: p,
          original: shape,
          moved: false,
        }
      } else {
        setSelected(null)
      }
      return
    }

    if (tool === "text") {
      setTextDraft({ x: p.x, y: p.y, value: "" })
      return
    }
    const base: AnnotationShape = {
      id: crypto.randomUUID(),
      type: tool,
      x: p.x,
      y: p.y,
      x2: p.x,
      y2: p.y,
      width: 0,
      height: 0,
      points: tool === "pen" ? [p] : undefined,
      color,
      strokeWidth,
    }
    setDraft(base)
  }

  const onPointerMove = (event: React.PointerEvent<SVGSVGElement>) => {
    const p = toPoint(event)

    const drag = dragRef.current
    if (drag) {
      if (!drag.moved) {
        drag.moved = true
        // one history entry per drag, captured before the first change
        setHistory((items) => [...items.slice(-20), annotations])
      }
      const updated =
        drag.mode === "move"
          ? moveShape(drag.original, p.x - drag.start.x, p.y - drag.start.y)
          : resizeShape(drag.original, drag.handle!, p)
      setAnnotations((current) => ({
        version: 1,
        shapes: current.shapes.map((shape) =>
          shape.id === drag.id ? updated : shape
        ),
      }))
      return
    }

    if (!draft) return
    if (draft.type === "pen") {
      setDraft({ ...draft, points: [...(draft.points ?? []), p] })
      return
    }
    setDraft({
      ...draft,
      x: draft.type === "arrow" ? draft.x : Math.min(draft.x, p.x),
      y: draft.type === "arrow" ? draft.y : Math.min(draft.y, p.y),
      width: Math.abs(p.x - draft.x),
      height: Math.abs(p.y - draft.y),
      x2: p.x,
      y2: p.y,
    })
  }

  const onPointerUp = () => {
    dragRef.current = null
    if (!draft) return
    pushAnnotations({ version: 1, shapes: [...annotations.shapes, draft] })
    setDraft(null)
  }

  const commitTextDraft = () => {
    if (!textDraft) return
    const value = textDraft.value.trim()
    if (value) {
      pushAnnotations({
        version: 1,
        shapes: [
          ...annotations.shapes,
          {
            id: crypto.randomUUID(),
            type: "text",
            x: textDraft.x,
            y: textDraft.y,
            text: value,
            color,
            strokeWidth,
          },
        ],
      })
    }
    setTextDraft(null)
  }

  const save = async () => {
    setSaving(true)
    await fetch(`/api/bugs/${bugId}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ annotations }),
    })
    setSaving(false)
  }

  const undo = () => {
    const previous = history.at(-1)
    if (!previous) return
    setAnnotations(previous)
    setHistory((items) => items.slice(0, -1))
    setSelected(null)
  }

  const download = async () => {
    if (viewH <= 0) return
    const img = new Image()
    img.crossOrigin = "anonymous"
    img.src = mediaUrl
    await img.decode()
    const canvas = document.createElement("canvas")
    canvas.width = img.naturalWidth
    canvas.height = img.naturalHeight
    const ctx = canvas.getContext("2d")
    if (!ctx) return
    ctx.drawImage(img, 0, 0)
    const height = Math.round((img.naturalHeight / img.naturalWidth) * 1000)
    ctx.scale(canvas.width / 1000, canvas.height / height)
    for (const shape of annotations.shapes) {
      ctx.strokeStyle = shape.color
      ctx.fillStyle = shape.color
      ctx.lineWidth = shape.strokeWidth
      if (shape.type === "rect" || shape.type === "highlight") {
        if (shape.type === "highlight") {
          ctx.globalAlpha = 0.22
          ctx.fillRect(shape.x, shape.y, shape.width ?? 0, shape.height ?? 0)
          ctx.globalAlpha = 1
        }
        ctx.strokeRect(shape.x, shape.y, shape.width ?? 0, shape.height ?? 0)
      } else if (shape.type === "ellipse") {
        ctx.beginPath()
        ctx.ellipse(
          shape.x + (shape.width ?? 0) / 2,
          shape.y + (shape.height ?? 0) / 2,
          Math.abs(shape.width ?? 0) / 2,
          Math.abs(shape.height ?? 0) / 2,
          0,
          0,
          Math.PI * 2
        )
        ctx.stroke()
      } else if (shape.type === "text") {
        ctx.font = `700 ${fontSize(shape)}px sans-serif`
        ctx.fillText(shape.text ?? "", shape.x, shape.y)
      } else {
        const points = shape.points ?? [
          { x: shape.x, y: shape.y },
          { x: shape.x2 ?? shape.x, y: shape.y2 ?? shape.y },
        ]
        ctx.beginPath()
        points.forEach((p, i) =>
          i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y)
        )
        ctx.stroke()
      }
    }
    const a = document.createElement("a")
    a.download = `retrace-bug-${bugId}.png`
    a.href = canvas.toDataURL("image/png")
    a.click()
  }

  const selectionOverlay = () => {
    if (!selectedShape || tool !== "select") return null
    const b = shapeBounds(selectedShape)
    const handles: { id: string; x: number; y: number }[] =
      selectedShape.type === "arrow"
        ? [
            { id: "a", x: selectedShape.x, y: selectedShape.y },
            {
              id: "b",
              x: selectedShape.x2 ?? selectedShape.x,
              y: selectedShape.y2 ?? selectedShape.y,
            },
          ]
        : selectedShape.type === "text"
          ? [{ id: "se", x: b.x + b.w, y: b.y + b.h }]
          : [
              { id: "nw", x: b.x, y: b.y },
              { id: "ne", x: b.x + b.w, y: b.y },
              { id: "sw", x: b.x, y: b.y + b.h },
              { id: "se", x: b.x + b.w, y: b.y + b.h },
            ]
    return (
      <g>
        <rect
          x={b.x}
          y={b.y}
          width={b.w}
          height={b.h}
          fill="none"
          stroke="#3b82f6"
          strokeWidth={1.5}
          strokeDasharray="6 4"
          vectorEffect="non-scaling-stroke"
          pointerEvents="none"
        />
        {handles.map((handle) => (
          <circle
            key={handle.id}
            data-handle={handle.id}
            cx={handle.x}
            cy={handle.y}
            r={9}
            fill="#3b82f6"
            stroke="#ffffff"
            strokeWidth={2}
            vectorEffect="non-scaling-stroke"
            style={{ cursor: HANDLE_CURSORS[handle.id] ?? "pointer" }}
          />
        ))}
      </g>
    )
  }

  const editor = (
    <div className="flex min-h-0 flex-1 flex-col gap-3">
      <div className="flex shrink-0 flex-wrap items-center gap-2">
        <Button
          type="button"
          size="sm"
          variant={tool === "select" ? "default" : "outline"}
          onClick={() => setTool("select")}
        >
          <MousePointer2 className="size-3" /> Select
        </Button>
        {TOOLS.map((item) => (
          <Button
            key={item.type}
            type="button"
            size="sm"
            variant={tool === item.type ? "default" : "outline"}
            onClick={() => setTool(item.type)}
          >
            {item.label}
          </Button>
        ))}
        <div className="flex items-center gap-1">
          {COLORS.map((item) => (
            <button
              key={item}
              type="button"
              aria-label={item}
              className={cn(
                "size-6 rounded-full border",
                color === item && "ring-2 ring-ring"
              )}
              style={{ background: item }}
              onClick={() => setColor(item)}
            />
          ))}
        </div>
        <input
          type="range"
          min={2}
          max={16}
          value={strokeWidth}
          onChange={(event) => setStrokeWidth(Number(event.target.value))}
        />
        <Button type="button" size="sm" variant="outline" onClick={undo}>
          Undo
        </Button>
        <Button
          type="button"
          size="sm"
          variant="outline"
          onClick={removeSelected}
          disabled={!selected}
        >
          <Trash2 className="size-3" /> Delete
        </Button>
        <Button type="button" size="sm" variant="outline" onClick={download}>
          <Download className="size-3" /> Download
        </Button>
        <Button type="button" size="sm" onClick={save} disabled={saving}>
          <Save className="size-3" /> {saving ? "Saving..." : "Save"}
        </Button>
      </div>
      <div className="min-h-0 flex-1 overflow-auto rounded-lg border bg-muted">
        {/* shrink-wrap the image so the SVG overlay aligns with it exactly */}
        <div className="relative mx-auto w-fit min-w-0 p-2">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            ref={imgRef}
            src={mediaUrl}
            alt=""
            onLoad={onImgLoad}
            className="block h-auto max-w-full"
          />
          {viewH > 0 && (
            <svg
              className={cn(
                "absolute inset-0 h-full w-full touch-none",
                tool !== "select" && "cursor-crosshair"
              )}
              viewBox={`0 0 1000 ${viewH}`}
              preserveAspectRatio="none"
              onPointerDown={onPointerDown}
              onPointerMove={onPointerMove}
              onPointerUp={onPointerUp}
            >
              <defs>
                <marker
                  id="arrowhead"
                  markerWidth="10"
                  markerHeight="7"
                  refX="9"
                  refY="3.5"
                  orient="auto"
                >
                  <polygon points="0 0, 10 3.5, 0 7" fill={color} />
                </marker>
              </defs>
              {[...annotations.shapes, ...(draft ? [draft] : [])].map(
                (shape) => (
                  <g
                    key={shape.id}
                    data-shape-id={shape.id}
                    className={tool === "select" ? "cursor-move" : undefined}
                  >
                    {renderShape(shape, selected === shape.id)}
                    {tool === "select" && renderHitArea(shape)}
                  </g>
                )
              )}
              {selectionOverlay()}
            </svg>
          )}
          {textDraft && viewH > 0 && (
            <div
              className="absolute z-10 flex w-64 items-center gap-1.5 rounded-lg border bg-popover p-2 shadow-md"
              style={{
                left: `min(${textDraft.x / 10}%, calc(100% - 17rem))`,
                top: `min(${(textDraft.y / viewH) * 100}%, calc(100% - 3.5rem))`,
              }}
              onPointerDown={(event) => event.stopPropagation()}
            >
              <Input
                autoFocus
                placeholder="Annotation text"
                value={textDraft.value}
                onChange={(event) =>
                  setTextDraft({ ...textDraft, value: event.target.value })
                }
                onKeyDown={(event) => {
                  const key = typeof event.key === "string" ? event.key : ""
                  if (key === "Enter") commitTextDraft()
                  if (key === "Escape") setTextDraft(null)
                }}
              />
              <Button type="button" size="sm" onClick={commitTextDraft}>
                Add
              </Button>
              <Button
                type="button"
                size="icon-sm"
                variant="ghost"
                aria-label="Cancel"
                onClick={() => setTextDraft(null)}
              >
                <X />
              </Button>
            </div>
          )}
        </div>
      </div>
    </div>
  )

  return (
    <>
      <div className="flex flex-col gap-3">
        <div className="relative overflow-hidden rounded-lg border bg-muted">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            ref={imgRef}
            src={mediaUrl}
            alt=""
            onLoad={onImgLoad}
            className="w-full object-contain"
          />
          {viewH > 0 && (
            <svg
              className="pointer-events-none absolute inset-0 h-full w-full"
              viewBox={`0 0 1000 ${viewH}`}
              preserveAspectRatio="none"
            >
              <defs>
                <marker
                  id="arrowhead"
                  markerWidth="10"
                  markerHeight="7"
                  refX="9"
                  refY="3.5"
                  orient="auto"
                >
                  <polygon points="0 0, 10 3.5, 0 7" fill={color} />
                </marker>
              </defs>
              {annotations.shapes.map((shape) => renderShape(shape))}
            </svg>
          )}
        </div>
        <Button type="button" onClick={() => setOpen(true)}>
          <PenLine className="size-4" /> Annotate screenshot
        </Button>
      </div>
      {open && (
        <div
          data-retrace-annotator
          className="fixed inset-0 z-50 flex h-dvh flex-col gap-3 overflow-hidden bg-background p-4"
        >
          <div className="flex shrink-0 items-center justify-between">
            <h2 className="font-heading text-lg font-semibold">Annotate bug</h2>
            <Button
              type="button"
              variant="outline"
              onClick={() => setOpen(false)}
            >
              <X className="size-4" /> Close
            </Button>
          </div>
          {editor}
        </div>
      )}
    </>
  )
}
