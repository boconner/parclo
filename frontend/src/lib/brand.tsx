import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'

// Deployment brand identity, served by the public /api/brand endpoint and
// editable in Configuration → Branding. The accent color is applied as CSS
// variables at the document root, so Tailwind's `accent` classes re-theme at
// runtime — no rebuild per customer.

export interface BrandInfo {
  brandName:    string
  logoUrl:      string | null
  primaryColor: string
}

export const DEFAULT_BRAND: BrandInfo = {
  brandName:    'Parclo',
  logoUrl:      null,
  primaryColor: '#724fac',
}

const STORAGE_KEY = 'brand'
const BASE = import.meta.env.VITE_API_URL ?? ''

export function hexToRgb(hex: string): [number, number, number] | null {
  const m = /^#([0-9a-f]{6})$/i.exec(hex.trim())
  if (!m) return null
  const n = parseInt(m[1]!, 16)
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255]
}

/** Mix a channel toward a target (255 = lighten, 0 = darken) by `amount`. */
const mix = (c: number, target: number, amount: number) => Math.round(c + (target - c) * amount)

/** Set the accent CSS variables that tailwind.config.js and index.css read. */
export function applyBrandTheme(primaryColor: string): void {
  const rgb = hexToRgb(primaryColor) ?? hexToRgb(DEFAULT_BRAND.primaryColor)!
  const [r, g, b] = rgb
  const root = document.documentElement.style
  root.setProperty('--accent', primaryColor)
  root.setProperty('--accent-rgb', `${r} ${g} ${b}`)
  root.setProperty('--accent-hover', `rgb(${mix(r, 0, 0.17)} ${mix(g, 0, 0.17)} ${mix(b, 0, 0.17)})`)
  root.setProperty('--accent-light', `rgb(${mix(r, 255, 0.92)} ${mix(g, 255, 0.92)} ${mix(b, 255, 0.92)})`)
}

function readCache(): BrandInfo | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as Partial<BrandInfo>
    if (typeof parsed.brandName !== 'string' || typeof parsed.primaryColor !== 'string') return null
    return { brandName: parsed.brandName, logoUrl: parsed.logoUrl ?? null, primaryColor: parsed.primaryColor }
  } catch {
    return null
  }
}

/** Brand for non-React code (exports, filenames): cached value or default. */
export function getBrandCached(): BrandInfo {
  return readCache() ?? DEFAULT_BRAND
}

/** Filename-safe slug of the brand name, e.g. "Acme Beverages" → "acme-beverages". */
export function brandSlug(): string {
  return getBrandCached().brandName.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'export'
}

const BrandContext = createContext<BrandInfo>(DEFAULT_BRAND)

export function BrandProvider({ children }: { children: ReactNode }) {
  // Cached brand first so the correct name/color paint without a flash; the
  // fetch then refreshes both state and cache.
  const [brand, setBrand] = useState<BrandInfo>(() => readCache() ?? DEFAULT_BRAND)

  useEffect(() => { applyBrandTheme(brand.primaryColor) }, [brand.primaryColor])
  useEffect(() => { document.title = brand.brandName }, [brand.brandName])

  useEffect(() => {
    let cancelled = false
    fetch(`${BASE}/api/brand`)
      .then(res => (res.ok ? res.json() : null))
      .then((data: BrandInfo | null) => {
        if (cancelled || !data) return
        setBrand(data)
        try { localStorage.setItem(STORAGE_KEY, JSON.stringify(data)) } catch { /* storage full/blocked — cache only */ }
      })
      .catch(() => { /* offline — cached/default brand stands */ })
    return () => { cancelled = true }
  }, [])

  return <BrandContext.Provider value={brand}>{children}</BrandContext.Provider>
}

export function useBrand(): BrandInfo {
  return useContext(BrandContext)
}

/** Brand logo image, or a wordmark fallback when no logo is configured. */
export function BrandMark({ className = 'h-7 w-auto' }: { className?: string }) {
  const brand = useBrand()
  if (brand.logoUrl) return <img src={brand.logoUrl} alt={brand.brandName} className={className} />
  return <span className="text-lg font-bold tracking-tight text-accent">{brand.brandName}</span>
}
