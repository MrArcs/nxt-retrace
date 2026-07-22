import type { RunStatus } from "@pwrec/shared"
import { Badge } from "@/components/ui/badge"

const VARIANTS: Record<RunStatus, "default" | "secondary" | "destructive" | "outline"> = {
  passed: "default",
  failed: "destructive",
  error: "destructive",
  running: "secondary",
}

export function StatusBadge({ status }: { status: RunStatus }) {
  return (
    <Badge variant={VARIANTS[status]} className="capitalize">
      {status}
    </Badge>
  )
}
