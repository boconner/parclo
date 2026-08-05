import type { DashboardStore } from '@/types'

// Store list → CSV export. Columns: Chain, Store Name, Display Name, Address, Region.
//
//  · Chain        → the chain name, blank for independents.
//  · Store Name   → the raw store name, verbatim.
//  · Display Name → the store's explicit Display Name when set; otherwise a computed
//    fallback (storeExportName → computedStoreName):
//      - Chain store → the city, pulled from the stored "Street, City, ST Zip"
//        address (cityFromAddress), falling back to cleanStoreName when there's no
//        usable address. cleanStoreName strips the chain prefix ("GG-",
//        "Goody Goody - ") and a trailing "Store" from the name.
//      - Independent store (no chain) → its actual name, verbatim.
//  · Address      → the full stored string, as-is.
//  · Region       → the region/market name.

// ─── helpers (kept local to avoid pulling the jsPDF-heavy report module in) ─────

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

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

// ─── name cleaning ──────────────────────────────────────────────────────────────

/**
 * Strip the chain prefix and a trailing "Store" from a store's display name.
 *   "GG-Addison Store"      (chain "Goody Goody") → "Addison"
 *   "Goody Goody - Uptown"  (chain "Goody Goody") → "Uptown"
 *   "LD - Arlington"                              → "Arlington"
 *
 * Prefixes are matched chain-aware first (full chain name, then its initials),
 * then a conservative fallback for a short alpha abbreviation followed by a dash.
 */
export function cleanStoreName(name: string, chainName: string | null): string {
  let s = name.trim()

  const prefixes: string[] = []
  if (chainName) {
    prefixes.push(chainName)
    const initials = chainName.split(/\s+/).map(w => w[0] ?? '').join('')
    if (initials.length >= 2) prefixes.push(initials)
  }
  // Longest first so "Goody Goody" wins over a stray "G".
  prefixes.sort((a, b) => b.length - a.length)

  let stripped = false
  for (const p of prefixes) {
    const re = new RegExp(`^${escapeRegExp(p)}\\s*[-–—:]?\\s*`, 'i')
    if (re.test(s)) { s = s.replace(re, ''); stripped = true; break }
  }
  // Fallback: a short alpha abbreviation joined by a dash, e.g. "LD - " / "GG-".
  if (!stripped) {
    s = s.replace(/^[A-Za-z]{1,4}\s*[-–—]\s*/, '')
  }

  // Drop a trailing standalone "Store" and any leftover separators.
  s = s.replace(/\s*\bstore\b\s*$/i, '')
  s = s.replace(/^[-–—:\s]+/, '').trim()
  return s
}

// ─── city ───────────────────────────────────────────────────────────────────────

/** Pull the City out of a "Street, City, ST Zip" address; '' if not derivable. */
export function cityFromAddress(address: string | null): string {
  if (!address) return ''
  const parts = address.split(',').map(p => p.trim()).filter(Boolean)
  // The last segment is "ST Zip"; the city is the segment right before it.
  const last = parts[parts.length - 1] ?? ''
  const isStateZip = /^[A-Za-z]{2}\s+\d{5}(?:-\d{4})?$/.test(last)
  return isStateZip && parts.length >= 2 ? parts[parts.length - 2] : ''
}

// ─── store name ─────────────────────────────────────────────────────────────────

type StoreNameParts = Pick<DashboardStore, 'chainName' | 'name' | 'address'>

/** The Store-column name to use when a store has no explicit Display Name. */
export function computedStoreName(s: StoreNameParts): string {
  // Independents keep their actual name; chain stores reduce to the city.
  return s.chainName
    ? (cityFromAddress(s.address) || cleanStoreName(s.name, s.chainName))
    : s.name
}

/** The Store-column value: the explicit Display Name if set, else the computed name. */
export function storeExportName(s: StoreNameParts & Pick<DashboardStore, 'displayName'>): string {
  return s.displayName?.trim() || computedStoreName(s)
}

// ─── CSV export ─────────────────────────────────────────────────────────────────

export function exportStoresCSV(stores: DashboardStore[], filenameHint = 'stores') {
  const headers = ['Chain', 'Store Name', 'Display Name', 'Address', 'Region']
  const rows = stores.map(s => [
    s.chainName ?? '',      // blank for independents
    s.name,                 // raw store name
    storeExportName(s),     // explicit display name, else computed clean name
    s.address ?? '',
    s.regionName,
  ])
  const slug = filenameHint.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'stores'
  download(toCsv(headers, rows), `contento-${slug}-${Date.now()}.csv`, 'text/csv;charset=utf-8;')
}
