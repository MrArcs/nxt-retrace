import type { BugStatus } from "@pwrec/shared"
import { Badge } from "@/components/ui/badge"

const VARIANTS: Record<
  BugStatus,
  "default" | "secondary" | "destructive" | "outline"
> = {
  open: "destructive",
  in_progress: "secondary",
  resolved: "default",
}

export function BugStatusBadge({ status }: { status: BugStatus }) {
  return (
    <Badge variant={VARIANTS[status]} className="capitalize">
      {status.replace("_", " ")}
    </Badge>
  )
}
