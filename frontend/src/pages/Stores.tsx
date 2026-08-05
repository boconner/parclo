import { useMemo, useState, useEffect } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { clsx } from 'clsx'
import { Button } from '@/components/ui/Button'
import { MarketBar } from '@/components/dashboard/MarketBar'
import { MarketMap } from '@/components/dashboard/MarketMap'
import { SupplyBar, StatusPill, statusVariant } from '@/components/ui/SupplyIndicator'
import { SkeletonTableRow } from '@/components/ui/Skeleton'
import { useStores, useChains, useRegions } from '@/hooks/useQueries'
import { exportStoresCSV } from '@/lib/exportStores'
import type { Chain } from '@/types'
import type { DashboardStore } from '@/types'
import type { ApiRegion } from '@/lib/api'

// ─── page ─────────────────────────────────────────────────────────────────────

export default function Stores() {
  const [searchParams, setSearchParams] = useSearchParams()
  const activeChainId  = searchParams.get('chain')
  const activeMarketId = searchParams.get('market') ?? 'all'

  const [showInactive, setShowInactive] = useState(false)
  const { data: apiStores  } = useStores(showInactive ? { includeInactive: 'true' } : undefined)
  const { data: apiChains  } = useChains()
  const { data: apiMarkets } = useRegions()

  const allStores = apiStores  ?? []
  const allChains = apiChains  ?? []
  const markets   = apiMarkets ?? []

  function setMarket(m: string) {
    setSearchParams(prev => {
      const next = new URLSearchParams(prev)
      if (m === 'all') next.delete('market')
      else next.set('market', m)
      return next
    })
  }

  function setChain(chainId: string | null) {
    setSearchParams(prev => {
      const next = new URLSearchParams(prev)
      if (!chainId) next.delete('chain')
      else next.set('chain', chainId)
      next.delete('market')
      return next
    })
  }

  // Market filter applied first
  const marketFilteredStores = useMemo(() =>
    activeMarketId === 'all' ? allStores : allStores.filter(s => s.region === activeMarketId)
  , [allStores, activeMarketId])

  // Chain filter applied on top of market filter
  const visibleStores = useMemo(() => {
    if (!activeChainId) return marketFilteredStores
    if (activeChainId === 'independent') return marketFilteredStores.filter(s => s.chainId === null)
    return marketFilteredStores.filter(s => s.chainId === activeChainId)
  }, [marketFilteredStores, activeChainId])

  const activeChain = useMemo((): Chain | null => {
    if (!activeChainId) return null
    if (activeChainId === 'independent') return { id: 'independent', name: 'Independent Stores', _count: { stores: 0 } }
    return allChains.find(c => c.id === activeChainId) ?? null
  }, [activeChainId, allChains])

  // All stores for active chain across all markets (for chain header stats)
  const allActiveChainStores = useMemo(() => {
    if (!activeChainId) return allStores
    if (activeChainId === 'independent') return allStores.filter(s => s.chainId === null)
    return allStores.filter(s => s.chainId === activeChainId)
  }, [allStores, activeChainId])

  // Markets available for the current chain filter (scoped when chain is selected)
  const availableMarkets = useMemo(() => {
    if (!activeChainId) return markets
    const marketIds = new Set(allActiveChainStores.map(s => s.region))
    return markets.filter(m => marketIds.has(m.slug))
  }, [activeChainId, allActiveChainStores, markets])

  const availableStoreCounts = useMemo(() => {
    if (!activeChainId) {
      return markets.reduce((acc, m) => { acc[m.slug] = m._count.stores; return acc }, {} as Record<string, number>)
    }
    return availableMarkets.reduce((acc, m) => {
      acc[m.slug] = allActiveChainStores.filter(s => s.region === m.slug).length
      return acc
    }, {} as Record<string, number>)
  }, [activeChainId, availableMarkets, allActiveChainStores, markets])

  return (
    <StoreListView
      stores={visibleStores}
      allStores={allStores}
      allChains={allChains}
      activeChain={activeChain}
      activeChainId={activeChainId}
      allActiveChainStores={allActiveChainStores}
      activeMarket={activeMarketId}
      storeCounts={availableStoreCounts}
      markets={availableMarkets}
      onMarketChange={setMarket}
      onChainChange={setChain}
      showInactive={showInactive}
      onShowInactiveChange={setShowInactive}
    />
  )
}

// ─── Store List View ──────────────────────────────────────────────────────────

type SortCol = 'name' | 'chain' | 'market' | 'rep' | 'onShelf' | 'inProcess' | 'daysOfSupply' | 'lastVisit'
type StatusFilter = 'all' | 'critical' | 'low' | 'good'

function StoreListView({
  stores,
  allStores,
  allChains,
  activeChain,
  activeChainId,
  allActiveChainStores,
  activeMarket,
  storeCounts,
  markets,
  onMarketChange,
  onChainChange,
  showInactive,
  onShowInactiveChange,
}: {
  stores: DashboardStore[]
  allStores: DashboardStore[]
  allChains: Chain[]
  activeChain: Chain | null
  activeChainId: string | null
  allActiveChainStores: DashboardStore[]
  activeMarket: string
  storeCounts: Record<string, number>
  markets: ApiRegion[]
  onMarketChange: (m: string) => void
  onChainChange: (id: string | null) => void
  showInactive: boolean
  onShowInactiveChange: (v: boolean) => void
}) {
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all')
  const [sort, setSort]                 = useState<{ col: SortCol; dir: 'asc' | 'desc' }>({ col: 'name', dir: 'asc' })
  const [viewMode, setViewMode]         = useState<'list' | 'map'>('list')
  const [loading, setLoading]           = useState(true)
  useEffect(() => { const t = setTimeout(() => setLoading(false), 400); return () => clearTimeout(t) }, [])

  // Store counts per chain scoped to current market filter (for chain chips)
  const chainCounts = useMemo(() => {
    const base = activeMarket === 'all' ? allStores : allStores.filter(s => s.region === activeMarket)
    const map: Record<string, number> = {}
    allChains.forEach(c => { map[c.id] = base.filter(s => s.chainId === c.id).length })
    const indep = base.filter(s => s.chainId === null).length
    if (indep > 0) map['independent'] = indep
    return map
  }, [allStores, allChains, activeMarket])

  const totalCount = activeMarket === 'all'
    ? allStores.length
    : allStores.filter(s => s.region === activeMarket).length

  const hasIndependent = allStores.some(s => s.chainId === null)
  const showChainCol   = !activeChainId

  const filtered = useMemo(() => {
    const rows = statusFilter === 'all' ? stores : stores.filter(s => statusVariant(s.daysOfSupply, s.onShelf) === statusFilter)
    return [...rows].sort((a, b) => {
      let av: string | number = 0, bv: string | number = 0
      switch (sort.col) {
        case 'name':         av = a.name;               bv = b.name;               break
        case 'chain':        av = a.chainName ?? '';    bv = b.chainName ?? '';    break
        case 'market':       av = a.regionName;         bv = b.regionName;         break
        case 'rep':          av = a.rep ?? '';          bv = b.rep ?? '';          break
        case 'onShelf':      av = a.onShelf;            bv = b.onShelf;            break
        case 'inProcess':    av = a.inProcess;          bv = b.inProcess;          break
        case 'daysOfSupply': av = a.daysOfSupply ?? -1; bv = b.daysOfSupply ?? -1; break
        case 'lastVisit':    av = a.lastVisit ?? '';    bv = b.lastVisit ?? '';    break
      }
      if (av < bv) return sort.dir === 'asc' ? -1 : 1
      if (av > bv) return sort.dir === 'asc' ?  1 : -1
      return 0
    })
  }, [stores, statusFilter, sort])

  function toggleSort(col: SortCol) {
    setSort(prev => prev.col === col
      ? { col, dir: prev.dir === 'asc' ? 'desc' : 'asc' }
      : { col, dir: 'asc' })
  }

  // Chain header stats (shown when a specific chain is selected)
  const chainDays  = allActiveChainStores.map(s => s.daysOfSupply).filter((d): d is number => d !== null)
  const chainAvg   = chainDays.length ? Math.round(chainDays.reduce((a, b) => a + b) / chainDays.length) : null
  const chainCrit  = allActiveChainStores.filter(s => s.onShelf <= 3).length
  const chainShelf = allActiveChainStores.reduce((s, r) => s + r.onShelf, 0)

  const STATUS_FILTERS: { value: StatusFilter; label: string }[] = [
    { value: 'all',      label: 'All'      },
    { value: 'critical', label: 'Critical' },
    { value: 'low',      label: 'Low'      },
    { value: 'good',     label: 'Good'     },
  ]

  const sortableHeader = (col: SortCol, label: string, align?: 'right') => (
    <th
      key={col}
      onClick={() => toggleSort(col)}
      className={clsx(
        'px-5 py-3 text-[10px] font-semibold text-gray-400 uppercase tracking-wider cursor-pointer select-none hover:text-gray-600 transition-colors whitespace-nowrap',
        align === 'right' ? 'text-right' : 'text-left'
      )}
    >
      {label}
      <span className={clsx('ml-1', sort.col === col ? 'text-accent' : 'text-gray-300')}>
        {sort.col === col ? (sort.dir === 'asc' ? '↑' : '↓') : '↕'}
      </span>
    </th>
  )

  return (
    <div className="p-4 lg:p-8">

      {/* HEADER */}
      <div className="flex flex-wrap items-start justify-between gap-3 mb-5">
        <div>
          {activeChain && (
            <div className="flex items-center gap-2 mb-1">
              <button
                onClick={() => onChainChange(null)}
                className="text-gray-400 hover:text-accent transition-colors flex items-center gap-1 text-sm"
              >
                <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                  <path d="M9 2L4 7l5 5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
                All Stores
              </button>
              <span className="text-gray-300">/</span>
              <span className="text-gray-700 font-medium text-sm">{activeChain.name}</span>
            </div>
          )}
          <h1 className="text-xl font-semibold text-gray-900 tracking-tight">
            {activeChain ? activeChain.name : 'Stores'}
          </h1>
          <p className="text-sm text-gray-400 mt-0.5">
            {activeChain
              ? `${allActiveChainStores.length} stores`
              : `${allStores.length} stores · ${allChains.length} chains`
            }
          </p>
        </div>
        <div className="flex items-center gap-2">
          {/* Inactive stores stay on record but are hidden by default */}
          <label className="flex items-center gap-1.5 text-xs text-gray-500 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={showInactive}
              onChange={e => onShowInactiveChange(e.target.checked)}
              className="w-3.5 h-3.5 rounded border-gray-300 text-accent focus:ring-accent"
            />
            Show inactive
          </label>
          <Button
            variant="ghost"
            size="sm"
            disabled={loading || filtered.length === 0}
            onClick={() => exportStoresCSV(filtered, activeChain?.name ?? 'stores')}
          >
            Export
          </Button>
        </div>
      </div>

      {/* CHAIN FILTER CHIPS */}
      <div className="flex items-center gap-2 mb-3 overflow-x-auto pb-1 -mx-1 px-1">
        <button
          onClick={() => onChainChange(null)}
          className={clsx(
            'flex-shrink-0 px-3 py-1.5 rounded-full text-xs font-medium transition-all whitespace-nowrap',
            !activeChainId
              ? 'bg-accent text-white shadow-sm'
              : 'bg-white border border-gray-200 text-gray-600 hover:border-accent/40 hover:text-accent'
          )}
        >
          All Chains
          <span className={clsx('ml-1.5 tabular-nums', !activeChainId ? 'text-white/70' : 'text-gray-400')}>
            {totalCount}
          </span>
        </button>
        {allChains.map(c => {
          const count = chainCounts[c.id] ?? 0
          if (count === 0) return null
          return (
            <button
              key={c.id}
              onClick={() => onChainChange(c.id)}
              className={clsx(
                'flex-shrink-0 px-3 py-1.5 rounded-full text-xs font-medium transition-all whitespace-nowrap',
                activeChainId === c.id
                  ? 'bg-accent text-white shadow-sm'
                  : 'bg-white border border-gray-200 text-gray-600 hover:border-accent/40 hover:text-accent'
              )}
            >
              {c.name}
              <span className={clsx('ml-1.5 tabular-nums', activeChainId === c.id ? 'text-white/70' : 'text-gray-400')}>
                {count}
              </span>
            </button>
          )
        })}
        {hasIndependent && (chainCounts['independent'] ?? 0) > 0 && (
          <button
            onClick={() => onChainChange('independent')}
            className={clsx(
              'flex-shrink-0 px-3 py-1.5 rounded-full text-xs font-medium transition-all whitespace-nowrap',
              activeChainId === 'independent'
                ? 'bg-accent text-white shadow-sm'
                : 'bg-white border border-gray-200 text-gray-600 hover:border-accent/40 hover:text-accent'
            )}
          >
            Independent
            <span className={clsx('ml-1.5 tabular-nums', activeChainId === 'independent' ? 'text-white/70' : 'text-gray-400')}>
              {chainCounts['independent']}
            </span>
          </button>
        )}
      </div>

      {/* REGION FILTER */}
      <MarketBar
        active={activeMarket}
        onChange={m => { onMarketChange(m); setStatusFilter('all') }}
        storeCounts={storeCounts}
        markets={markets}
      />

      {/* CHAIN HEADER — shown only when a specific chain is selected */}
      {activeChain && allActiveChainStores.length > 0 && (
        <div className="bg-white border border-gray-200 rounded-xl p-5 mb-5">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 rounded-xl bg-accent-light flex items-center justify-center flex-shrink-0">
              {activeChainId === 'independent' ? (
                <svg width="22" height="22" viewBox="0 0 22 22" fill="none">
                  <path d="M3 11.5L11 4l8 7.5V19a1 1 0 01-1 1H4a1 1 0 01-1-1v-7.5z" stroke="#724fac" strokeWidth="1.5"/>
                  <path d="M8 20v-7h6v7" stroke="#724fac" strokeWidth="1.5"/>
                </svg>
              ) : (
                <span className="text-lg font-bold text-accent">{activeChain.name.charAt(0)}</span>
              )}
            </div>
            <div>
              <h2 className="text-lg font-semibold text-gray-900">{activeChain.name}</h2>
              <p className="text-sm text-gray-400">{allActiveChainStores.length} stores total</p>
            </div>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mt-4 pt-4 border-t border-gray-100">
            <ChainStat label="Bottles On Shelf" value={`${chainShelf}`} />
            <ChainStat
              label="Avg Days Supply"
              value={chainAvg !== null ? `${chainAvg}d` : '—'}
              valueClass={chainAvg === null ? 'text-gray-400' : chainAvg < 7 ? 'text-red-500' : chainAvg < 10 ? 'text-amber-600' : 'text-green-600'}
            />
            <ChainStat
              label="Critical Stores"
              value={`${chainCrit}`}
              valueClass={chainCrit > 0 ? 'text-red-500' : 'text-gray-900'}
            />
            <ChainStat label="Total Stores" value={`${allActiveChainStores.length}`} />
          </div>
        </div>
      )}

      {/* STATUS + VIEW CONTROLS */}
      <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
        <p className="text-xs text-gray-400 px-1">
          Showing <span className="font-medium text-gray-600">{filtered.length}</span> of <span className="font-medium text-gray-600">{stores.length}</span> stores
        </p>
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-0.5 bg-white border border-gray-200 rounded-lg p-0.5">
            <button
              onClick={() => setViewMode('list')}
              className={clsx('px-2.5 py-1 rounded-[6px] transition-all', viewMode === 'list' ? 'bg-accent text-white shadow-sm' : 'text-gray-400 hover:text-gray-700')}
              title="List view"
            >
              <svg width="13" height="13" viewBox="0 0 13 13" fill="none">
                <path d="M1 2.5h11M1 6.5h11M1 10.5h11" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/>
              </svg>
            </button>
            <button
              onClick={() => setViewMode('map')}
              className={clsx('px-2.5 py-1 rounded-[6px] transition-all', viewMode === 'map' ? 'bg-accent text-white shadow-sm' : 'text-gray-400 hover:text-gray-700')}
              title="Map view"
            >
              <svg width="13" height="13" viewBox="0 0 13 13" fill="none">
                <path d="M6.5 1C4.5 1 3 2.6 3 4.5c0 2.7 3.5 7 3.5 7s3.5-4.3 3.5-7C10 2.6 8.5 1 6.5 1z" stroke="currentColor" strokeWidth="1.3"/>
                <circle cx="6.5" cy="4.5" r="1.2" stroke="currentColor" strokeWidth="1.1"/>
              </svg>
            </button>
          </div>
          <div className="flex items-center gap-0.5 bg-white border border-gray-200 rounded-lg p-0.5">
            {STATUS_FILTERS.map(f => {
              const count = f.value !== 'all' ? stores.filter(s => statusVariant(s.daysOfSupply, s.onShelf) === f.value).length : null
              return (
                <button
                  key={f.value}
                  onClick={() => setStatusFilter(f.value)}
                  className={clsx(
                    'px-3 py-1 rounded-[6px] text-xs font-medium transition-all',
                    statusFilter === f.value ? 'bg-accent text-white shadow-sm' : 'text-gray-500 hover:text-gray-800 hover:bg-gray-50'
                  )}
                >
                  {f.label}
                  {count !== null && (
                    <span className={clsx('ml-1.5 tabular-nums', statusFilter === f.value ? 'text-white/70' : 'text-gray-400')}>
                      {count}
                    </span>
                  )}
                </button>
              )
            })}
          </div>
        </div>
      </div>

      {/* MAP VIEW */}
      {viewMode === 'map' && (
        <div className="bg-white border border-gray-200 rounded-xl overflow-hidden mb-4">
          <MarketMap stores={filtered} regionName={activeChain?.name ?? 'All Stores'} />
        </div>
      )}

      {/* TABLE */}
      {viewMode === 'list' && (
        <div className="bg-white border border-gray-200 rounded-xl overflow-x-auto">
          {loading ? (
            <table className="w-full min-w-[800px]">
              <tbody>{Array.from({ length: 6 }).map((_, i) => <SkeletonTableRow key={i} cols={showChainCol ? 10 : 9} />)}</tbody>
            </table>
          ) : filtered.length === 0 ? (
            allStores.length === 0 ? (
              // First run — nothing imported yet, so point at setup instead of filters.
              <div className="py-16 text-center">
                <p className="text-sm font-medium text-gray-500 mb-1">No stores yet</p>
                <p className="text-xs text-gray-400 mb-4 max-w-xs mx-auto">
                  Import your store list to see every account, its shelf level, and who covers it.
                </p>
                <Link
                  to="/admin/stores"
                  className="inline-block px-3 py-1.5 text-xs font-semibold bg-accent text-white rounded-lg hover:bg-accent-hover transition-colors"
                >
                  Import Stores
                </Link>
              </div>
            ) : (
              <div className="py-16 text-center">
                <p className="text-sm font-medium text-gray-500">No stores match your filters</p>
                <button onClick={() => setStatusFilter('all')} className="mt-2 text-xs text-accent hover:underline">
                  Clear filters
                </button>
              </div>
            )
          ) : (
            <table className="w-full min-w-[800px]">
              <thead>
                <tr className="border-b border-gray-100 bg-gray-50/50">
                  <th className="w-1 p-0" />
                  {sortableHeader('name', 'Store')}
                  {showChainCol && sortableHeader('chain', 'Chain')}
                  <th className="px-4 py-3 text-left text-[10px] font-semibold text-gray-400 uppercase tracking-wider">Status</th>
                  {sortableHeader('market', 'Market')}
                  {sortableHeader('rep', 'Rep')}
                  {sortableHeader('onShelf', 'On Shelf', 'right')}
                  {sortableHeader('inProcess', 'In Process', 'right')}
                  {sortableHeader('daysOfSupply', 'Days Supply')}
                  {sortableHeader('lastVisit', 'Last Visit')}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {filtered.map(s => {
                  const isLow   = s.onShelf <= 3
                  const isWarn  = s.onShelf === 4
                  const variant = statusVariant(s.daysOfSupply, s.onShelf)
                  return (
                    <tr key={s.id} className="hover:bg-gray-100 transition-colors group">
                      <td className={clsx(
                        'w-1 p-0',
                        variant === 'critical' ? 'bg-red-400' : variant === 'low' ? 'bg-amber-400' : 'bg-green-400'
                      )} />
                      <td className="px-5 py-3.5">
                        <Link to={`/stores/${s.id}`} className="flex items-start gap-2.5">
                          <div className="w-7 h-7 rounded-lg bg-accent-light flex items-center justify-center flex-shrink-0 mt-0.5">
                            <span className="text-[10px] font-bold text-accent">{s.name.charAt(0)}</span>
                          </div>
                          <div>
                            <div className="flex items-center gap-1.5">
                              <p className="text-sm font-medium text-gray-900 group-hover:text-accent transition-colors leading-tight">
                                {s.name}
                                {s.status === 'inactive' && (
                                  <span className="ml-2 align-middle text-[10px] font-semibold px-1.5 py-0.5 rounded-full bg-gray-100 text-gray-500">
                                    Inactive
                                  </span>
                                )}
                              </p>
                              {s.hasAlert && <span className="w-1.5 h-1.5 rounded-full bg-red-400 flex-shrink-0" title="Active alert" />}
                            </div>
                          </div>
                        </Link>
                      </td>
                      {showChainCol && (
                        <td className="px-5 py-3.5">
                          {s.chainName ? (
                            <button
                              onClick={() => onChainChange(s.chainId!)}
                              className="text-sm text-gray-600 hover:text-accent transition-colors"
                            >
                              {s.chainName}
                            </button>
                          ) : (
                            <span className="text-xs text-gray-400 italic">Independent</span>
                          )}
                        </td>
                      )}
                      <td className="px-4 py-3.5"><StatusPill days={s.daysOfSupply} onShelf={s.onShelf} /></td>
                      <td className="px-5 py-3.5 text-sm text-gray-700">{s.regionName}</td>
                      <td className="px-5 py-3.5 text-sm text-gray-500">{s.rep}</td>
                      <td className="px-5 py-3.5 text-right">
                        <span className={clsx('text-sm font-semibold tabular-nums', isLow ? 'text-red-500' : isWarn ? 'text-amber-600' : 'text-gray-900')}>
                          {s.onShelf}
                        </span>
                      </td>
                      <td className="px-5 py-3.5 text-right">
                        {s.inProcess > 0
                          ? <span className="text-sm font-semibold text-blue-500 tabular-nums">{s.inProcess}</span>
                          : <span className="text-gray-300 text-sm">—</span>}
                      </td>
                      <td className="px-5 py-3.5"><SupplyBar days={s.daysOfSupply} onShelf={s.onShelf} /></td>
                      <td className="px-5 py-3.5">
                        <span className="text-xs text-gray-400">
                          {s.lastVisit ? new Date(s.lastVisit).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : 'Never'}
                        </span>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          )}
        </div>
      )}
    </div>
  )
}

// ─── helpers ──────────────────────────────────────────────────────────────────

function ChainStat({ label, value, valueClass = 'text-gray-900' }: { label: string; value: string; valueClass?: string }) {
  return (
    <div>
      <p className="text-[10px] font-medium text-gray-400 uppercase tracking-wide mb-1">{label}</p>
      <p className={clsx('text-xl font-bold tabular-nums', valueClass)}>{value}</p>
    </div>
  )
}
