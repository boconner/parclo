import { useMemo } from 'react'
import type { DashboardStore, StoreVisit } from '@/types'
import { useVisits } from '@/hooks/useQueries'

export interface ReportParams {
  region: string  // 'all' or a region slug
  chain:  string  // 'all' or a chain id
  days:   number  // 7 | 30 | 90
}

// ─── inventory snapshot ───────────────────────────────────────────────────────

export interface RegionInventoryRow {
  slug:       string
  name:       string
  storeCount: number
  onShelf:    number
  inProcess:  number
  avgDays:    number | null
  critical:   number
  low:        number
  good:       number
}

export interface InventoryReport {
  byRegion:       RegionInventoryRow[]
  totalOnShelf:   number
  totalInProcess: number
  avgDaysSupply:  number
  criticalCount:  number
  storeCount:     number
}

export function useInventoryReport(params: ReportParams, allStores: DashboardStore[]): InventoryReport {
  return useMemo(() => {
    let stores = params.region === 'all' ? allStores : allStores.filter(s => s.region === params.region)
    if (params.chain !== 'all') stores = stores.filter(s => s.chainId === params.chain)

    const regionMap: Map<string, { slug: string; name: string }> = new Map()
    for (const s of stores) {
      if (!regionMap.has(s.region)) regionMap.set(s.region, { slug: s.region, name: s.regionName })
    }
    const regions = Array.from(regionMap.values())

    const byRegion: RegionInventoryRow[] = regions.flatMap(m => {
      const ms = stores.filter(s => s.region === m.slug)
      if (ms.length === 0) return []
      const days = ms.map(s => s.daysOfSupply).filter((d): d is number => d !== null)
      return [{
        slug:       m.slug,
        name:       m.name,
        storeCount: ms.length,
        onShelf:    ms.reduce((s, r) => s + r.onShelf, 0),
        inProcess:  ms.reduce((s, r) => s + r.inProcess, 0),
        avgDays:    days.length ? Math.round(days.reduce((a, b) => a + b, 0) / days.length) : null,
        critical:   ms.filter(s => s.onShelf <= 3).length,
        low:        ms.filter(s => s.onShelf === 4).length,
        good:       ms.filter(s => s.onShelf >= 5).length,
      }]
    })

    const allDays = stores.map(s => s.daysOfSupply).filter((d): d is number => d !== null)
    return {
      byRegion,
      totalOnShelf:   stores.reduce((s, r) => s + r.onShelf, 0),
      totalInProcess: stores.reduce((s, r) => s + r.inProcess, 0),
      avgDaysSupply:  allDays.length ? Math.round(allDays.reduce((a, b) => a + b, 0) / allDays.length) : 0,
      criticalCount:  stores.filter(s => s.onShelf <= 3).length,
      storeCount:     stores.length,
    }
  }, [params.region, params.chain, allStores])
}

// ─── visit activity ───────────────────────────────────────────────────────────

export interface RepActivityRow {
  rep:           string
  region:        string
  regionName:    string
  visits:        number
  stocked:       number
  checked:       number
  ordered:       number
  issues:        number
  lastVisit:     string
  hoursWorked:   number
  bottlesSold:   number
  tastings:      number
  privateEvents: number
}

export interface WeeklyBar {
  week:  string
  count: number
}

export interface VisitActivityReport {
  byRep:       RepActivityRow[]
  totalVisits: number
  weeklyTrend: WeeklyBar[]
}

export function useVisitActivityReport(params: ReportParams, allStores: DashboardStore[]): VisitActivityReport {
  const { data: rawVisits = [] } = useVisits()

  return useMemo(() => {
    const since = Date.now() - params.days * 86_400_000

    let visits = rawVisits.filter(v => new Date(v.date).getTime() >= since)

    if (params.region !== 'all') {
      const regionStoreIds = new Set(allStores.filter(s => s.region === params.region).map(s => s.id))
      visits = visits.filter(v => regionStoreIds.has(v.storeId))
    }
    if (params.chain !== 'all') {
      const chainStoreIds = new Set(allStores.filter(s => s.chainId === params.chain).map(s => s.id))
      visits = visits.filter(v => chainStoreIds.has(v.storeId))
    }

    // Group by rep
    const repMap: Map<string, RepActivityRow> = new Map()
    for (const v of visits) {
      if (!repMap.has(v.rep)) {
        const store = allStores.find(s => s.id === v.storeId)
        repMap.set(v.rep, {
          rep:           v.rep,
          region:        v.region,
          regionName:    store?.regionName ?? v.region,
          visits:        0, stocked: 0, checked: 0, ordered: 0, issues: 0,
          lastVisit:     v.date,
          hoursWorked:   0,
          bottlesSold:   0,
          tastings:      0,
          privateEvents: 0,
        })
      }
      const row = repMap.get(v.rep)!
      row.visits++
      if (v.action === 'stocked')        row.stocked++
      if (v.action === 'checked')        row.checked++
      if (v.action === 'order-placed')   row.ordered++
      if (v.action === 'issue-reported') row.issues++
      if (v.date > row.lastVisit) row.lastVisit = v.date
      if (v.hoursWorked)  row.hoursWorked  += v.hoursWorked
      if (v.bottlesSold)  row.bottlesSold  += v.bottlesSold
      if (v.logType === 'tasting')       row.tastings++
      if (v.logType === 'private_event') row.privateEvents++
    }

    // Weekly trend
    const weekMap: Map<string, { count: number; ms: number }> = new Map()
    for (const v of visits) {
      const d = new Date(v.date)
      const ws = new Date(d)
      ws.setDate(d.getDate() - d.getDay())
      ws.setHours(0, 0, 0, 0)
      const key = ws.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
      weekMap.set(key, { count: (weekMap.get(key)?.count ?? 0) + 1, ms: ws.getTime() })
    }
    const weeklyTrend = [...weekMap.entries()]
      .map(([week, { count, ms }]) => ({ week, count, ms }))
      .sort((a, b) => a.ms - b.ms)
      .map(({ week, count }) => ({ week, count }))

    return {
      byRep:       [...repMap.values()].sort((a, b) => b.visits - a.visits),
      totalVisits: visits.length,
      weeklyTrend,
    }
  }, [rawVisits, params.region, params.chain, params.days, allStores])
}

// ─── depletion / stockout forecast ───────────────────────────────────────────

export interface StockoutRow {
  storeId:       string
  storeName:     string
  region:        string
  regionName:    string
  rep:           string
  onShelf:       number
  daysLeft:      number
  depletionRate: number
  projectedDate: Date
}

export interface DepletionReport {
  stockouts: StockoutRow[]
}

export function useDepletionReport(params: ReportParams, allStores: DashboardStore[]): DepletionReport {
  return useMemo(() => {
    let stores = params.region === 'all' ? allStores : allStores.filter(s => s.region === params.region)
    if (params.chain !== 'all') stores = stores.filter(s => s.chainId === params.chain)

    const stockouts: StockoutRow[] = stores
      .filter(s => s.daysOfSupply !== null && s.depletionRate != null)
      .map(s => ({
        storeId:       s.id,
        storeName:     s.name,
        region:        s.region,
        regionName:    s.regionName,
        rep:           s.rep,
        onShelf:       s.onShelf,
        daysLeft:      s.daysOfSupply!,
        depletionRate: s.depletionRate!,
        projectedDate: new Date(Date.now() + s.daysOfSupply! * 86_400_000),
      }))
      .sort((a, b) => a.daysLeft - b.daysLeft)

    return { stockouts }
  }, [params.region, params.chain, allStores])
}

// ─── chain performance ────────────────────────────────────────────────────────

export interface ChainRow {
  chainId:   string
  chainName: string
  stores:    number
  onShelf:   number
  inProcess: number
  avgDays:   number | null
  critical:  number
  low:       number
  good:      number
  alerts:    number
}

export interface ChainReport {
  chains: ChainRow[]
}

export function useChainReport(params: ReportParams, allStores: DashboardStore[]): ChainReport {
  return useMemo(() => {
    let stores = params.region === 'all' ? allStores : allStores.filter(s => s.region === params.region)
    if (params.chain !== 'all') stores = stores.filter(s => s.chainId === params.chain)

    const chainMap: Map<string, { id: string; name: string }> = new Map()
    for (const s of stores) {
      if (!s.chainId) continue
      if (!chainMap.has(s.chainId)) chainMap.set(s.chainId, { id: s.chainId, name: s.chainName ?? '' })
    }

    const chains: ChainRow[] = Array.from(chainMap.values()).flatMap(c => {
      const cs = stores.filter(s => s.chainId === c.id)
      if (cs.length === 0) return []
      const days = cs.map(s => s.daysOfSupply).filter((d): d is number => d !== null)
      return [{
        chainId:   c.id,
        chainName: c.name,
        stores:    cs.length,
        onShelf:   cs.reduce((s, r) => s + r.onShelf, 0),
        inProcess: cs.reduce((s, r) => s + r.inProcess, 0),
        avgDays:   days.length ? Math.round(days.reduce((a, b) => a + b, 0) / days.length) : null,
        critical:  cs.filter(s => s.onShelf <= 3).length,
        low:       cs.filter(s => s.onShelf === 4).length,
        good:      cs.filter(s => s.onShelf >= 5).length,
        alerts:    cs.filter(s => s.hasAlert).length,
      }]
    })

    return { chains }
  }, [params.region, params.chain, allStores])
}

// ─── store health scorecard ───────────────────────────────────────────────────

export interface StoreHealthRow {
  storeId:      string
  storeName:    string
  chainName:    string
  regionName:   string
  rep:          string
  onShelf:      number
  daysOfSupply: number | null
  lastVisit:    string | null
  hasAlert:     boolean
  score:        number   // 0–100
}

export interface StoreHealthReport {
  stores: StoreHealthRow[]
}

export function useStoreHealthReport(params: ReportParams, allStores: DashboardStore[]): StoreHealthReport {
  return useMemo(() => {
    let stores = params.region === 'all' ? allStores : allStores.filter(s => s.region === params.region)
    if (params.chain !== 'all') stores = stores.filter(s => s.chainId === params.chain)

    const rows: StoreHealthRow[] = stores.map(s => {
      const supplyPts = s.onShelf === 0 ? 0 : s.onShelf <= 3 ? 20 : s.onShelf === 4 ? 40 : 60
      const daysSince = s.lastVisit
        ? Math.floor((Date.now() - new Date(s.lastVisit).getTime()) / 86_400_000)
        : 999
      const visitPts = daysSince <= 7 ? 30 : daysSince <= 14 ? 20 : daysSince <= 30 ? 10 : 0
      const alertPts = s.hasAlert ? -10 : 10

      return {
        storeId:      s.id,
        storeName:    s.name,
        chainName:    s.chainName,
        regionName:   s.regionName,
        rep:          s.rep,
        onShelf:      s.onShelf,
        daysOfSupply: s.daysOfSupply,
        lastVisit:    s.lastVisit,
        hasAlert:     s.hasAlert,
        score:        Math.max(0, Math.min(100, supplyPts + visitPts + alertPts)),
      }
    }).sort((a, b) => a.score - b.score)

    return { stores: rows }
  }, [params.region, params.chain, allStores])
}

// ─── action badge meta (shared with Reports page) ────────────────────────────

export const ACTION_META: Record<StoreVisit['action'], { label: string; color: string; bg: string }> = {
  'stocked':        { label: 'Stocked',       color: 'text-green-700', bg: 'bg-green-50'     },
  'checked':        { label: 'Checked',        color: 'text-blue-600',  bg: 'bg-blue-50'      },
  'order-placed':   { label: 'Order Placed',   color: 'text-accent',    bg: 'bg-accent-light' },
  'issue-reported': { label: 'Issue Reported', color: 'text-red-600',   bg: 'bg-red-50'       },
}
