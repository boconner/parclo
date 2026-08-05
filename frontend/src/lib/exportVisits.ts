// Visit log → CSV export.
//
// Exports exactly what the user is looking at: the current market / chain /
// action / rep / search filters, in the current sort order. Anything else is
// surprising — a download that silently differs from the table above it.
//
// Mirrors the local-helper approach in exportStores.ts rather than importing the
// jsPDF-heavy report module.

export interface ExportableVisit {
  date:             string
  storeName:        string
  chainName?:       string
  regionName:       string
  rep:              string
  action?:          string | null
  logType?:         string | null
  onShelf:          number
  bottlesSold?:     number | null
  hoursWorked?:     number | null
  contactName?:     string
  notes:            string
  takeaways?:       string | null
  accomplishments?: string | null
}

const ACTION_LABELS: Record<string, string> = {
  'stocked':        'Stocked',
  'checked':        'Checked',
  'order-placed':   'Order Placed',
  'issue-reported': 'Issue Reported',
}

function toCsv(headers: string[], rows: (string | number | null)[][]): string {
  const escape = (v: string | number | null) => {
    const s = v === null ? '' : String(v)
    return s.includes(',') || s.includes('"') || s.includes('\n')
      ? `"${s.replace(/"/g, '""')}"` : s
  }
  return [headers, ...rows].map(r => r.map(escape).join(',')).join('\n')
}

function download(content: string, filename: string, mime: string) {
  const blob = new Blob([content], { type: mime })
  const url  = URL.createObjectURL(blob)
  const a    = document.createElement('a')
  a.href = url; a.download = filename; a.click()
  URL.revokeObjectURL(url)
}

/** "2026-07-31 14:05" — sorts correctly in a spreadsheet, unlike a locale string. */
function fmtDateTime(iso: string): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`
}

const HEADERS = [
  'Date', 'Store', 'Chain', 'Region', 'Rep', 'Type', 'Log Type',
  'On Shelf', 'Bottles Sold', 'Hours Worked', 'Contact',
  'Notes', 'Takeaways', 'Accomplishments',
]

export function visitsToCsv(visits: ExportableVisit[]): string {
  return toCsv(HEADERS, visits.map(v => [
    fmtDateTime(v.date),
    v.storeName,
    v.chainName || '',
    v.regionName,
    v.rep,
    v.action ? (ACTION_LABELS[v.action] ?? v.action) : '',
    v.logType ?? '',
    v.onShelf,
    v.bottlesSold ?? '',
    v.hoursWorked ?? '',
    v.contactName || '',
    v.notes || '',
    v.takeaways ?? '',
    v.accomplishments ?? '',
  ]))
}

/** Downloads the given visits as `visit-log-YYYY-MM-DD.csv`. */
export function exportVisits(visits: ExportableVisit[]): void {
  const today = new Date()
  const pad   = (n: number) => String(n).padStart(2, '0')
  const stamp = `${today.getFullYear()}-${pad(today.getMonth() + 1)}-${pad(today.getDate())}`
  download(visitsToCsv(visits), `visit-log-${stamp}.csv`, 'text/csv;charset=utf-8;')
}
