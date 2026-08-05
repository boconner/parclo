// Resolve a store's public-facing display name.
//
// This mirrors the frontend export logic (frontend/src/lib/exportStores.ts) so the
// WordPress locator feed, the app, and the CSV export all agree on a store's name.
// Keep the two in sync if the cleaning rules change.

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

/** Strip the chain prefix ("VV-", "Vine Valley - ") and a trailing "Store" from a name. */
export function cleanStoreName(name: string, chainName: string | null): string {
  let s = name.trim()

  const prefixes: string[] = []
  if (chainName) {
    prefixes.push(chainName)
    const initials = chainName.split(/\s+/).map(w => w[0] ?? '').join('')
    if (initials.length >= 2) prefixes.push(initials)
  }
  prefixes.sort((a, b) => b.length - a.length)

  let stripped = false
  for (const p of prefixes) {
    const re = new RegExp(`^${escapeRegExp(p)}\\s*[-–—:]?\\s*`, 'i')
    if (re.test(s)) { s = s.replace(re, ''); stripped = true; break }
  }
  if (!stripped) s = s.replace(/^[A-Za-z]{1,4}\s*[-–—]\s*/, '')

  s = s.replace(/\s*\bstore\b\s*$/i, '')
  s = s.replace(/^[-–—:\s]+/, '').trim()
  return s
}

/** Pull the City out of a "Street, City, ST Zip" address; '' if not derivable. */
export function cityFromAddress(address: string | null): string {
  if (!address) return ''
  const parts = address.split(',').map(p => p.trim()).filter(Boolean)
  if (parts.length === 0) return ''
  const last = parts[parts.length - 1] ?? ''
  const isStateZip = /^[A-Za-z]{2}\s+\d{5}(?:-\d{4})?$/.test(last)
  return isStateZip && parts.length >= 2 ? (parts[parts.length - 2] ?? '') : ''
}

export interface StoreNameParts {
  displayName: string | null
  chainName:   string | null
  name:        string
  address:     string | null
}

/** The public-facing name: explicit Display Name if set, else a computed clean name. */
export function resolveDisplayName(s: StoreNameParts): string {
  if (s.displayName && s.displayName.trim()) return s.displayName.trim()
  // Chain stores reduce to the city; independents keep their actual name.
  return s.chainName
    ? (cityFromAddress(s.address) || cleanStoreName(s.name, s.chainName))
    : s.name
}
