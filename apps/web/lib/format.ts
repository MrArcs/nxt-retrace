export function fmtDate(d: Date | number | null): string {
  if (d == null) return "—"
  return new Intl.DateTimeFormat("en", { dateStyle: "medium", timeStyle: "short" }).format(d)
}

export function fmtDuration(start: Date | number, end: Date | number | null): string {
  if (end == null) return "—"
  const ms = +end - +start
  return ms < 1000 ? `${ms}ms` : `${(ms / 1000).toFixed(1)}s`
}
