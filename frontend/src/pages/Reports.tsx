import { useState, useMemo, useRef, useCallback, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { clsx } from 'clsx'
import {
  BarChart, Bar,
  LineChart, Line,
  PieChart, Pie, Cell, Legend,
  XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid,
} from 'recharts'
import { Button } from '@/components/ui/Button'
import { ChartToggle } from '@/components/ui/ChartToggle'
import { exportCSV, exportPDF, exportSectionPDF } from '@/lib/exportReports'
import type { ChartType } from '@/components/ui/ChartToggle'
import { useStores, useRegions, useEvents, useReps } from '@/hooks/useQueries'
import { useQuery } from '@tanstack/react-query'
import { api } from '@/lib/api'
import { useInventory, BOTTLES_PER_CASE } from '@/hooks/useCasesOut'
import {
  useInventoryReport, useVisitActivityReport, useDepletionReport,
  useChainReport, useStoreHealthReport,
} from '@/lib/reportHooks'
import type { ReportParams, RegionInventoryRow, RepActivityRow, StockoutRow, ChainRow, StoreHealthRow } from '@/lib/reportHooks'
import { useBrand } from '@/lib/brand'

// ─── constants ────────────────────────────────────────────────────────────────

const PIE_PALETTE = [
  'var(--accent)', '#e07b2c', '#8c3d00', '#f0a868', '#a34e00', '#c98d5e', '#5e2a00',
  '#4a3080', '#b38ee0', '#e8d9f7', '#8f5cc0', '#3d2b6e',
]
const URGENCY_COLORS = { critical: '#ef4444', low: '#f59e0b', good: '#10b981' }

const RADIAN = Math.PI / 180
function PieLabel({ cx, cy, midAngle, innerRadius, outerRadius, percent }: {
  cx: number; cy: number; midAngle: number
  innerRadius: number; outerRadius: number; percent: number
}) {
  if (percent < 0.06) return null
  const r = innerRadius + (outerRadius - innerRadius) * 0.55
  const x = cx + r * Math.cos(-midAngle * RADIAN)
  const y = cy + r * Math.sin(-midAngle * RADIAN)
  return (
    <text x={x} y={y} fill="white" textAnchor="middle" dominantBaseline="central"
      style={{ fontSize: 11, fontWeight: 700, pointerEvents: 'none' }}>
      {`${(percent * 100).toFixed(0)}%`}
    </text>
  )
}

const DATE_PRESETS = [
  { value: '7'      as const, label: 'Last 7 days'  },
  { value: '30'     as const, label: 'Last 30 days' },
  { value: '365'    as const, label: 'Last year'    },
  { value: 'custom' as const, label: 'Custom'       },
]

const TABS = [
  { id: 'overview',      label: 'Overview'      },
  { id: 'inventory',     label: 'Inventory'     },
  { id: 'visits',        label: 'Visits'        },
  { id: 'events',        label: 'Events'        },
  { id: 'rep-activity',  label: 'Rep Activity'  },
  { id: 'stockouts',     label: 'Stockouts'     },
  { id: 'chains',        label: 'Chains'        },
  { id: 'health',        label: 'Store Health'  },
] as const

type Tab          = typeof TABS[number]['id']
type Preset       = '7' | '30' | '365' | 'custom'
type UrgencyFilter = 'all' | 'critical' | 'low' | 'good'
type Dir          = 'asc' | 'desc'

// ─── sort helpers ─────────────────────────────────────────────────────────────

function sortRows<T>(rows: T[], col: keyof T, dir: Dir): T[] {
  return [...rows].sort((a, b) => {
    const av = a[col] ?? ''
    const bv = b[col] ?? ''
    if (av < bv) return dir === 'asc' ? -1 : 1
    if (av > bv) return dir === 'asc' ?  1 : -1
    return 0
  })
}

function useSortState<T extends string>(defaultCol: T, defaultDir: Dir = 'desc') {
  const [sort, setSort] = useState<{ col: T; dir: Dir }>({ col: defaultCol, dir: defaultDir })
  function toggle(col: T) {
    setSort(prev => prev.col === col
      ? { col, dir: prev.dir === 'asc' ? 'desc' : 'asc' }
      : { col, dir: defaultDir })
  }
  return { sort, toggle }
}

// ─── page ─────────────────────────────────────────────────────────────────────

export default function Reports() {
  // Passed into the PDF exporters; empty string = no logo, wordmark fallback.
  const logoUrl = useBrand().logoUrl ?? ''
  const [activeTab, setActiveTab] = useState<Tab>('overview')

  // Global filters
  const [preset, setPreset]             = useState<Preset>('30')
  const [customFrom, setCustomFrom]     = useState('')
  const [customTo, setCustomTo]         = useState('')
  const [activeMarket, setActiveMarket] = useState('all')
  const [activeChain, setActiveChain]   = useState('all')

  // Per-section chart types
  const [invChartType, setInvChartType]     = useState<ChartType>('bar')
  const [actChartType, setActChartType]     = useState<ChartType>('bar')
  const [stockChartType, setStockChartType] = useState<ChartType>('bar')
  const [visitChartType, setVisitChartType] = useState<ChartType>('bar')

  // Chart container refs for PDF pie capture
  const invChartRef   = useRef<HTMLDivElement>(null)
  const actChartRef   = useRef<HTMLDivElement>(null)
  const stockChartRef = useRef<HTMLDivElement>(null)

  const effectiveDays = useMemo(() => {
    if (preset !== 'custom') return Number(preset)
    if (!customFrom) return 30
    const from = new Date(customFrom).getTime()
    const to   = customTo ? new Date(customTo).getTime() : Date.now()
    return Math.max(1, Math.ceil((to - from) / 86_400_000))
  }, [preset, customFrom, customTo])

  const { data: apiStores   } = useStores()
  const { data: apiMarkets  } = useRegions()
  const { data: apiEvents = [] } = useEvents()
  const { data: apiReps = [] } = useReps()
  const allStores    = apiStores  ?? []
  const allMarkets   = apiMarkets ?? []

  const params: ReportParams = { region: activeMarket, chain: activeChain, days: effectiveDays }
  const marketStores = activeMarket === 'all' ? allStores : allStores.filter(s => s.region === activeMarket)

  const chainOptions = useMemo(() => {
    const seen = new Set<string>()
    const opts: { id: string; name: string }[] = []
    for (const s of marketStores) {
      if (s.chainId && !seen.has(s.chainId)) {
        seen.add(s.chainId)
        opts.push({ id: s.chainId, name: s.chainName ?? s.chainId })
      }
    }
    return opts.sort((a, b) => a.name.localeCompare(b.name))
  }, [marketStores])

  const inventory    = useInventoryReport(params, allStores)
  const activity     = useVisitActivityReport(params, allStores)
  const depletion    = useDepletionReport(params, allStores)
  const chainReport  = useChainReport(params, allStores)
  const healthReport = useStoreHealthReport(params, allStores)

  // Inventory — server-computed snapshot
  const inv = useInventory()
  const { casesDeployed: casesOut, totalCasesMade, reorderLeadWeeks,
          casesDepleted, casesOnShelf, casesInWarehouse, onHandCases,
          sellThroughPct: stPct, depletionRateWeeklyCases, warehouseWeeksLeft, reorderAlert } = inv
  const stDepleted       = inv.bottlesDepleted
  const stCasesRemaining = casesOnShelf
  const { eventSalesBottles, eventSalesCases } = inv


  // Sort states
  const invSortState      = useSortState<keyof RegionInventoryRow>('onShelf')
  const repSortState      = useSortState<keyof RepActivityRow>('visits')
  const stockSortState    = useSortState<keyof StockoutRow>('daysLeft', 'asc')
  const chainSortState    = useSortState<keyof ChainRow>('onShelf')
  const healthSortState   = useSortState<keyof StoreHealthRow>('score', 'asc')
  const eventRepSort      = useSortState<'name' | 'scheduled' | 'completed' | 'rate' | 'tastings' | 'taskings' | 'bottlesSold' | 'hoursWorked'>('completed')
  const repPerfSort       = useSortState<'rep' | 'visits' | 'tastings' | 'taskings' | 'bottlesSold' | 'hoursWorked'>('bottlesSold')
  const repActSort        = useSortState<'rep' | 'visits' | 'tastings' | 'privateEvents' | 'hoursWorked' | 'bottlesSold' | 'lastVisit'>('hoursWorked')

  // Inventory tab sort states
  const invTabChainSort  = useSortState<'chainName' | 'casesDeployed' | 'casesOnShelf' | 'casesOffShelf' | 'offShelfPct' | 'storeCount'>('casesDeployed')
  const invTabMarketSort = useSortState<'name' | 'casesDeployed' | 'bottlesOnShelf' | 'casesDepleted' | 'sellThroughPct' | 'depletionRateWeeklyCases'>('casesDeployed')
  const invTabRepSort    = useSortState<'repName' | 'casesDeployed' | 'casesOnShelf' | 'casesOffShelf' | 'offShelfPct'>('casesDeployed')

  // Filter states
  const [invUrgency, setInvUrgency]             = useState<UrgencyFilter>('all')
  const [repFilter, setRepFilter]               = useState('all')
  const [stockStoreFilter, setStockStoreFilter] = useState('all')
  const [stockRepFilter, setStockRepFilter]     = useState('all')
  const [stockUrgency, setStockUrgency]         = useState<UrgencyFilter>('all')
  const [healthChainFilter, setHealthChainFilter] = useState('all')
  const [repActFilter, setRepActFilter]           = useState('all')
  const [eventRepFilter, setEventRepFilter]       = useState('all')

  // Filtered + sorted rows
  const invRows = useMemo(() => {
    let rows = inventory.byRegion
    if (invUrgency === 'critical') rows = rows.filter(r => r.critical > 0)
    else if (invUrgency === 'low') rows = rows.filter(r => r.low > 0)
    else if (invUrgency === 'good') rows = rows.filter(r => r.good > 0 && r.critical === 0 && r.low === 0)
    return sortRows(rows, invSortState.sort.col, invSortState.sort.dir)
  }, [inventory.byRegion, invSortState.sort, invUrgency])

  const repRows = useMemo(() => {
    let rows = activity.byRep
    if (repFilter !== 'all') rows = rows.filter(r => r.rep === repFilter)
    return sortRows(rows, repSortState.sort.col, repSortState.sort.dir)
  }, [activity.byRep, repSortState.sort, repFilter])

  const stockRows = useMemo(() => {
    let rows = depletion.stockouts
    if (stockStoreFilter !== 'all') rows = rows.filter(r => r.storeId === stockStoreFilter)
    if (stockRepFilter   !== 'all') rows = rows.filter(r => r.rep === stockRepFilter)
    if (stockUrgency     !== 'all') {
      rows = rows.filter(r => {
        const u = r.onShelf <= 3 ? 'critical' : r.onShelf === 4 ? 'low' : 'good'
        return u === stockUrgency
      })
    }
    return sortRows(rows, stockSortState.sort.col, stockSortState.sort.dir)
  }, [depletion.stockouts, stockSortState.sort, stockStoreFilter, stockRepFilter, stockUrgency])

  const chainRows = useMemo(() =>
    sortRows(chainReport.chains, chainSortState.sort.col, chainSortState.sort.dir),
    [chainReport.chains, chainSortState.sort]
  )

  // Events report — derived from real API data
  const eventStats = useMemo(() => {
    let events = apiEvents
    if (activeMarket !== 'all') events = events.filter(e => e.region === activeMarket)
    if (activeChain  !== 'all') events = events.filter(e => e.chainId === activeChain)

    const since     = Date.now() - effectiveDays * 86_400_000
    const now       = new Date()
    const inPeriod  = events.filter(e => new Date(e.scheduledAt).getTime() >= since)
    const scheduled = events.filter(e => e.status === 'scheduled' && new Date(e.scheduledAt) >= now).length
    const completed = inPeriod.filter(e => e.status === 'completed').length
    const cancelled = inPeriod.filter(e => e.status === 'cancelled').length
    const denom     = completed + cancelled
    const rate      = denom > 0 ? Math.round((completed / denom) * 100) : 0

    const nextEvent = events
      .filter(e => e.status === 'scheduled' && new Date(e.scheduledAt) >= now)
      .sort((a, b) => new Date(a.scheduledAt).getTime() - new Date(b.scheduledAt).getTime())[0] ?? null

    // Type breakdown (completed only)
    const byType = {
      tasting:       inPeriod.filter(e => e.type === 'tasting'       && e.status === 'completed').length,
      tasking:       inPeriod.filter(e => e.type === 'tasking'        && e.status === 'completed').length,
      private_event: inPeriod.filter(e => e.type === 'private_event'  && e.status === 'completed').length,
    }

    // Total bottles sold from completed events (tastings + private events)
    const totalBottlesSold = inPeriod
      .filter(e => e.status === 'completed')
      .reduce((s, e) => s + (e.bottlesSold ?? 0), 0)

    // By rep
    const repMap: Map<string, { name: string; scheduled: number; completed: number; cancelled: number; next: string | null; tastings: number; taskings: number; privateEvents: number; bottlesSold: number; hoursWorked: number }> = new Map()
    for (const e of events) {
      for (const rep of e.reps) {
        if (!repMap.has(rep.name)) repMap.set(rep.name, { name: rep.name, scheduled: 0, completed: 0, cancelled: 0, next: null, tastings: 0, taskings: 0, privateEvents: 0, bottlesSold: 0, hoursWorked: 0 })
        const row = repMap.get(rep.name)!
        if (e.status === 'scheduled' && new Date(e.scheduledAt) >= now) {
          row.scheduled++
          if (!row.next || e.scheduledAt < row.next) row.next = e.scheduledAt
        }
        if (e.status === 'completed') {
          row.completed++
          if (e.type === 'tasting')      row.tastings++
          else if (e.type === 'tasking') row.taskings++
          else                           row.privateEvents++
          row.bottlesSold += e.bottlesSold ?? 0
          row.hoursWorked += e.hoursWorked ?? 0
        }
        if (e.status === 'cancelled') row.cancelled++
      }
    }
    const byRep = [...repMap.values()].map(r => ({
      ...r,
      rate: (r.completed + r.cancelled) > 0 ? Math.round((r.completed / (r.completed + r.cancelled)) * 100) : 0,
    }))

    // By region — skip private events with no region
    const regionMap: Map<string, { name: string; completed: number; total: number }> = new Map()
    for (const e of inPeriod) {
      if (!e.region) continue
      if (!regionMap.has(e.region)) regionMap.set(e.region, { name: e.regionName ?? e.region, completed: 0, total: 0 })
      const row = regionMap.get(e.region)!
      row.total++
      if (e.status === 'completed') row.completed++
    }
    const byRegion = [...regionMap.values()].sort((a, b) => b.total - a.total)

    return { scheduled, completed, cancelled, rate, nextEvent, byRep, byRegion, byType, totalBottlesSold }
  }, [apiEvents, activeMarket, activeChain, effectiveDays])

  const eventRepRows = useMemo(() => {
    const selectedName = eventRepFilter !== 'all' ? apiReps.find(r => r.id === eventRepFilter)?.name : null
    const rows = selectedName
      ? eventStats.byRep.filter(r => r.name === selectedName)
      : eventStats.byRep
    return sortRows(rows, eventRepSort.sort.col, eventRepSort.sort.dir)
  }, [eventStats.byRep, eventRepSort.sort, eventRepFilter, apiReps])

  // Combined rep performance: merge visit activity + event data
  const repPerformance = useMemo(() => {
    const map = new Map<string, { rep: string; visits: number; tastings: number; taskings: number; privateEvents: number; bottlesSold: number; hoursWorked: number; lastActivity: string | null }>()
    for (const r of activity.byRep) {
      map.set(r.rep, { rep: r.rep, visits: r.visits, tastings: 0, taskings: 0, privateEvents: 0, bottlesSold: r.bottlesSold, hoursWorked: r.hoursWorked, lastActivity: r.lastVisit })
    }
    for (const r of eventStats.byRep) {
      if (!map.has(r.name)) map.set(r.name, { rep: r.name, visits: 0, tastings: 0, taskings: 0, privateEvents: 0, bottlesSold: 0, hoursWorked: 0, lastActivity: null })
      const row = map.get(r.name)!
      row.tastings      = r.tastings
      row.taskings      = r.taskings
      row.privateEvents = r.privateEvents
      row.bottlesSold   += r.bottlesSold
      // hoursWorked intentionally NOT added from events — visits are the source of truth
      // and every completed event has a linked visit that already captures those hours
    }
    return [...map.values()]
  }, [activity.byRep, eventStats.byRep])

  const repPerfRows = useMemo(() => {
    const selectedName = eventRepFilter !== 'all' ? apiReps.find(r => r.id === eventRepFilter)?.name : null
    const rows = selectedName
      ? repPerformance.filter(r => r.rep === selectedName)
      : repPerformance
    return sortRows(rows, repPerfSort.sort.col, repPerfSort.sort.dir)
  }, [repPerformance, repPerfSort.sort, eventRepFilter, apiReps])

  const repActRows = useMemo(() => {
    let rows = activity.byRep
    if (repActFilter !== 'all') {
      const selectedName = apiReps.find(r => r.id === repActFilter)?.name
      if (selectedName) rows = rows.filter(r => r.rep === selectedName)
    }
    return sortRows(rows, repActSort.sort.col, repActSort.sort.dir)
  }, [activity.byRep, repActFilter, repActSort.sort, apiReps])

  const healthRows = useMemo(() => {
    let rows = healthReport.stores
    if (healthChainFilter !== 'all') rows = rows.filter(r => {
      const store = allStores.find(s => s.id === r.storeId)
      return store?.chainId === healthChainFilter
    })
    return sortRows(rows, healthSortState.sort.col, healthSortState.sort.dir)
  }, [healthReport.stores, healthSortState.sort, healthChainFilter])

  const periodLabel = preset === 'custom'
    ? customFrom || customTo ? `${customFrom || '…'} – ${customTo || 'today'}` : 'Custom range'
    : DATE_PRESETS.find(p => p.value === preset)!.label

  const marketLabel = activeMarket === 'all'
    ? 'All Markets'
    : allMarkets.find(m => m.slug === activeMarket)?.name ?? activeMarket

  function buildExportData() {
    return {
      periodLabel, marketLabel,
      inventory: invRows, activity: repRows, stockouts: stockRows,
      invChartEl:   invChartType   === 'pie' ? invChartRef.current   : null,
      actChartEl:   actChartType   === 'pie' ? actChartRef.current   : null,
      stockChartEl: stockChartType === 'pie' ? stockChartRef.current : null,
    }
  }

  const handleExportPDF = useCallback(() => exportPDF(buildExportData(), logoUrl),
    [invRows, repRows, stockRows, invChartType, actChartType, stockChartType])

  const invPieData   = invRows.map((r, i) => ({ name: r.name, value: r.onShelf,  fill: PIE_PALETTE[i % PIE_PALETTE.length] }))
  const actPieData   = repRows.map((r, i) => ({ name: r.rep,  value: r.visits,   fill: PIE_PALETTE[i % PIE_PALETTE.length] }))
  const stockPieData = [
    { name: 'Critical', value: stockRows.filter(r => r.onShelf <= 3).length,   fill: URGENCY_COLORS.critical },
    { name: 'Attention', value: stockRows.filter(r => r.onShelf === 4).length,  fill: URGENCY_COLORS.low      },
    { name: 'Good',     value: stockRows.filter(r => r.onShelf >= 5).length,   fill: URGENCY_COLORS.good     },
  ].filter(d => d.value > 0)

  return (
    <div className="p-4 lg:p-8">

      {/* HEADER */}
      <div className="flex flex-wrap items-start justify-between gap-3 mb-5">
        <div>
          <h1 className="text-xl font-semibold text-gray-900 tracking-tight">Reports</h1>
          <p className="text-sm text-gray-400 mt-0.5">
            {marketLabel} · {periodLabel}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="sm" onClick={handleExportPDF}>Export PDF</Button>
          <Button variant="ghost" size="sm" onClick={() => exportCSV(buildExportData())}>Export CSV</Button>
        </div>
      </div>

      {/* DATE RANGE */}
      <div className="flex items-center gap-3 mb-4 flex-wrap">
        <div className="flex items-center gap-0.5 bg-white border border-gray-200 rounded-lg p-0.5">
          {DATE_PRESETS.map(r => (
            <button key={r.value} onClick={() => setPreset(r.value)}
              className={clsx('px-3 py-1 rounded-[6px] text-xs font-medium transition-all',
                preset === r.value ? 'bg-accent text-white shadow-sm' : 'text-gray-500 hover:text-gray-800 hover:bg-gray-50'
              )}>
              {r.label}
            </button>
          ))}
        </div>
        {preset === 'custom' && (
          <div className="flex items-center gap-2">
            <input type="date" value={customFrom} onChange={e => setCustomFrom(e.target.value)} max={customTo || undefined}
              className="px-2.5 py-1 text-xs bg-white border border-gray-200 rounded-lg outline-none focus:border-accent transition-all text-gray-700" />
            <span className="text-xs text-gray-400">to</span>
            <input type="date" value={customTo} onChange={e => setCustomTo(e.target.value)} min={customFrom || undefined}
              max={new Date().toISOString().slice(0, 10)}
              className="px-2.5 py-1 text-xs bg-white border border-gray-200 rounded-lg outline-none focus:border-accent transition-all text-gray-700" />
            {!customFrom && customTo && (
              <span className="text-[10px] text-amber-500">Set a start date</span>
            )}
            {(customFrom || customTo) && (
              <button onClick={() => { setCustomFrom(''); setCustomTo('') }}
                className="text-[10px] text-gray-400 hover:text-accent transition-colors">Clear</button>
            )}
          </div>
        )}
      </div>

      {/* MARKET + CHAIN FILTERS */}
      <div className="flex items-center gap-3 mb-4 flex-wrap">
        <select
          value={activeMarket}
          onChange={e => { setActiveMarket(e.target.value); setActiveChain('all') }}
          className="px-3 py-1.5 text-sm bg-white border border-gray-200 rounded-lg outline-none focus:border-accent focus:ring-2 focus:ring-accent/10 text-gray-600 transition-all"
        >
          <option value="all">All Regions</option>
          {allMarkets.map(m => <option key={m.slug} value={m.slug}>{m.name}</option>)}
        </select>
        <select
          value={activeChain}
          onChange={e => setActiveChain(e.target.value)}
          className="px-3 py-1.5 text-sm bg-white border border-gray-200 rounded-lg outline-none focus:border-accent focus:ring-2 focus:ring-accent/10 text-gray-600 transition-all"
        >
          <option value="all">All Chains</option>
          {chainOptions.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
        {(activeMarket !== 'all' || activeChain !== 'all') && (
          <button
            onClick={() => { setActiveMarket('all'); setActiveChain('all') }}
            className="text-sm text-gray-400 hover:text-gray-700 transition-colors"
          >
            Clear
          </button>
        )}
      </div>

      {/* TABS */}
      <div className="flex gap-0.5 bg-white border border-gray-200 rounded-xl p-1 mb-6 overflow-x-auto">
        {TABS.map(tab => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={clsx(
              'flex-1 min-w-fit px-4 py-2 rounded-lg text-xs font-semibold whitespace-nowrap transition-all',
              activeTab === tab.id
                ? 'bg-accent text-white shadow-sm'
                : 'text-gray-500 hover:text-gray-800 hover:bg-gray-50'
            )}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* ── TAB: OVERVIEW ── */}
      {activeTab === 'overview' && (
        <>
          {/* Inventory summary */}
          {totalCasesMade > 0 && (
            <div className="bg-white border border-gray-200 rounded-xl p-5 mb-5">
              <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
                <div>
                  <h2 className="text-sm font-semibold text-gray-900">Inventory Tracker</h2>
                  <p className="text-xs text-gray-400 mt-0.5">
                    {totalCasesMade.toLocaleString()} cases made · {casesOut.toLocaleString()} deployed · {reorderLeadWeeks}-week lead time
                  </p>
                </div>
                {reorderAlert ? (
                  <span className="text-xs font-semibold px-2.5 py-1 rounded-full bg-red-50 text-red-700">
                    ⚠ Reorder now
                  </span>
                ) : (
                  <span className="text-xs font-semibold px-2.5 py-1 rounded-full bg-gray-100 text-gray-500">
                    {stPct}% off shelf
                  </span>
                )}
              </div>
              {/* Four-segment bar: warehouse / on-hand / on-shelf / off-shelf */}
              {(() => {
                const base  = totalCasesMade || 1
                const wPct  = Math.round((casesInWarehouse / base) * 100)
                const ohPct = Math.round((onHandCases      / base) * 100)
                const sPct  = Math.round((casesOnShelf     / base) * 100)
                const dPct  = Math.round((casesDepleted    / base) * 100)
                return (
                  <div className="flex h-2 rounded-full overflow-hidden bg-gray-100 mb-4">
                    {wPct  > 0 && <div className="bg-gray-300 h-full" style={{ width: `${wPct}%` }} />}
                    {ohPct > 0 && <div className="bg-blue-400 h-full" style={{ width: `${ohPct}%` }} />}
                    {sPct  > 0 && <div className="bg-accent h-full"   style={{ width: `${sPct}%` }} />}
                    {dPct  > 0 && <div className="bg-amber-400 h-full" style={{ width: `${dPct}%` }} />}
                  </div>
                )
              })()}
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                <div>
                  <p className="text-[10px] font-medium text-gray-400 uppercase tracking-wide mb-0.5">Warehouse</p>
                  <p className="text-xl font-bold text-gray-900 tabular-nums">{casesInWarehouse.toLocaleString()}</p>
                  <p className="text-[10px] text-gray-400">cases remaining</p>
                </div>
                <div>
                  <p className="text-[10px] font-medium text-gray-400 uppercase tracking-wide mb-0.5">On Shelf</p>
                  <p className="text-xl font-bold text-gray-900 tabular-nums">~{stCasesRemaining.toLocaleString()}</p>
                  <p className="text-[10px] text-gray-400">cases at stores</p>
                </div>
                <div>
                  <p className="text-[10px] font-medium text-gray-400 uppercase tracking-wide mb-0.5">Off Shelf</p>
                  <p className="text-xl font-bold tabular-nums text-amber-500">
                    {casesDepleted.toLocaleString()}
                  </p>
                  <p className="text-[10px] text-gray-400">cases · {stPct}% of deployed</p>
                </div>
                {/* Depletions stat hidden — distributor reporting not in use */}
                <div>
                  <p className="text-[10px] font-medium text-gray-400 uppercase tracking-wide mb-0.5">
                    {reorderAlert ? '⚠ Supply Left' : 'On-Hand Supply'}
                  </p>
                  <p className={clsx('text-xl font-bold tabular-nums', reorderAlert ? 'text-red-500' : 'text-gray-900')}>
                    {warehouseWeeksLeft !== null ? `${warehouseWeeksLeft}w` : '—'}
                  </p>
                  <p className="text-[10px] text-gray-400">
                    {depletionRateWeeklyCases !== null ? `${depletionRateWeeklyCases} cases/wk` : 'rate pending'}
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* Key metrics */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 lg:gap-3.5 mb-6">
            <StatCard label="Bottles On Shelf" value={inventory.totalOnShelf} sub={`Across ${inventory.storeCount} stores`} />
            <StatCard label="Avg Days of Supply" value={`${inventory.avgDaysSupply}d`}
              valueClass={inventory.avgDaysSupply < 7 ? 'text-red-500' : inventory.avgDaysSupply < 10 ? 'text-amber-600' : 'text-green-500'}
              sub="At current depletion rate" />
            <StatCard label="Critical Stores" value={inventory.criticalCount}
              valueClass={inventory.criticalCount > 0 ? 'text-red-500' : 'text-gray-900'} sub="3 or fewer bottles on shelf"
              onClick={() => setActiveTab('stockouts')} />
            <StatCard
              label={`Visits · ${DATE_PRESETS.find(p => p.value === preset)?.label ?? periodLabel}`}
              value={activity.totalVisits} valueClass="text-accent" sub={`Across ${inventory.storeCount} stores`}
              onClick={() => setActiveTab('visits')} />
          </div>

          {/* Visit cadence trend */}
          {activity.weeklyTrend.length > 0 && (
            <div className="bg-white border border-gray-200 rounded-xl mb-6 overflow-hidden">
              <div className="px-5 py-3 border-b border-gray-100 flex items-center justify-between">
                <div>
                  <h2 className="text-sm font-semibold text-gray-900">Visit Cadence</h2>
                  <p className="text-xs text-gray-400 mt-0.5">{activity.totalVisits} visits · {periodLabel}</p>
                </div>
                <button onClick={() => setActiveTab('visits')} className="text-xs text-accent hover:underline font-medium">
                  Full breakdown →
                </button>
              </div>
              <div className="px-4 pb-4 pt-2" style={{ height: 180 }}>
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={activity.weeklyTrend} margin={{ top: 4, right: 4, bottom: 0, left: -20 }}>
                    <CartesianGrid vertical={false} stroke="#f1f5f9" />
                    <XAxis dataKey="week" tick={{ fontSize: 10, fill: '#9ca3af' }} axisLine={false} tickLine={false} />
                    <YAxis tick={{ fontSize: 10, fill: '#9ca3af' }} axisLine={false} tickLine={false} allowDecimals={false} />
                    <Tooltip contentStyle={{ background: '#fff', border: '1px solid #e8eaed', borderRadius: 8, fontSize: 12 }} cursor={{ fill: '#f8fafc' }} />
                    <Bar dataKey="count" name="Visits" radius={[3, 3, 0, 0]}>
                      {activity.weeklyTrend.map((_, i) => (
                        <Cell key={i} fill={i === activity.weeklyTrend.length - 1 ? 'var(--accent)' : 'var(--accent-light)'} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>
          )}

          {/* Inventory by market */}
          <Section
            title="Inventory by Market"
            subtitle={`${invRows.length} of ${inventory.byRegion.length} regions`}
            chartType={invChartType} onChartTypeChange={setInvChartType} chartTypes={['bar', 'pie']}
            onExportPDF={() => exportSectionPDF(
              'Inventory by Market', invChartType === 'pie' ? invChartRef.current : null,
              invRows.map(r => [r.name, r.storeCount, r.onShelf, r.inProcess, r.avgDays !== null ? `${r.avgDays}d` : '—', r.critical, r.low, r.good]),
              ['Market', 'Stores', 'On Shelf', 'In Process', 'Avg Days', 'Critical', 'Low', 'Good'],
              logoUrl, periodLabel, marketLabel,
            )}
            action={
              <div className="flex items-center gap-2">
                {invUrgency !== 'all' && <ClearBtn onClick={() => setInvUrgency('all')} />}
                <UrgencyPills value={invUrgency} onChange={setInvUrgency} />
              </div>
            }
          >
            {invRows.length === 0 ? <EmptyState onClear={() => setInvUrgency('all')} />
            : invChartType === 'pie' ? (
              <div ref={invChartRef} className="px-4 pt-4 pb-4" style={{ height: 300 }}>
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie data={invPieData} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={100}
                      labelLine={false} label={PieLabel}>
                      {invPieData.map((d, i) => <Cell key={i} fill={d.fill} />)}
                    </Pie>
                    <Tooltip formatter={(v: number) => [`${v} bottles`, 'On Shelf']} contentStyle={{ fontSize: 12, borderRadius: 8, border: '1px solid #e8eaed' }} />
                    <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: 11 }} />
                  </PieChart>
                </ResponsiveContainer>
              </div>
            ) : (
              <InventoryTable rows={invRows} sort={invSortState} inventory={inventory} activeMarket={activeMarket} onMarketClick={setActiveMarket} />
            )}
          </Section>
        </>
      )}

      {/* ── TAB: INVENTORY ── */}
      {activeTab === 'inventory' && (
        <>
          {inv.totalCasesMade === 0 ? (
            <div className="bg-white border border-gray-200 rounded-xl py-16 text-center">
              <p className="text-sm font-medium text-gray-500 mb-1">No inventory data yet</p>
              <p className="text-xs text-gray-400">Add a production run in the Inventory page to start tracking</p>
            </div>
          ) : (
            <>
              {/* Reorder alert banner */}
              {inv.reorderAlert && (
                <div className="bg-red-50 border border-red-100 rounded-xl px-5 py-3 flex flex-wrap items-center gap-x-6 gap-y-1 mb-5 text-xs">
                  <span className="font-semibold text-red-600">⚠ Reorder now — {inv.warehouseWeeksLeft}w of on-hand supply vs {inv.reorderLeadWeeks}w lead time</span>
                  {inv.recommendedOrderCases && (
                    <span className="text-red-500">Recommended order: <span className="font-semibold">{inv.recommendedOrderCases.toLocaleString()} cases</span> (lead + {inv.bufferWeeks}wk buffer)</span>
                  )}
                </div>
              )}

              {/* 4-segment flow bar */}
              <div className="bg-white border border-gray-200 rounded-xl p-5 mb-5">
                {(() => {
                  const base = inv.totalCasesMade || 1
                  const wPct  = Math.round((inv.casesInWarehouse / base) * 100)
                  const ohPct = Math.round((inv.onHandCases      / base) * 100)
                  const sPct  = Math.round((inv.casesOnShelf     / base) * 100)
                  const dPct  = Math.round((inv.casesDepleted    / base) * 100)
                  return (
                    <>
                      <div className="flex h-2.5 rounded-full overflow-hidden bg-gray-100 mb-3">
                        {wPct  > 0 && <div className="bg-gray-300 h-full" style={{ width: `${wPct}%` }} />}
                        {ohPct > 0 && <div className="bg-blue-400 h-full"  style={{ width: `${ohPct}%` }} />}
                        {sPct  > 0 && <div className="bg-accent h-full"    style={{ width: `${sPct}%` }} />}
                        {dPct  > 0 && <div className="bg-amber-400 h-full" style={{ width: `${dPct}%` }} />}
                      </div>
                      <div className="flex items-center gap-4 text-[10px] text-gray-400">
                        <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-gray-300" />Warehouse ({wPct}%)</span>
                        <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-blue-400" />On-Hand ({ohPct}%)</span>
                        <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-accent" />On Shelf ({sPct}%)</span>
                        <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-amber-400" />Off Shelf ({dPct}%)</span>
                      </div>
                    </>
                  )
                })()}
                <div className="grid grid-cols-2 lg:grid-cols-6 gap-4 mt-5">
                  <InvStatBlock label="Total Made"  value={inv.totalCasesMade}    btls={inv.totalCasesMade * BOTTLES_PER_CASE} />
                  <InvStatBlock label="Warehouse"   value={inv.casesInWarehouse}  btls={inv.casesInWarehouse * BOTTLES_PER_CASE} />
                  <InvStatBlock label="On-Hand"     value={inv.onHandCases}       btls={inv.onHandBottles}        color="text-blue-600" />
                  <InvStatBlock label="Deployed"    value={inv.casesDeployed}     btls={inv.bottlesDeployed} />
                  <InvStatBlock label="~On Shelf"   value={inv.casesOnShelf}      btls={inv.bottlesOnShelf}       approx />
                  <InvStatBlock label="Off Shelf"   value={inv.casesDepleted}     btls={inv.bottlesDepleted}      color="text-amber-500"
                    sub={`${inv.casesDepleted > 0 ? Math.round((inv.casesDepleted / (inv.casesDeployed || 1)) * 100) : 0}% of deployed`} />
                </div>
                {inv.depletionRateWeeklyCases > 0 && (
                  <div className="flex flex-wrap items-center gap-x-5 gap-y-1 mt-4 pt-4 border-t border-gray-100 text-xs text-gray-500">
                    <span>Velocity: <span className="font-semibold text-gray-800">{inv.depletionRateWeeklyCases} cases/wk</span></span>
                    {inv.warehouseWeeksLeft !== null && (
                      <span>On-hand supply: <span className="font-semibold text-gray-800">~{inv.warehouseWeeksLeft}w</span></span>
                    )}
                    {inv.reorderDate && !inv.reorderAlert && (
                      <span>Reorder by: <span className="font-semibold text-gray-800">{inv.reorderDate}</span></span>
                    )}
                    {inv.eventSalesBottles > 0 && (
                      <span>Event sales: <span className="font-semibold text-purple-600">{inv.eventSalesBottles.toLocaleString()} btls</span> from tastings &amp; events</span>
                    )}
                  </div>
                )}
              </div>

              {/* By Chain */}
              {inv.chains.length > 0 && (
                <Section
                  title="By Chain"
                  subtitle={`${inv.chains.length} chain${inv.chains.length !== 1 ? 's' : ''} · cases deployed vs on-shelf`}
                  onExportPDF={() => exportSectionPDF(
                    'Inventory by Chain', null,
                    sortRows(inv.chains, invTabChainSort.sort.col as keyof typeof inv.chains[0], invTabChainSort.sort.dir)
                      .map(c => [c.chainName, c.storeCount, c.casesDeployed, c.casesOnShelf, c.casesOffShelf, `${c.offShelfPct}%`]),
                    ['Chain', 'Stores', 'Deployed (cs)', 'On Shelf (cs)', 'Off Shelf (cs)', '% Off Shelf'],
                    logoUrl, periodLabel, marketLabel,
                  )}
                >
                  <table className="w-full">
                    <thead>
                      <tr className="border-b border-gray-100 bg-gray-50/50">
                        <SortTh col="chainName"     label="Chain"         sort={invTabChainSort.sort} onSort={invTabChainSort.toggle} />
                        <SortTh col="storeCount"    label="Stores"        sort={invTabChainSort.sort} onSort={invTabChainSort.toggle} align="right" />
                        <SortTh col="casesDeployed" label="Deployed (cs)" sort={invTabChainSort.sort} onSort={invTabChainSort.toggle} align="right" />
                        <SortTh col="casesOnShelf"  label="~On Shelf (cs)" sort={invTabChainSort.sort} onSort={invTabChainSort.toggle} align="right" />
                        <SortTh col="casesOffShelf" label="Off Shelf (cs)" sort={invTabChainSort.sort} onSort={invTabChainSort.toggle} align="right" />
                        <SortTh col="offShelfPct"   label="% Off Shelf"   sort={invTabChainSort.sort} onSort={invTabChainSort.toggle} align="right" />
                        <th className="px-5 py-3 text-left text-[10px] font-semibold text-gray-400 uppercase tracking-wider w-28">Sell-Through</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-50">
                      {sortRows(inv.chains, invTabChainSort.sort.col as keyof typeof inv.chains[0], invTabChainSort.sort.dir).map(row => (
                        <tr key={row.chainId} className="hover:bg-gray-50/70 transition-colors">
                          <td className="px-5 py-3.5 text-sm font-medium text-gray-900">{row.chainName}</td>
                          <td className="px-5 py-3.5 text-right text-sm tabular-nums text-gray-500">{row.storeCount}</td>
                          <td className="px-5 py-3.5 text-right text-sm font-semibold tabular-nums text-gray-900">{row.casesDeployed.toLocaleString()}</td>
                          <td className="px-5 py-3.5 text-right text-sm tabular-nums text-gray-700">~{row.casesOnShelf.toLocaleString()}</td>
                          <td className="px-5 py-3.5 text-right text-sm tabular-nums text-amber-600 font-medium">{row.casesOffShelf.toLocaleString()}</td>
                          <td className="px-5 py-3.5 text-right">
                            <span className={clsx('text-sm font-bold tabular-nums',
                              row.offShelfPct >= 80 ? 'text-amber-600' : row.offShelfPct >= 50 ? 'text-amber-500' : 'text-gray-500')}>
                              {row.offShelfPct}%
                            </span>
                          </td>
                          <td className="px-5 py-3.5">
                            <div className="flex items-center gap-2">
                              <div className="flex-1 bg-gray-100 rounded-full h-1.5 overflow-hidden w-20">
                                <div className="bg-amber-400 h-full rounded-full" style={{ width: `${row.offShelfPct}%` }} />
                              </div>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                    <tfoot>
                      <tr className="border-t border-gray-200 bg-gray-50/50">
                        <td className="px-5 py-2.5 text-xs font-semibold text-gray-500">Total</td>
                        <td className="px-5 py-2.5 text-right text-xs tabular-nums text-gray-500">{inv.chains.reduce((s, c) => s + c.storeCount, 0)}</td>
                        <td className="px-5 py-2.5 text-right text-xs font-semibold tabular-nums text-gray-900">{inv.chains.reduce((s, c) => s + c.casesDeployed, 0).toLocaleString()}</td>
                        <td className="px-5 py-2.5 text-right text-xs tabular-nums text-gray-700">~{inv.chains.reduce((s, c) => s + c.casesOnShelf, 0).toLocaleString()}</td>
                        <td className="px-5 py-2.5 text-right text-xs font-semibold tabular-nums text-amber-600">{inv.chains.reduce((s, c) => s + c.casesOffShelf, 0).toLocaleString()}</td>
                        <td colSpan={2} />
                      </tr>
                    </tfoot>
                  </table>
                </Section>
              )}

              {/* By Market */}
              {inv.markets.filter(m => m.casesDeployed > 0).length > 0 && (
                <Section
                  title="By Market"
                  subtitle={`${inv.markets.filter(m => m.casesDeployed > 0).length} markets with deployments`}
                  onExportPDF={() => exportSectionPDF(
                    'Inventory by Market', null,
                    sortRows(inv.markets.filter(m => m.casesDeployed > 0), invTabMarketSort.sort.col as keyof typeof inv.markets[0], invTabMarketSort.sort.dir)
                      .map(m => [m.name, m.casesDeployed, Math.round(m.bottlesOnShelf / BOTTLES_PER_CASE), m.casesDepleted, `${m.sellThroughPct}%`, m.depletionRateWeeklyCases]),
                    ['Market', 'Deployed (cs)', '~On Shelf (cs)', 'Off Shelf (cs)', '% Off Shelf', 'Velocity (cs/wk)'],
                    logoUrl, periodLabel, marketLabel,
                  )}
                >
                  <table className="w-full">
                    <thead>
                      <tr className="border-b border-gray-100 bg-gray-50/50">
                        <SortTh col="name"                    label="Market"             sort={invTabMarketSort.sort} onSort={invTabMarketSort.toggle} />
                        <SortTh col="casesDeployed"           label="Deployed (cs)"      sort={invTabMarketSort.sort} onSort={invTabMarketSort.toggle} align="right" />
                        <SortTh col="bottlesOnShelf"          label="~On Shelf (cs)"     sort={invTabMarketSort.sort} onSort={invTabMarketSort.toggle} align="right" />
                        <SortTh col="casesDepleted"           label="Off Shelf (cs)"     sort={invTabMarketSort.sort} onSort={invTabMarketSort.toggle} align="right" />
                        <SortTh col="sellThroughPct"          label="% Off Shelf"        sort={invTabMarketSort.sort} onSort={invTabMarketSort.toggle} align="right" />
                        <SortTh col="depletionRateWeeklyCases" label="Velocity (cs/wk)"  sort={invTabMarketSort.sort} onSort={invTabMarketSort.toggle} align="right" />
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-50">
                      {sortRows(inv.markets.filter(m => m.casesDeployed > 0), invTabMarketSort.sort.col as keyof typeof inv.markets[0], invTabMarketSort.sort.dir).map(row => (
                        <tr key={row.slug} className="hover:bg-gray-50/70 transition-colors">
                          <td className="px-5 py-3.5 text-sm font-medium text-gray-900">{row.name}</td>
                          <td className="px-5 py-3.5 text-right text-sm font-semibold tabular-nums text-gray-900">{row.casesDeployed.toLocaleString()}</td>
                          <td className="px-5 py-3.5 text-right text-sm tabular-nums text-gray-700">~{Math.round(row.bottlesOnShelf / BOTTLES_PER_CASE).toLocaleString()}</td>
                          <td className="px-5 py-3.5 text-right text-sm tabular-nums text-amber-600 font-medium">{row.casesDepleted.toLocaleString()}</td>
                          <td className="px-5 py-3.5 text-right">
                            <span className={clsx('text-sm font-bold tabular-nums',
                              row.sellThroughPct >= 80 ? 'text-amber-600' : row.sellThroughPct >= 50 ? 'text-amber-500' : 'text-gray-500')}>
                              {row.sellThroughPct}%
                            </span>
                          </td>
                          <td className="px-5 py-3.5 text-right text-sm tabular-nums text-gray-500">
                            {row.depletionRateWeeklyCases > 0 ? row.depletionRateWeeklyCases : <span className="text-gray-300">—</span>}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </Section>
              )}

              {/* By Rep */}
              {inv.repDeliveries.length > 0 && (
                <Section
                  title="By Rep"
                  subtitle={`${inv.repDeliveries.length} rep${inv.repDeliveries.length !== 1 ? 's' : ''} with deliveries`}
                  onExportPDF={() => exportSectionPDF(
                    'Inventory by Rep', null,
                    sortRows(inv.repDeliveries, invTabRepSort.sort.col as keyof typeof inv.repDeliveries[0], invTabRepSort.sort.dir)
                      .map(r => [r.repName, r.casesDeployed, r.casesOnShelf, r.casesOffShelf, `${r.offShelfPct}%`]),
                    ['Rep', 'Delivered (cs)', '~On Shelf (cs)', 'Off Shelf (cs)', '% Off Shelf'],
                    logoUrl, periodLabel, marketLabel,
                  )}
                >
                  <table className="w-full">
                    <thead>
                      <tr className="border-b border-gray-100 bg-gray-50/50">
                        <SortTh col="repName"       label="Rep"              sort={invTabRepSort.sort} onSort={invTabRepSort.toggle} />
                        <SortTh col="casesDeployed" label="Delivered (cs)"   sort={invTabRepSort.sort} onSort={invTabRepSort.toggle} align="right" />
                        <SortTh col="casesOnShelf"  label="~On Shelf (cs)"   sort={invTabRepSort.sort} onSort={invTabRepSort.toggle} align="right" />
                        <SortTh col="casesOffShelf" label="Off Shelf (cs)"   sort={invTabRepSort.sort} onSort={invTabRepSort.toggle} align="right" />
                        <SortTh col="offShelfPct"   label="% Off Shelf"      sort={invTabRepSort.sort} onSort={invTabRepSort.toggle} align="right" />
                        <th className="px-5 py-3 text-left text-[10px] font-semibold text-gray-400 uppercase tracking-wider w-28">Progress</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-50">
                      {sortRows(inv.repDeliveries, invTabRepSort.sort.col as keyof typeof inv.repDeliveries[0], invTabRepSort.sort.dir).map(row => (
                        <tr key={row.repId} className="hover:bg-gray-50/70 transition-colors">
                          <td className="px-5 py-3.5">
                            <div className="flex items-center gap-2">
                              <div className="w-6 h-6 rounded-full bg-accent-light flex items-center justify-center flex-shrink-0">
                                <span className="text-[9px] font-bold text-accent">
                                  {row.repName.split(' ').map(n => n[0]).join('').slice(0, 2)}
                                </span>
                              </div>
                              <span className="text-sm font-medium text-gray-900">{row.repName}</span>
                            </div>
                          </td>
                          <td className="px-5 py-3.5 text-right text-sm font-semibold tabular-nums text-gray-900">{row.casesDeployed.toLocaleString()}</td>
                          <td className="px-5 py-3.5 text-right text-sm tabular-nums text-gray-700">~{row.casesOnShelf.toLocaleString()}</td>
                          <td className="px-5 py-3.5 text-right text-sm tabular-nums text-amber-600 font-medium">{row.casesOffShelf.toLocaleString()}</td>
                          <td className="px-5 py-3.5 text-right">
                            <span className={clsx('text-sm font-bold tabular-nums',
                              row.offShelfPct >= 80 ? 'text-amber-600' : row.offShelfPct >= 50 ? 'text-amber-500' : 'text-gray-500')}>
                              {row.offShelfPct}%
                            </span>
                          </td>
                          <td className="px-5 py-3.5">
                            <div className="flex items-center gap-2">
                              <div className="flex-1 bg-gray-100 rounded-full h-1.5 overflow-hidden w-20">
                                <div className="bg-amber-400 h-full rounded-full" style={{ width: `${row.offShelfPct}%` }} />
                              </div>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                    <tfoot>
                      <tr className="border-t border-gray-200 bg-gray-50/50">
                        <td className="px-5 py-2.5 text-xs font-semibold text-gray-500">Total</td>
                        <td className="px-5 py-2.5 text-right text-xs font-semibold tabular-nums text-gray-900">{inv.repDeliveries.reduce((s, r) => s + r.casesDeployed, 0).toLocaleString()}</td>
                        <td className="px-5 py-2.5 text-right text-xs tabular-nums text-gray-700">~{inv.repDeliveries.reduce((s, r) => s + r.casesOnShelf, 0).toLocaleString()}</td>
                        <td className="px-5 py-2.5 text-right text-xs font-semibold tabular-nums text-amber-600">{inv.repDeliveries.reduce((s, r) => s + r.casesOffShelf, 0).toLocaleString()}</td>
                        <td colSpan={2} />
                      </tr>
                    </tfoot>
                  </table>
                </Section>
              )}
            </>
          )}
        </>
      )}

      {/* ── TAB: RETAIL STOCK ── */}

      {/* ── TAB: VISITS ── */}
      {activeTab === 'visits' && (
        <div className="grid grid-cols-1 lg:grid-cols-[1fr_300px] gap-4 lg:gap-5">
          <Section
            title="Visit Activity by Rep"
            subtitle={`${repRows.length} of ${activity.byRep.length} reps · ${activity.totalVisits} visits`}
            noPad
            chartType={actChartType} onChartTypeChange={setActChartType} chartTypes={['bar', 'pie']}
            onExportPDF={() => exportSectionPDF(
              'Visit Activity by Rep', actChartType === 'pie' ? actChartRef.current : null,
              repRows.map(r => [r.rep, r.regionName, r.visits, r.stocked, r.checked, r.ordered, r.issues,
                new Date(r.lastVisit).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })]),
              ['Rep', 'Market', 'Visits', 'Stocked', 'Checked', 'Orders', 'Issues', 'Last Visit'],
              logoUrl, periodLabel, marketLabel,
            )}
            action={
              <div className="flex items-center gap-2">
                {repFilter !== 'all' && <ClearBtn onClick={() => setRepFilter('all')} />}
                <SelectFilter value={repFilter} onChange={setRepFilter} allLabel="All Reps"
                  options={activity.byRep.map(r => ({ value: r.rep, label: r.rep }))} />
              </div>
            }
          >
            {activity.byRep.length === 0 ? (
              <div className="py-10 text-center text-sm text-gray-400">No visits in this period</div>
            ) : repRows.length === 0 ? (
              <EmptyState onClear={() => setRepFilter('all')} />
            ) : actChartType === 'pie' ? (
              <div ref={actChartRef} className="px-4 pt-4 pb-4" style={{ height: 300 }}>
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie data={actPieData} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={100}
                      labelLine={false} label={PieLabel}>
                      {actPieData.map((d, i) => <Cell key={i} fill={d.fill} />)}
                    </Pie>
                    <Tooltip formatter={(v: number) => [`${v} visits`, 'Visits']} contentStyle={{ fontSize: 12, borderRadius: 8, border: '1px solid #e8eaed' }} />
                    <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: 11 }} />
                  </PieChart>
                </ResponsiveContainer>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="border-b border-gray-100 bg-gray-50/50">
                      <SortTh col="rep"        label="Rep"        sort={repSortState.sort} onSort={repSortState.toggle} />
                      <SortTh col="regionName" label="Region"     sort={repSortState.sort} onSort={repSortState.toggle} />
                      <SortTh col="visits"     label="Visits"     sort={repSortState.sort} onSort={repSortState.toggle} align="right" />
                      <SortTh col="stocked"    label="Stocked"    sort={repSortState.sort} onSort={repSortState.toggle} align="right" />
                      <SortTh col="checked"    label="Checked"    sort={repSortState.sort} onSort={repSortState.toggle} align="right" />
                      <SortTh col="ordered"    label="Orders"     sort={repSortState.sort} onSort={repSortState.toggle} align="right" />
                      <SortTh col="issues"     label="Issues"     sort={repSortState.sort} onSort={repSortState.toggle} align="right" />
                      <SortTh col="lastVisit"  label="Last Visit" sort={repSortState.sort} onSort={repSortState.toggle} />
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-50">
                    {repRows.map(row => (
                      <tr key={row.rep} className="hover:bg-gray-50/70 transition-colors">
                        <td className="px-5 py-3.5">
                          <div className="flex items-center gap-2">
                            <div className="w-6 h-6 rounded-full bg-accent-light flex items-center justify-center flex-shrink-0">
                              <span className="text-[9px] font-bold text-accent">
                                {(row.rep ?? '').split(' ').map((n: string) => n[0]).join('').slice(0, 2)}
                              </span>
                            </div>
                            <span className="text-sm font-medium text-gray-900">{row.rep}</span>
                          </div>
                        </td>
                        <td className="px-5 py-3.5 text-sm text-gray-500">{row.regionName}</td>
                        <td className="px-5 py-3.5 text-right text-sm font-semibold tabular-nums text-gray-900">{row.visits}</td>
                        <td className="px-5 py-3.5 text-right text-sm tabular-nums text-green-600">{row.stocked  || <span className="text-gray-300">—</span>}</td>
                        <td className="px-5 py-3.5 text-right text-sm tabular-nums text-blue-500">{row.checked  || <span className="text-gray-300">—</span>}</td>
                        <td className="px-5 py-3.5 text-right text-sm tabular-nums text-accent">{row.ordered   || <span className="text-gray-300">—</span>}</td>
                        <td className="px-5 py-3.5 text-right text-sm tabular-nums text-red-500">{row.issues    || <span className="text-gray-300">—</span>}</td>
                        <td className="px-5 py-3.5 text-xs text-gray-400">
                          {new Date(row.lastVisit).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Section>

          {/* Weekly visit trend — bar/line only */}
          <Section title="Visits per Week" subtitle="Activity trend" noPad
            action={<ChartToggle value={visitChartType} onChange={setVisitChartType} types={['bar', 'line']} />}
            onExportPDF={() => exportSectionPDF('Visits per Week', null,
              activity.weeklyTrend.map(r => [r.week, r.count]),
              ['Week', 'Visits'], logoUrl, periodLabel, marketLabel)}>
            {activity.weeklyTrend.length === 0 ? (
              <div className="py-10 text-center text-sm text-gray-400">No data</div>
            ) : (
              <div className="px-4 pt-2 pb-4" style={{ height: 260 }}>
                <ResponsiveContainer width="100%" height="100%">
                  {visitChartType === 'bar' ? (
                    <BarChart key="bar" data={activity.weeklyTrend} margin={{ top: 4, right: 4, bottom: 0, left: -20 }}>
                      <CartesianGrid vertical={false} stroke="#f1f5f9" />
                      <XAxis dataKey="week" tick={{ fontSize: 10, fill: '#9ca3af' }} axisLine={false} tickLine={false} />
                      <YAxis tick={{ fontSize: 10, fill: '#9ca3af' }} axisLine={false} tickLine={false} allowDecimals={false} />
                      <Tooltip contentStyle={{ background: '#fff', border: '1px solid #e8eaed', borderRadius: 8, fontSize: 12 }} cursor={{ fill: '#f8fafc' }} />
                      <Bar dataKey="count" name="Visits" radius={[4, 4, 0, 0]}>
                        {activity.weeklyTrend.map((_, i) => (
                          <Cell key={i} fill={i === activity.weeklyTrend.length - 1 ? 'var(--accent)' : 'var(--accent-light)'} />
                        ))}
                      </Bar>
                    </BarChart>
                  ) : (
                    <LineChart key="line" data={activity.weeklyTrend} margin={{ top: 4, right: 4, bottom: 0, left: -20 }}>
                      <CartesianGrid vertical={false} stroke="#f1f5f9" />
                      <XAxis dataKey="week" tick={{ fontSize: 10, fill: '#9ca3af' }} axisLine={false} tickLine={false} />
                      <YAxis tick={{ fontSize: 10, fill: '#9ca3af' }} axisLine={false} tickLine={false} allowDecimals={false} />
                      <Tooltip contentStyle={{ background: '#fff', border: '1px solid #e8eaed', borderRadius: 8, fontSize: 12 }} cursor={{ stroke: '#e2e8f0' }} />
                      <Line dataKey="count" name="Visits" stroke="var(--accent)" strokeWidth={2} dot={{ r: 4, fill: 'var(--accent)' }} activeDot={{ r: 6 }} />
                    </LineChart>
                  )}
                </ResponsiveContainer>
              </div>
            )}
          </Section>
        </div>
      )}

      {/* ── TAB: EVENTS ── */}
      {activeTab === 'events' && (
        <>
          <div className="flex items-center gap-3 mb-5 flex-wrap">
            <select
              value={eventRepFilter}
              onChange={e => setEventRepFilter(e.target.value)}
              className="px-3 py-1.5 text-sm bg-white border border-gray-200 rounded-lg outline-none focus:border-accent focus:ring-2 focus:ring-accent/10 text-gray-600 transition-all"
            >
              <option value="all">All Reps</option>
              {apiReps.map(r => <option key={r.id} value={r.id}>{r.name}</option>)}
            </select>
            {eventRepFilter !== 'all' && (
              <button onClick={() => setEventRepFilter('all')} className="text-sm text-gray-400 hover:text-gray-700 transition-colors">
                Clear
              </button>
            )}
          </div>
          <div className="grid grid-cols-2 lg:grid-cols-5 gap-3 lg:gap-3.5 mb-4">
            <StatCard label="Upcoming" value={eventStats.scheduled} valueClass="text-accent" sub="Scheduled" />
            <StatCard label="Completed" value={eventStats.completed} valueClass="text-green-600"
              sub={periodLabel} />
            <StatCard label="Bottles Sold" value={eventStats.totalBottlesSold}
              valueClass={eventStats.totalBottlesSold > 0 ? 'text-accent' : 'text-gray-900'}
              sub="At completed events" />
            <StatCard label="Completion Rate" value={`${eventStats.rate}%`}
              valueClass={eventStats.rate >= 70 ? 'text-green-600' : eventStats.rate >= 40 ? 'text-amber-600' : 'text-red-500'}
              sub={`${eventStats.cancelled} cancelled`} />
            <StatCard label="Next Event"
              value={eventStats.nextEvent
                ? new Date(eventStats.nextEvent.scheduledAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
                : '—'}
              valueClass="text-gray-900"
              sub={eventStats.nextEvent
                ? (eventStats.nextEvent.storeName ?? eventStats.nextEvent.title ?? 'Private Event')
                : 'None scheduled'} />
          </div>

          {/* Type breakdown badges */}
          <div className="flex items-center gap-2 mb-6 flex-wrap">
            <span className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider">Completed by type:</span>
            <span className="inline-flex items-center gap-1 bg-purple-50 text-purple-700 text-xs font-semibold px-2.5 py-1 rounded-full">
              {eventStats.byType.tasting} Tasting{eventStats.byType.tasting !== 1 ? 's' : ''}
            </span>
            <span className="inline-flex items-center gap-1 bg-blue-50 text-blue-700 text-xs font-semibold px-2.5 py-1 rounded-full">
              {eventStats.byType.tasking} Visit{eventStats.byType.tasking !== 1 ? 's' : ''}
            </span>
            <span className="inline-flex items-center gap-1 bg-fuchsia-50 text-fuchsia-700 text-xs font-semibold px-2.5 py-1 rounded-full">
              {eventStats.byType.private_event} Private Event{eventStats.byType.private_event !== 1 ? 's' : ''}
            </span>
          </div>

          <Section
            title="Events by Rep"
            subtitle={`${eventRepRows.length} rep${eventRepRows.length !== 1 ? 's' : ''}`}
            noPad
            onExportPDF={() => exportSectionPDF(
              'Events by Rep', null,
              eventRepRows.map(r => [r.name, r.scheduled, r.tastings, r.taskings, r.privateEvents, r.completed, `${r.rate}%`, r.bottlesSold, r.hoursWorked.toFixed(1),
                r.next ? new Date(r.next).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : '—']),
              ['Rep', 'Upcoming', 'Tastings', 'Visits', 'Private', 'Total Done', 'Rate', 'Bottles Sold', 'Hours', 'Next Event'],
              logoUrl, periodLabel, marketLabel,
            )}
          >
            {eventRepRows.length === 0 ? (
              <div className="py-10 text-center text-sm text-gray-400">No events for this filter</div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="border-b border-gray-100 bg-gray-50/50">
                      <SortTh col="name"          label="Rep"          sort={eventRepSort.sort} onSort={eventRepSort.toggle} />
                      <SortTh col="scheduled"     label="Upcoming"     sort={eventRepSort.sort} onSort={eventRepSort.toggle} align="right" />
                      <SortTh col="tastings"      label="Tastings"     sort={eventRepSort.sort} onSort={eventRepSort.toggle} align="right" />
                      <SortTh col="taskings"      label="Visits"       sort={eventRepSort.sort} onSort={eventRepSort.toggle} align="right" />
                      <SortTh col="completed"     label="Total Done"   sort={eventRepSort.sort} onSort={eventRepSort.toggle} align="right" />
                      <SortTh col="rate"          label="Rate"         sort={eventRepSort.sort} onSort={eventRepSort.toggle} align="right" />
                      <SortTh col="bottlesSold"   label="Btls Sold"    sort={eventRepSort.sort} onSort={eventRepSort.toggle} align="right" />
                      <SortTh col="hoursWorked"   label="Hours"        sort={eventRepSort.sort} onSort={eventRepSort.toggle} align="right" />
                      <th className="px-5 py-3 text-left text-[10px] font-semibold text-gray-400 uppercase tracking-wider">Next Event</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-50">
                    {eventRepRows.map(row => (
                      <tr key={row.name} className="hover:bg-gray-50/70 transition-colors">
                        <td className="px-5 py-3.5">
                          <div className="flex items-center gap-2">
                            <div className="w-6 h-6 rounded-full bg-accent-light flex items-center justify-center flex-shrink-0">
                              <span className="text-[9px] font-bold text-accent">
                                {row.name.split(' ').map(n => n[0]).join('').slice(0, 2)}
                              </span>
                            </div>
                            <span className="text-sm font-medium text-gray-900">{row.name}</span>
                          </div>
                        </td>
                        <td className="px-5 py-3.5 text-right text-sm font-semibold tabular-nums text-accent">{row.scheduled || <span className="text-gray-300">—</span>}</td>
                        <td className="px-5 py-3.5 text-right text-sm tabular-nums text-purple-600 font-medium">{row.tastings || <span className="text-gray-300">—</span>}</td>
                        <td className="px-5 py-3.5 text-right text-sm tabular-nums text-blue-500 font-medium">{row.taskings || <span className="text-gray-300">—</span>}</td>
                        <td className="px-5 py-3.5 text-right text-sm tabular-nums text-green-600 font-semibold">{row.completed || <span className="text-gray-300">—</span>}</td>
                        <td className="px-5 py-3.5 text-right">
                          {row.rate > 0
                            ? <span className={clsx('text-sm font-bold tabular-nums', row.rate >= 70 ? 'text-green-600' : row.rate >= 40 ? 'text-amber-600' : 'text-red-500')}>{row.rate}%</span>
                            : <span className="text-sm text-gray-300">—</span>}
                        </td>
                        <td className="px-5 py-3.5 text-right text-sm font-semibold tabular-nums text-gray-900">{row.bottlesSold || <span className="text-gray-300">—</span>}</td>
                        <td className="px-5 py-3.5 text-right text-sm tabular-nums text-gray-500">{row.hoursWorked > 0 ? row.hoursWorked.toFixed(1) : <span className="text-gray-300">—</span>}</td>
                        <td className="px-5 py-3.5 text-sm text-gray-500">
                          {row.next
                            ? new Date(row.next).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })
                            : <span className="text-gray-300">—</span>}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Section>

          {eventStats.byRegion.length > 0 && (
            <Section title="Events by Region" subtitle={`${eventStats.byRegion.length} regions`} noPad>
              <div className="px-4 pt-2 pb-4" style={{ height: 220 }}>
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={eventStats.byRegion} layout="vertical" margin={{ top: 4, right: 16, bottom: 0, left: 80 }}>
                    <CartesianGrid horizontal={false} stroke="#f1f5f9" />
                    <XAxis type="number" tick={{ fontSize: 10, fill: '#9ca3af' }} axisLine={false} tickLine={false} allowDecimals={false} />
                    <YAxis type="category" dataKey="name" tick={{ fontSize: 11, fill: '#6b7280' }} axisLine={false} tickLine={false} width={76} />
                    <Tooltip contentStyle={{ background: '#fff', border: '1px solid #e8eaed', borderRadius: 8, fontSize: 12 }} cursor={{ fill: '#f8fafc' }} />
                    <Bar dataKey="completed" name="Completed" stackId="a" fill="#15803d" radius={[0, 0, 0, 0]} />
                    <Bar dataKey="total" name="Total"     stackId="b" fill="var(--accent-light)" radius={[3, 3, 3, 3]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </Section>
          )}

          {/* Rep Performance — visits + events combined */}
          {repPerfRows.length > 0 && (
            <Section
              title="Rep Performance"
              subtitle={`${repPerfRows.length} rep${repPerfRows.length !== 1 ? 's' : ''} · visits + events combined · ${periodLabel}`}
              noPad
              onExportPDF={() => exportSectionPDF(
                'Rep Performance', null,
                repPerfRows.map(r => [r.rep, r.visits, r.tastings, r.taskings, r.privateEvents, r.bottlesSold, r.hoursWorked.toFixed(1)]),
                ['Rep', 'Store Visits', 'Tastings', 'Store Visits (Events)', 'Private Events', 'Bottles Sold', 'Hours Worked'],
                logoUrl, periodLabel, marketLabel,
              )}
            >
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="border-b border-gray-100 bg-gray-50/50">
                      <SortTh col="rep"           label="Rep"            sort={repPerfSort.sort} onSort={repPerfSort.toggle} />
                      <SortTh col="visits"        label="Store Visits"   sort={repPerfSort.sort} onSort={repPerfSort.toggle} align="right" />
                      <SortTh col="tastings"      label="Tastings"       sort={repPerfSort.sort} onSort={repPerfSort.toggle} align="right" />
                      <SortTh col="taskings"      label="Store Events"   sort={repPerfSort.sort} onSort={repPerfSort.toggle} align="right" />
                      <SortTh col="bottlesSold"   label="Bottles Sold"   sort={repPerfSort.sort} onSort={repPerfSort.toggle} align="right" />
                      <SortTh col="hoursWorked"   label="Hours Worked"   sort={repPerfSort.sort} onSort={repPerfSort.toggle} align="right" />
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-50">
                    {repPerfRows.map(row => {
                      const totalActivity = row.visits + row.tastings + row.taskings + row.privateEvents
                      const maxActivity   = Math.max(...repPerfRows.map(r => r.visits + r.tastings + r.taskings + r.privateEvents), 1)
                      const barPct        = (totalActivity / maxActivity) * 100
                      return (
                        <tr key={row.rep} className="hover:bg-gray-50/70 transition-colors">
                          <td className="px-5 py-3.5">
                            <div className="flex items-center gap-2">
                              <div className="w-6 h-6 rounded-full bg-accent-light flex items-center justify-center flex-shrink-0">
                                <span className="text-[9px] font-bold text-accent">
                                  {(row.rep ?? '').split(' ').map((n: string) => n[0]).join('').slice(0, 2)}
                                </span>
                              </div>
                              <div>
                                <p className="text-sm font-medium text-gray-900">{row.rep}</p>
                                <div className="flex items-center gap-1 mt-0.5">
                                  <div className="w-16 h-1 bg-gray-100 rounded-full overflow-hidden">
                                    <div className="h-full bg-accent rounded-full" style={{ width: `${barPct}%` }} />
                                  </div>
                                  <span className="text-[10px] text-gray-400">{totalActivity} total</span>
                                </div>
                              </div>
                            </div>
                          </td>
                          <td className="px-5 py-3.5 text-right text-sm tabular-nums text-gray-700 font-medium">{row.visits || <span className="text-gray-300">—</span>}</td>
                          <td className="px-5 py-3.5 text-right text-sm tabular-nums text-purple-600 font-medium">{row.tastings || <span className="text-gray-300">—</span>}</td>
                          <td className="px-5 py-3.5 text-right text-sm tabular-nums text-blue-500 font-medium">{row.taskings || <span className="text-gray-300">—</span>}</td>
                          <td className="px-5 py-3.5 text-right text-sm font-semibold tabular-nums text-gray-900">{row.bottlesSold || <span className="text-gray-300">—</span>}</td>
                          <td className="px-5 py-3.5 text-right text-sm tabular-nums text-gray-500">{row.hoursWorked > 0 ? row.hoursWorked.toFixed(1) : <span className="text-gray-300">—</span>}</td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            </Section>
          )}
        </>
      )}

      {/* ── TAB: REP ACTIVITY ── */}
      {activeTab === 'rep-activity' && (
        <>
          <div className="flex items-center gap-3 mb-5 flex-wrap">
            <select
              value={repActFilter}
              onChange={e => setRepActFilter(e.target.value)}
              className="px-3 py-1.5 text-sm bg-white border border-gray-200 rounded-lg outline-none focus:border-accent focus:ring-2 focus:ring-accent/10 text-gray-600 transition-all"
            >
              <option value="all">All Reps</option>
              {apiReps.map(r => <option key={r.id} value={r.id}>{r.name}</option>)}
            </select>
            {repActFilter !== 'all' && (
              <button onClick={() => setRepActFilter('all')} className="text-sm text-gray-400 hover:text-gray-700 transition-colors">
                Clear
              </button>
            )}
          </div>
          {/* Summary cards */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 lg:gap-3.5 mb-6">
            <StatCard label="Reps Tracked"  value={repActRows.length} valueClass="text-accent" sub={periodLabel} />
            <StatCard label="Total Visits"  value={repActRows.reduce((s, r) => s + r.visits, 0)} valueClass="text-gray-900" sub="All log types" />
            <StatCard label="Total Hours"   value={repActRows.reduce((s, r) => s + r.hoursWorked, 0).toFixed(1)} valueClass="text-blue-600" sub="From visit logs" />
            <StatCard label="Bottles Sold"  value={repActRows.reduce((s, r) => s + r.bottlesSold, 0)} valueClass="text-purple-600" sub="Private events" />
          </div>

          <Section
            title="Rep Activity"
            subtitle={`${repActRows.length} rep${repActRows.length !== 1 ? 's' : ''} · ${periodLabel}`}
            noPad
            onExportPDF={() => exportSectionPDF(
              'Rep Activity', null,
              repActRows.map(r => [
                r.rep,
                r.visits,
                r.tastings,
                r.privateEvents,
                r.hoursWorked.toFixed(1),
                r.bottlesSold,
                r.lastVisit ? new Date(r.lastVisit).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: '2-digit' }) : '—',
              ]),
              ['Rep', 'Visits', 'Tastings', 'Private Events', 'Hours Worked', 'Bottles Sold', 'Last Activity'],
              logoUrl, periodLabel, marketLabel,
            )}
          >
            {repActRows.length === 0 ? (
              <div className="py-10 text-center text-sm text-gray-400">No activity for this period</div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="border-b border-gray-100 bg-gray-50/50">
                      <SortTh col="rep"           label="Rep"             sort={repActSort.sort} onSort={repActSort.toggle} />
                      <SortTh col="visits"        label="Visits"          sort={repActSort.sort} onSort={repActSort.toggle} align="right" />
                      <SortTh col="tastings"      label="Tastings"        sort={repActSort.sort} onSort={repActSort.toggle} align="right" />
                      <SortTh col="privateEvents" label="Private Events"  sort={repActSort.sort} onSort={repActSort.toggle} align="right" />
                      <SortTh col="hoursWorked"   label="Hours Worked"    sort={repActSort.sort} onSort={repActSort.toggle} align="right" />
                      <SortTh col="bottlesSold"   label="Bottles Sold"    sort={repActSort.sort} onSort={repActSort.toggle} align="right" />
                      <SortTh col="lastVisit"     label="Last Activity"   sort={repActSort.sort} onSort={repActSort.toggle} align="right" />
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-50">
                    {repActRows.map(row => (
                      <tr key={row.rep} className="hover:bg-gray-50/70 transition-colors">
                        <td className="px-5 py-3.5">
                          <div className="flex items-center gap-2">
                            <div className="w-7 h-7 rounded-full bg-accent-light flex items-center justify-center flex-shrink-0">
                              <span className="text-[9px] font-bold text-accent">
                                {row.rep.split(' ').map(n => n[0]).join('').slice(0, 2)}
                              </span>
                            </div>
                            <div>
                              <p className="text-sm font-medium text-gray-900">{row.rep}</p>
                              <p className="text-[10px] text-gray-400">{row.regionName}</p>
                            </div>
                          </div>
                        </td>
                        <td className="px-5 py-3.5 text-right text-sm tabular-nums text-gray-700 font-medium">{row.visits || <span className="text-gray-300">—</span>}</td>
                        <td className="px-5 py-3.5 text-right text-sm tabular-nums text-purple-600 font-medium">{row.tastings || <span className="text-gray-300">—</span>}</td>
                        <td className="px-5 py-3.5 text-right text-sm tabular-nums text-fuchsia-600 font-medium">{row.privateEvents || <span className="text-gray-300">—</span>}</td>
                        <td className="px-5 py-3.5 text-right">
                          {row.hoursWorked > 0
                            ? <span className="text-sm font-semibold tabular-nums text-blue-600">{row.hoursWorked.toFixed(1)}<span className="text-xs font-normal text-gray-400 ml-0.5">h</span></span>
                            : <span className="text-gray-300 text-sm">—</span>}
                        </td>
                        <td className="px-5 py-3.5 text-right text-sm font-semibold tabular-nums text-gray-900">{row.bottlesSold || <span className="text-gray-300">—</span>}</td>
                        <td className="px-5 py-3.5 text-right text-xs text-gray-400 whitespace-nowrap">
                          {row.lastVisit
                            ? new Date(row.lastVisit).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: '2-digit' })
                            : <span className="text-gray-300">—</span>}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Section>
        </>
      )}

      {/* ── TAB: STOCKOUTS ── */}
      {activeTab === 'stockouts' && (
        <Section
          title="Projected Stockouts"
          subtitle={`${stockRows.length} of ${depletion.stockouts.length} stores`}
          chartType={stockChartType} onChartTypeChange={setStockChartType} chartTypes={['bar', 'pie']}
          onExportPDF={() => exportSectionPDF(
            'Projected Stockouts', stockChartType === 'pie' ? stockChartRef.current : null,
            stockRows.map(r => {
              const urgency = r.onShelf <= 3 ? 'Critical' : r.onShelf === 4 ? 'Attention' : 'Good'
              return [r.storeName, r.regionName, r.rep, r.onShelf, r.depletionRate, `${r.daysLeft}d`,
                r.projectedDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }), urgency]
            }),
            ['Store', 'Market', 'Rep', 'On Shelf', 'Rate', 'Days Left', 'Projected Empty', 'Urgency'],
            logoUrl, periodLabel, marketLabel,
          )}
          action={
            <div className="flex items-center gap-2">
              {(stockStoreFilter !== 'all' || stockRepFilter !== 'all' || stockUrgency !== 'all') && (
                <ClearBtn onClick={() => { setStockStoreFilter('all'); setStockRepFilter('all'); setStockUrgency('all') }} />
              )}
              <SelectFilter value={stockStoreFilter} onChange={v => { setStockStoreFilter(v); setStockRepFilter('all') }}
                allLabel="All Stores" options={depletion.stockouts.map(r => ({ value: r.storeId, label: r.storeName }))} />
              <SelectFilter value={stockRepFilter} onChange={setStockRepFilter} allLabel="All Reps"
                options={[...new Map(depletion.stockouts.map(r => [r.rep, r.rep])).entries()].map(([v]) => ({ value: v, label: v }))} />
              <UrgencyPills value={stockUrgency} onChange={setStockUrgency} />
            </div>
          }
        >
          {depletion.stockouts.length === 0 ? (
            <div className="py-10 text-center"><p className="text-sm font-medium text-gray-500">No depletion data available</p></div>
          ) : stockRows.length === 0 ? (
            <EmptyState onClear={() => { setStockStoreFilter('all'); setStockRepFilter('all'); setStockUrgency('all') }} />
          ) : stockChartType === 'pie' ? (
            <div ref={stockChartRef} className="px-4 pt-4 pb-4" style={{ height: 300 }}>
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie data={stockPieData} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={100}
                    labelLine={false} label={PieLabel}>
                    {stockPieData.map((d, i) => <Cell key={i} fill={d.fill} />)}
                  </Pie>
                  <Tooltip formatter={(v: number) => [`${v} stores`]} contentStyle={{ fontSize: 12, borderRadius: 8, border: '1px solid #e8eaed' }} />
                  <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: 11 }} />
                </PieChart>
              </ResponsiveContainer>
            </div>
          ) : (
            <table className="w-full">
              <thead>
                <tr className="border-b border-gray-100 bg-gray-50/50">
                  <SortTh col="storeName"     label="Store"           sort={stockSortState.sort} onSort={stockSortState.toggle} />
                  <SortTh col="regionName"    label="Region"          sort={stockSortState.sort} onSort={stockSortState.toggle} />
                  <SortTh col="rep"           label="Rep"             sort={stockSortState.sort} onSort={stockSortState.toggle} />
                  <SortTh col="onShelf"       label="On Shelf"        sort={stockSortState.sort} onSort={stockSortState.toggle} align="right" />
                  <SortTh col="depletionRate" label="Rate (btl/day)"  sort={stockSortState.sort} onSort={stockSortState.toggle} align="right" />
                  <SortTh col="daysLeft"      label="Days Left"       sort={stockSortState.sort} onSort={stockSortState.toggle} align="right" />
                  <SortTh col="projectedDate" label="Projected Empty" sort={stockSortState.sort} onSort={stockSortState.toggle} />
                  <th className="px-5 py-3 text-left text-[10px] font-semibold text-gray-400 uppercase tracking-wider">Urgency</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {stockRows.map(row => {
                  const urgency = row.onShelf <= 3 ? 'critical' : row.onShelf === 4 ? 'low' : 'good'
                  return (
                    <tr key={row.storeId} className="hover:bg-gray-50/70 transition-colors">
                      <td className="px-5 py-3.5">
                        <Link to={`/stores/${row.storeId}`} className="flex items-center gap-2 group">
                          <div className="w-6 h-6 rounded-md bg-accent-light flex items-center justify-center flex-shrink-0">
                            <span className="text-[9px] font-bold text-accent">{row.storeName.charAt(0)}</span>
                          </div>
                          <span className="text-sm font-medium text-gray-900 group-hover:text-accent transition-colors">{row.storeName}</span>
                        </Link>
                      </td>
                      <td className="px-5 py-3.5 text-sm text-gray-500">{row.regionName}</td>
                      <td className="px-5 py-3.5 text-sm text-gray-500">{row.rep}</td>
                      <td className="px-5 py-3.5 text-right text-sm font-semibold tabular-nums text-gray-900">{row.onShelf}</td>
                      <td className="px-5 py-3.5 text-right text-sm tabular-nums text-gray-500">{row.depletionRate}</td>
                      <td className="px-5 py-3.5 text-right">
                        <span className={clsx('text-sm font-bold tabular-nums',
                          urgency === 'critical' ? 'text-red-500' : urgency === 'low' ? 'text-amber-600' : 'text-green-600')}>
                          {row.daysLeft}d
                        </span>
                      </td>
                      <td className="px-5 py-3.5 text-sm text-gray-500">
                        {row.projectedDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                      </td>
                      <td className="px-5 py-3.5"><UrgencyBadge urgency={urgency} /></td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          )}
        </Section>
      )}

      {/* ── TAB: CHAINS ── */}
      {activeTab === 'chains' && (
        <>
        {totalCasesMade > 0 && (
          <div className="flex flex-wrap items-center gap-5 bg-white border border-gray-200 rounded-xl px-5 py-3.5 mb-4">
            <div className="flex items-baseline gap-1.5">
              <span className="text-xs text-gray-400">Warehouse</span>
              <span className="text-sm font-semibold text-gray-900 tabular-nums">{casesInWarehouse.toLocaleString()}</span>
              <span className="text-xs text-gray-400">cases</span>
            </div>
            <div className="w-px h-4 bg-gray-200" />
            <div className="flex items-baseline gap-1.5">
              <span className="text-xs text-gray-400">Deployed</span>
              <span className="text-sm font-semibold text-gray-900 tabular-nums">{casesOut.toLocaleString()}</span>
              <span className="text-xs text-gray-400">cases</span>
            </div>
            <div className="w-px h-4 bg-gray-200" />
            <div className="flex items-baseline gap-1.5">
              <span className="text-xs text-gray-400">On shelf</span>
              <span className="text-sm font-semibold text-gray-900 tabular-nums">~{stCasesRemaining.toLocaleString()}</span>
              <span className="text-xs text-gray-400">cases</span>
            </div>
            <div className="w-px h-4 bg-gray-200" />
            <div className="flex items-baseline gap-1.5">
              <span className="text-xs text-gray-400">Off shelf</span>
              <span className="text-sm font-semibold text-gray-900 tabular-nums">{casesDepleted.toLocaleString()}</span>
              <span className="text-xs text-gray-400">cases</span>
            </div>
            <div className="w-px h-4 bg-gray-200" />
            <div className="flex items-baseline gap-1.5">
              <span className="text-xs text-gray-400">Sell-through</span>
              <span className={clsx('text-sm font-bold tabular-nums', stPct >= 80 ? 'text-green-600' : stPct >= 50 ? 'text-accent' : 'text-amber-600')}>
                {stPct}%
              </span>
            </div>
            {reorderAlert && (
              <>
                <div className="w-px h-4 bg-gray-200" />
                <span className="text-xs font-semibold text-red-600">⚠ Reorder now</span>
              </>
            )}
          </div>
        )}
        <Section
          title="Chain Performance"
          subtitle={`${chainRows.length} chain${chainRows.length !== 1 ? 's' : ''}`}
          onExportPDF={() => exportSectionPDF(
            'Chain Performance', null,
            chainRows.map(r => [r.chainName, r.stores, r.onShelf, r.inProcess, r.avgDays !== null ? `${r.avgDays}d` : '—', r.critical, r.low, r.good, r.alerts]),
            ['Chain', 'Stores', 'On Shelf', 'In Process', 'Avg Days', 'Critical', 'Low', 'Good', 'Alerts'],
            logoUrl, periodLabel, marketLabel,
          )}
        >
          {chainRows.length === 0 ? (
            <div className="py-10 text-center text-sm text-gray-400">No chain data for this filter</div>
          ) : (
            <table className="w-full">
              <thead>
                <tr className="border-b border-gray-100 bg-gray-50/50">
                  <SortTh col="chainName" label="Chain"          sort={chainSortState.sort} onSort={chainSortState.toggle} />
                  <SortTh col="stores"    label="Stores"         sort={chainSortState.sort} onSort={chainSortState.toggle} align="right" />
                  <SortTh col="onShelf"   label="On Shelf"       sort={chainSortState.sort} onSort={chainSortState.toggle} align="right" />
                  <SortTh col="inProcess" label="In Process"     sort={chainSortState.sort} onSort={chainSortState.toggle} align="right" />
                  <SortTh col="avgDays"   label="Avg Days"       sort={chainSortState.sort} onSort={chainSortState.toggle} align="right" />
                  <SortTh col="critical"  label="Critical"       sort={chainSortState.sort} onSort={chainSortState.toggle} align="right" />
                  <SortTh col="low"       label="Low"            sort={chainSortState.sort} onSort={chainSortState.toggle} align="right" />
                  <SortTh col="good"      label="Good"           sort={chainSortState.sort} onSort={chainSortState.toggle} align="right" />
                  <SortTh col="alerts"    label="Active Alerts"  sort={chainSortState.sort} onSort={chainSortState.toggle} align="right" />
                  <th className="px-5 py-3 text-left text-[10px] font-semibold text-gray-400 uppercase tracking-wider">Health</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {chainRows.map(row => {
                  const total    = row.critical + row.low + row.good
                  const critPct  = total ? (row.critical / total) * 100 : 0
                  const lowPct   = total ? (row.low      / total) * 100 : 0
                  const goodPct  = total ? (row.good     / total) * 100 : 0
                  return (
                    <tr key={row.chainId} className="hover:bg-gray-50/70 transition-colors">
                      <td className="px-5 py-3.5">
                        <button onClick={() => setActiveChain(row.chainId === activeChain ? 'all' : row.chainId)}
                          className="text-sm font-semibold text-gray-900 hover:text-accent transition-colors">
                          {row.chainName}
                        </button>
                      </td>
                      <td className="px-5 py-3.5 text-right text-sm text-gray-500">{row.stores}</td>
                      <td className="px-5 py-3.5 text-right text-sm font-semibold tabular-nums text-gray-900">{row.onShelf}</td>
                      <td className="px-5 py-3.5 text-right text-sm tabular-nums text-blue-500 font-semibold">
                        {row.inProcess > 0 ? row.inProcess : <span className="text-gray-300">—</span>}
                      </td>
                      <td className="px-5 py-3.5 text-right">
                        {row.avgDays !== null
                          ? <span className={clsx('text-sm font-semibold tabular-nums', row.avgDays < 7 ? 'text-red-500' : row.avgDays < 10 ? 'text-amber-600' : 'text-green-600')}>{row.avgDays}d</span>
                          : <span className="text-gray-300 text-sm">—</span>}
                      </td>
                      <td className="px-5 py-3.5 text-right text-sm tabular-nums text-red-500 font-medium">{row.critical || <span className="text-gray-300">—</span>}</td>
                      <td className="px-5 py-3.5 text-right text-sm tabular-nums text-amber-600 font-medium">{row.low      || <span className="text-gray-300">—</span>}</td>
                      <td className="px-5 py-3.5 text-right text-sm tabular-nums text-green-600 font-medium">{row.good     || <span className="text-gray-300">—</span>}</td>
                      <td className="px-5 py-3.5 text-right">
                        {row.alerts > 0
                          ? <span className="text-sm font-semibold text-red-500 tabular-nums">{row.alerts}</span>
                          : <span className="text-gray-300 text-sm">—</span>}
                      </td>
                      <td className="px-5 py-3.5">
                        <div className="flex h-2 rounded-full overflow-hidden w-24 bg-gray-100">
                          {critPct > 0 && <div className="bg-red-400 h-full"   style={{ width: `${critPct}%` }} />}
                          {lowPct  > 0 && <div className="bg-amber-400 h-full" style={{ width: `${lowPct}%` }} />}
                          {goodPct > 0 && <div className="bg-green-500 h-full" style={{ width: `${goodPct}%` }} />}
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          )}
        </Section>
        </>
      )}

      {/* ── TAB: STORE HEALTH ── */}
      {activeTab === 'health' && (
        <>
        {totalCasesMade > 0 && (
          <div className="flex flex-wrap items-center gap-5 bg-white border border-gray-200 rounded-xl px-5 py-3.5 mb-4">
            <div className="flex items-baseline gap-1.5">
              <span className="text-xs text-gray-400">Warehouse</span>
              <span className="text-sm font-semibold text-gray-900 tabular-nums">{casesInWarehouse.toLocaleString()}</span>
              <span className="text-xs text-gray-400">cases</span>
            </div>
            <div className="w-px h-4 bg-gray-200" />
            <div className="flex items-baseline gap-1.5">
              <span className="text-xs text-gray-400">Deployed</span>
              <span className="text-sm font-semibold text-gray-900 tabular-nums">{casesOut.toLocaleString()}</span>
              <span className="text-xs text-gray-400">cases</span>
            </div>
            <div className="w-px h-4 bg-gray-200" />
            <div className="flex items-baseline gap-1.5">
              <span className="text-xs text-gray-400">On shelf</span>
              <span className="text-sm font-semibold text-gray-900 tabular-nums">~{stCasesRemaining.toLocaleString()}</span>
              <span className="text-xs text-gray-400">cases</span>
            </div>
            <div className="w-px h-4 bg-gray-200" />
            <div className="flex items-baseline gap-1.5">
              <span className="text-xs text-gray-400">Off shelf</span>
              <span className="text-sm font-semibold text-gray-900 tabular-nums">{casesDepleted.toLocaleString()}</span>
              <span className="text-xs text-gray-400">cases</span>
            </div>
            <div className="w-px h-4 bg-gray-200" />
            <div className="flex items-baseline gap-1.5">
              <span className="text-xs text-gray-400">Sell-through</span>
              <span className={clsx('text-sm font-bold tabular-nums', stPct >= 80 ? 'text-green-600' : stPct >= 50 ? 'text-accent' : 'text-amber-600')}>
                {stPct}%
              </span>
            </div>
            {reorderAlert && (
              <>
                <div className="w-px h-4 bg-gray-200" />
                <span className="text-xs font-semibold text-red-600">⚠ Reorder now</span>
              </>
            )}
          </div>
        )}
        <Section
          title="Store Health Scorecard"
          subtitle={`${healthRows.length} store${healthRows.length !== 1 ? 's' : ''} · scored on supply, visit recency, and alerts`}
          onExportPDF={() => exportSectionPDF(
            'Store Health Scorecard', null,
            healthRows.map(r => [r.storeName, r.chainName, r.regionName, r.rep, r.onShelf,
              r.daysOfSupply !== null ? `${r.daysOfSupply}d` : '—',
              r.lastVisit ? new Date(r.lastVisit).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : 'Never',
              r.hasAlert ? 'Yes' : 'No', r.score]),
            ['Store', 'Chain', 'Market', 'Rep', 'On Shelf', 'Days Left', 'Last Visit', 'Alert', 'Score'],
            logoUrl, periodLabel, marketLabel,
          )}
          action={
            <SelectFilter value={healthChainFilter} onChange={setHealthChainFilter} allLabel="All Chains"
              options={[...new Set(healthReport.stores.map(r => r.chainName))].map(n => {
                const store = allStores.find(s => s.chainName === n)
                return { value: store?.chainId ?? n, label: n }
              })} />
          }
        >
          {healthRows.length === 0 ? (
            <div className="py-10 text-center text-sm text-gray-400">No stores for this filter</div>
          ) : (
            <table className="w-full">
              <thead>
                <tr className="border-b border-gray-100 bg-gray-50/50">
                  <SortTh col="storeName"   label="Store"       sort={healthSortState.sort} onSort={healthSortState.toggle} />
                  <SortTh col="chainName"   label="Chain"       sort={healthSortState.sort} onSort={healthSortState.toggle} />
                  <SortTh col="regionName"  label="Region"      sort={healthSortState.sort} onSort={healthSortState.toggle} />
                  <SortTh col="rep"         label="Rep"         sort={healthSortState.sort} onSort={healthSortState.toggle} />
                  <SortTh col="onShelf"     label="On Shelf"    sort={healthSortState.sort} onSort={healthSortState.toggle} align="right" />
                  <SortTh col="daysOfSupply" label="Days Left"  sort={healthSortState.sort} onSort={healthSortState.toggle} align="right" />
                  <SortTh col="lastVisit"   label="Last Visit"  sort={healthSortState.sort} onSort={healthSortState.toggle} />
                  <SortTh col="score"       label="Score"       sort={healthSortState.sort} onSort={healthSortState.toggle} align="right" />
                  <th className="px-5 py-3 text-left text-[10px] font-semibold text-gray-400 uppercase tracking-wider w-36">Health</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {healthRows.map(row => {
                  const scoreColor = row.score >= 70 ? 'text-green-600' : row.score >= 40 ? 'text-amber-600' : 'text-red-500'
                  const barColor   = row.score >= 70 ? 'bg-green-500'  : row.score >= 40 ? 'bg-amber-400'   : 'bg-red-400'
                  const daysSince  = row.lastVisit
                    ? Math.floor((Date.now() - new Date(row.lastVisit).getTime()) / 86_400_000)
                    : null
                  return (
                    <tr key={row.storeId} className="hover:bg-gray-50/70 transition-colors">
                      <td className="px-5 py-3.5">
                        <div className="flex items-center gap-2">
                          <Link to={`/stores/${row.storeId}`} className="text-sm font-medium text-gray-900 hover:text-accent transition-colors">
                            {row.storeName}
                          </Link>
                          {row.hasAlert && (
                            <span className="w-1.5 h-1.5 rounded-full bg-red-400 flex-shrink-0" title="Active alert" />
                          )}
                        </div>
                      </td>
                      <td className="px-5 py-3.5 text-sm text-gray-500">{row.chainName}</td>
                      <td className="px-5 py-3.5 text-sm text-gray-500">{row.regionName}</td>
                      <td className="px-5 py-3.5 text-sm text-gray-500">{row.rep}</td>
                      <td className="px-5 py-3.5 text-right text-sm font-semibold tabular-nums text-gray-900">{row.onShelf}</td>
                      <td className="px-5 py-3.5 text-right">
                        {row.daysOfSupply !== null
                          ? <span className={clsx('text-sm font-semibold tabular-nums',
                              row.onShelf <= 3 ? 'text-red-500' : row.onShelf === 4 ? 'text-amber-600' : 'text-green-600')}>
                              {row.daysOfSupply}d
                            </span>
                          : <span className="text-gray-300 text-sm">—</span>}
                      </td>
                      <td className="px-5 py-3.5 text-xs text-gray-400">
                        {daysSince === null ? 'Never'
                          : daysSince === 0 ? 'Today'
                          : daysSince === 1 ? 'Yesterday'
                          : `${daysSince}d ago`}
                      </td>
                      <td className="px-5 py-3.5 text-right">
                        <span className={clsx('text-sm font-bold tabular-nums', scoreColor)}>{row.score}</span>
                      </td>
                      <td className="px-5 py-3.5">
                        <div className="flex items-center gap-2">
                          <div className="flex-1 bg-gray-100 rounded-full h-1.5 overflow-hidden w-24">
                            <div className={clsx('h-full rounded-full transition-all', barColor)} style={{ width: `${row.score}%` }} />
                          </div>
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          )}
        </Section>
        </>
      )}
    </div>
  )
}

// ─── Section wrapper ──────────────────────────────────────────────────────────

function Section({
  title, subtitle, children, noPad = false, action,
  chartType, onChartTypeChange, chartTypes, onExportPDF,
}: {
  title:    string
  subtitle: string
  children: React.ReactNode
  noPad?:   boolean
  action?:  React.ReactNode
  chartType?:         ChartType
  onChartTypeChange?: (t: ChartType) => void
  chartTypes?:        ChartType[]
  onExportPDF?:       () => void
}) {
  return (
    <div className="bg-white border border-gray-200 rounded-xl overflow-hidden mb-6">
      <div className="px-4 lg:px-5 py-3 lg:py-4 border-b border-gray-100 flex items-start lg:items-center justify-between gap-3 flex-wrap">
        <div>
          <h2 className="text-sm font-semibold text-gray-900">{title}</h2>
          <p className="text-xs text-gray-400 mt-0.5">{subtitle}</p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {action && <div className="flex items-center gap-2 flex-wrap">{action}</div>}
          {chartType && onChartTypeChange && (
            <ChartToggle value={chartType} onChange={onChartTypeChange} types={chartTypes} />
          )}
          {onExportPDF && (
            <button
              onClick={onExportPDF}
              title="Export section as PDF"
              className="flex items-center gap-1.5 px-2 py-1 text-[10px] font-medium text-gray-400 hover:text-accent hover:bg-accent/5 rounded-md transition-colors border border-transparent hover:border-accent/20"
            >
              <svg width="11" height="11" viewBox="0 0 11 11" fill="none">
                <path d="M5.5 1v6M3 5l2.5 2.5L8 5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"/>
                <path d="M1 9h9" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/>
              </svg>
              PDF
            </button>
          )}
        </div>
      </div>
      {noPad ? children : <div className="overflow-x-auto">{children}</div>}
    </div>
  )
}

// ─── Inventory table (extracted to keep JSX readable) ────────────────────────

function InventoryTable({ rows, sort, inventory, activeMarket, onMarketClick }: {
  rows:          RegionInventoryRow[]
  sort:          ReturnType<typeof useSortState<keyof RegionInventoryRow>>
  inventory:     ReturnType<typeof useInventoryReport>
  activeMarket:  string
  onMarketClick: (slug: string) => void
}) {
  return (
    <table className="w-full">
      <thead>
        <tr className="border-b border-gray-100 bg-gray-50/50">
          <SortTh col="name"       label="Region"          sort={sort.sort} onSort={sort.toggle} />
          <SortTh col="storeCount" label="Stores"          sort={sort.sort} onSort={sort.toggle} />
          <SortTh col="onShelf"    label="On Shelf"        sort={sort.sort} onSort={sort.toggle} align="right" />
          <SortTh col="inProcess"  label="In Process"      sort={sort.sort} onSort={sort.toggle} align="right" />
          <SortTh col="avgDays"    label="Avg Days Supply" sort={sort.sort} onSort={sort.toggle} align="right" />
          <SortTh col="critical"   label="Critical"        sort={sort.sort} onSort={sort.toggle} align="right" />
          <SortTh col="low"        label="Low"             sort={sort.sort} onSort={sort.toggle} align="right" />
          <SortTh col="good"       label="Good"            sort={sort.sort} onSort={sort.toggle} align="right" />
          <th className="px-5 py-3 text-left text-[10px] font-semibold text-gray-400 uppercase tracking-wider">Health</th>
        </tr>
      </thead>
      <tbody className="divide-y divide-gray-50">
        {rows.map(row => {
          const total   = row.critical + row.low + row.good
          const critPct = total ? (row.critical / total) * 100 : 0
          const lowPct  = total ? (row.low      / total) * 100 : 0
          const goodPct = total ? (row.good     / total) * 100 : 0
          return (
            <tr key={row.slug} className="hover:bg-gray-50/70 transition-colors">
              <td className="px-5 py-3.5">
                <button onClick={() => onMarketClick(row.slug === activeMarket ? 'all' : row.slug)}
                  className="text-sm font-medium text-gray-900 hover:text-accent transition-colors">
                  {row.name}
                </button>
              </td>
              <td className="px-5 py-3.5 text-sm text-gray-500">{row.storeCount}</td>
              <td className="px-5 py-3.5 text-right text-sm font-semibold tabular-nums text-gray-900">{row.onShelf}</td>
              <td className="px-5 py-3.5 text-right text-sm tabular-nums text-blue-500 font-semibold">
                {row.inProcess > 0 ? row.inProcess : <span className="text-gray-300">—</span>}
              </td>
              <td className="px-5 py-3.5 text-right">
                {row.avgDays !== null
                  ? <span className={clsx('text-sm font-semibold tabular-nums', row.avgDays < 7 ? 'text-red-500' : row.avgDays < 10 ? 'text-amber-600' : 'text-green-600')}>{row.avgDays}d</span>
                  : <span className="text-gray-300 text-sm">—</span>}
              </td>
              <td className="px-5 py-3.5 text-right text-sm tabular-nums text-red-500 font-medium">{row.critical || '—'}</td>
              <td className="px-5 py-3.5 text-right text-sm tabular-nums text-amber-600 font-medium">{row.low || '—'}</td>
              <td className="px-5 py-3.5 text-right text-sm tabular-nums text-green-600 font-medium">{row.good || '—'}</td>
              <td className="px-5 py-3.5">
                <div className="flex h-2 rounded-full overflow-hidden w-28 bg-gray-100">
                  {critPct > 0 && <div className="bg-red-400 h-full"   style={{ width: `${critPct}%` }} />}
                  {lowPct  > 0 && <div className="bg-amber-400 h-full" style={{ width: `${lowPct}%` }} />}
                  {goodPct > 0 && <div className="bg-green-500 h-full" style={{ width: `${goodPct}%` }} />}
                </div>
              </td>
            </tr>
          )
        })}
      </tbody>
      <tfoot>
        <tr className="border-t border-gray-200 bg-gray-50/50">
          <td className="px-5 py-3 text-xs font-semibold text-gray-500">Total</td>
          <td className="px-5 py-3 text-xs text-gray-500">{inventory.storeCount}</td>
          <td className="px-5 py-3 text-right text-xs font-semibold tabular-nums text-gray-900">{inventory.totalOnShelf}</td>
          <td className="px-5 py-3 text-right text-xs font-semibold tabular-nums text-blue-500">{inventory.totalInProcess || '—'}</td>
          <td className="px-5 py-3 text-right text-xs font-semibold text-gray-700">{inventory.avgDaysSupply}d avg</td>
          <td className="px-5 py-3 text-right text-xs font-semibold text-red-500">{inventory.criticalCount}</td>
          <td className="px-5 py-3 text-right text-xs font-semibold text-amber-600">{inventory.byRegion.reduce((s, r) => s + r.low, 0)}</td>
          <td className="px-5 py-3 text-right text-xs font-semibold text-green-600">{inventory.byRegion.reduce((s, r) => s + r.good, 0)}</td>
          <td />
        </tr>
      </tfoot>
    </table>
  )
}

// ─── shared sub-components ───────────────────────────────────────────────────

function SortTh<T extends string>({ col, label, sort, onSort, align }: {
  col: T; label: string; sort: { col: T; dir: Dir }; onSort: (col: T) => void; align?: 'right'
}) {
  const active = sort.col === col
  return (
    <th onClick={() => onSort(col)}
      className={clsx('px-5 py-3 text-[10px] font-semibold text-gray-400 uppercase tracking-wider',
        'cursor-pointer select-none hover:text-gray-600 transition-colors whitespace-nowrap',
        align === 'right' ? 'text-right' : 'text-left')}>
      {label}
      <span className={clsx('ml-1 inline-block', active ? 'text-accent' : 'text-gray-300')}>
        {active ? (sort.dir === 'asc' ? '↑' : '↓') : '↕'}
      </span>
    </th>
  )
}

function ClearBtn({ onClick }: { onClick: () => void }) {
  return (
    <button onClick={onClick}
      className="text-[10px] font-medium text-gray-400 hover:text-accent transition-colors px-1.5 py-0.5 rounded hover:bg-accent/5 whitespace-nowrap">
      Clear
    </button>
  )
}

function SelectFilter({ value, onChange, allLabel, options }: {
  value: string; onChange: (v: string) => void; allLabel: string; options: { value: string; label: string }[]
}) {
  return (
    <select value={value} onChange={e => onChange(e.target.value)}
      className="px-2.5 py-1 text-xs bg-white border border-gray-200 rounded-lg outline-none focus:border-accent focus:ring-2 focus:ring-accent/10 transition-all text-gray-600 cursor-pointer max-w-[160px]">
      <option value="all">{allLabel}</option>
      {options.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
    </select>
  )
}

function UrgencyPills({ value, onChange }: { value: UrgencyFilter; onChange: (v: UrgencyFilter) => void }) {
  const pills: { v: UrgencyFilter; label: string }[] = [
    { v: 'all', label: 'All' }, { v: 'critical', label: 'Critical' },
    { v: 'low', label: 'Attention' }, { v: 'good', label: 'Good' },
  ]
  return (
    <div className="flex items-center gap-0.5 bg-gray-100 rounded-lg p-0.5">
      {pills.map(p => (
        <button key={p.v} onClick={() => onChange(p.v)}
          className={clsx('px-2.5 py-1 rounded-md text-[10px] font-semibold transition-all',
            value === p.v ? 'bg-white text-gray-800 shadow-sm' : 'text-gray-400 hover:text-gray-600')}>
          {p.label}
        </button>
      ))}
    </div>
  )
}

function EmptyState({ onClear }: { onClear: () => void }) {
  return (
    <div className="py-10 text-center">
      <p className="text-sm text-gray-400">No results match your filters</p>
      <button onClick={onClear} className="mt-1.5 text-xs text-accent hover:underline">Clear filters</button>
    </div>
  )
}

function StatCard({ label, value, sub, valueClass = 'text-gray-900', onClick }: {
  label: string; value: string | number; sub: string; valueClass?: string; onClick?: () => void
}) {
  return (
    <div
      onClick={onClick}
      className={clsx(
        'bg-white border border-gray-200 rounded-xl px-5 py-4',
        onClick && 'cursor-pointer hover:border-accent/40 hover:shadow-sm transition-all',
      )}
    >
      <p className="text-xs font-medium text-gray-400 uppercase tracking-wider mb-2">{label}</p>
      <p className={clsx('text-2xl font-bold tabular-nums mb-1', valueClass)}>{value}</p>
      <p className="text-xs text-gray-400">{sub}</p>
      {onClick && (
        <p className="text-[10px] text-accent mt-1 font-medium">View details →</p>
      )}
    </div>
  )
}

function InvStatBlock({ label, value, btls, color = 'text-gray-900', sub, approx }: {
  label: string; value: number; btls: number; color?: string; sub?: string; approx?: boolean
}) {
  return (
    <div>
      <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide mb-1">{label}</p>
      <p className={clsx('text-xl font-bold tabular-nums', color, value === 0 && color === 'text-gray-900' ? 'text-gray-400' : '')}>
        {value === 0 ? '—' : `${approx ? '~' : ''}${btls.toLocaleString()}`}
      </p>
      <p className="text-[10px] text-gray-400 mt-0.5">bottles</p>
      <p className="text-[10px] text-gray-400">{approx ? '~' : ''}{value.toLocaleString()} cases</p>
      {sub && <p className="text-[10px] text-gray-400">{sub}</p>}
    </div>
  )
}

function UrgencyBadge({ urgency }: { urgency: 'critical' | 'low' | 'good' }) {
  const styles = { critical: 'bg-red-50 text-red-600', low: 'bg-amber-50 text-amber-700', good: 'bg-green-50 text-green-700' }
  const labels = { critical: 'Critical', low: 'Attention', good: 'Good' }
  return (
    <span className={clsx('text-[10px] font-semibold px-2 py-0.5 rounded-full', styles[urgency])}>
      {labels[urgency]}
    </span>
  )
}

