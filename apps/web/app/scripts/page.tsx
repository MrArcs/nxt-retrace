import { ScriptsTable } from "@/components/scripts-table"

export const dynamic = "force-dynamic"

export default function ScriptsPage() {
  return (
    <div className="flex flex-col gap-4">
      <h1 className="font-heading text-lg font-semibold">Scripts</h1>
      <ScriptsTable />
    </div>
  )
}
