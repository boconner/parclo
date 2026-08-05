// src/pages/Dashboard.tsx
import { useState, useMemo } from 'react'
import { Link } from 'react-router-dom'
import { clsx } from 'clsx'
import { Modal } from '@/components/ui/Modal'
import { StatCard } from '@/components/ui/StatCard'
import { Card, CardHeader } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { MarketBar, ChainBar } from '@/components/dashboard/MarketBar'
import { DepletionChart } from '@/components/dashboard/DepletionChart'
import { StoreTable } from '@/components/dashboard/StoreTable'
import { MarketMap } from '@/components/dashboard/MarketMap'
import { AlertsPanel } from '@/components/dashboard/AlertsPanel'
import { ActivityFeed } from '@/components/dashboard/ActivityFeed'
import { LogVisitModal } from '@/components/stores/LogVisitModal'
import type { StoreVisit } from '@/types'
import type { DashboardStore } from '@/types'
import { useDashboard, useRegions, useAlerts, useEvents, useReps, useCreateVisit, useUpdateEvent, useWeeklyDepletion } from '@/hooks/useQueries'
import { useInventory, BOTTLES_PER_CASE } from '@/hooks/useCasesOut'
import { toast } from '@/components/ui/Toast'
import { useUser } from '@clerk/clerk-react'

export default function Dashboard() {
  const { user } = useUser()
  const isAdmin = (user?.publicMetadata as { role?: string })?.role === 'admin'

  const [activeMarket, setActiveMarket]   = useState('all')
  const [activeChain, setActiveChain]     = useState('all')
  const [activeRep, setActiveRep]         = useState('all')
  const [showLogVisit, setShowLogVisit]     = useState(false)
  const [showAllStores, setShowAllStores]   = useState(false)
  const [showFollowUp, setShowFollowUp]     = useState(false)
  const [logStore, setLogStore]             = useState<DashboardStore | null>(null)

  const inv = useInventory()
  const { data: allReps = [] } = useReps()
  const myRep = useMemo(() => allReps.find(r => r.clerkUserId === user?.id), [allReps, user?.id])

  const { data: apiStores }  = useDashboard(activeMarket === 'all' ? undefined : activeMarket)
  const { data: apiMarkets } = useRegions()
  const { data: apiAlerts }  = useAlerts(activeMarket === 'all' ? undefined : { region: activeMarket })
  const { data: upcomingEvents = [] } = useEvents({ status: 'scheduled' })
  const createVisit  = useCreateVisit()
  const updateEvent  = useUpdateEvent()

  const allStores    = apiStores  ?? []
  const markets      = apiMarkets ?? []
  const filteredAlerts = apiAlerts ?? []

  const marketStores = allStores  // already server-filtered by activeMarket

  const chainStores = activeChain === 'all'
    ? marketStores
    : activeChain === 'independent'
    ? marketStores.filter(s => s.chainId === null)
    : marketStores.filter(s => s.chainId === activeChain)

  const filteredStores = activeRep === 'all'
    ? chainStores
    : chainStores.filter(s => s.rep === activeRep)

  const repsInScope = useMemo(() =>
    [...new Set(chainStores.map(s => s.rep))].sort()
  , [chainStores])

  // Real weekly figures, scoped to the selected region. This was previously a
  // hardcoded row of zeros labelled W1–W8, so the chart always rendered empty.
  const { data: weeklyData = [], isLoading: weeklyLoading } = useWeeklyDepletion(
    activeMarket === 'all' ? undefined : { region: activeMarket })

  const totalShelf    = filteredStores.reduce((sum, s) => sum + s.onShelf, 0)
  const totalProcess  = filteredStores.reduce((sum, s) => sum + s.inProcess, 0)
  const daysArr       = filteredStores.map(s => s.daysOfSupply).filter((d): d is number => d !== null)
  const avgDays       = daysArr.length ? Math.round(daysArr.reduce((a, b) => a + b, 0) / daysArr.length) : 0
  const needAttention = filteredStores.filter(s => s.onShelf <= 4).length

  const needFollowUp  = filteredStores.filter(s =>
    !s.lastVisit || Date.now() - new Date(s.lastVisit).getTime() > 10 * 86_400_000
  ).length
  const followUpStores = useMemo(() =>
    filteredStores
      .filter(s => !s.lastVisit || Date.now() - new Date(s.lastVisit).getTime() > 10 * 86_400_000)
      .sort((a, b) => {
        const aDays = a.lastVisit ? Math.floor((Date.now() - new Date(a.lastVisit).getTime()) / 86_400_000) : 9999
        const bDays = b.lastVisit ? Math.floor((Date.now() - new Date(b.lastVisit).getTime()) / 86_400_000) : 9999
        return bDays - aDays
      }),
    [filteredStores]
  )
  const scheduledEvents = upcomingEvents.length

  // Rep-specific derived values
  const myStores = useMemo(() =>
    isAdmin ? [] : allStores.filter(s => myRep && s.repId === myRep.id),
    [allStores, myRep, isAdmin]
  )
  const myStoresSorted = useMemo(() => [...myStores].sort((a, b) => {
    const urgency = (s: DashboardStore) =>
      s.onShelf <= 3 ? 0 :
      s.onShelf <= 6 ? 1 :
      (!s.lastVisit || Date.now() - new Date(s.lastVisit).getTime() > 7 * 86_400_000) ? 2 : 3
    const ua = urgency(a), ub = urgency(b)
    if (ua !== ub) return ua - ub
    const aDos = a.daysOfSupply ?? 999, bDos = b.daysOfSupply ?? 999
    return aDos - bDos
  }), [myStores])
  const myEvents = useMemo(() =>
    upcomingEvents.filter(e => e.reps.some(r => r.id === myRep?.id)),
    [upcomingEvents, myRep]
  )

  const avgDaysColor = avgDays < 7 ? 'text-red-500' : avgDays < 10 ? 'text-amber-500' : 'text-green-500'
  const avgDaysBadge = avgDays < 7
    ? <span className="inline-flex items-center gap-1 bg-red-50 text-red-700 text-[10px] font-semibold px-1.5 py-0.5 rounded-full">↓ Critical</span>
    : avgDays < 10
    ? <span className="inline-flex items-center gap-1 bg-amber-50 text-amber-700 text-[10px] font-semibold px-1.5 py-0.5 rounded-full">⚠ Getting low</span>
    : <span className="inline-flex items-center gap-1 bg-green-50 text-green-700 text-[10px] font-semibold px-1.5 py-0.5 rounded-full">↑ Tracking well</span>

  const storeCounts = markets.reduce((acc, m) => {
    acc[m.slug] = m._count.stores
    return acc
  }, {} as Record<string, number>)

  const activeMarketName  = activeMarket === 'all'
    ? undefined
    : markets.find(m => m.slug === activeMarket)?.name

  return (
    <div className="p-4 lg:p-8">

      {/* PAGE HEADER */}
      <div className="flex flex-wrap items-start justify-between gap-3 mb-5">
        <div>
          <h1 className="text-xl font-semibold text-gray-900 tracking-tight">Dashboard</h1>
          <p className="text-sm text-gray-400 mt-0.5">
            {activeMarket === 'all' ? 'All Regions · Texas' : `${activeMarketName} Region`}
            {' · '}Updated just now
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="sm">Export</Button>
          <Button variant="primary" size="sm" onClick={() => setShowLogVisit(true)}>
            + Log
          </Button>
        </div>
      </div>

      {isAdmin && (
        <>
          {/* MARKET + CHAIN FILTERS */}
          <MarketBar
            active={activeMarket}
            onChange={m => { setActiveMarket(m); setActiveChain('all'); setActiveRep('all') }}
            storeCounts={storeCounts}
            markets={markets}
          />
          <ChainBar
            active={activeChain}
            onChange={c => { setActiveChain(c); setActiveRep('all') }}
            stores={marketStores}
          />

          {/* REP FILTER */}
          {repsInScope.length > 1 && (
            <div className="flex items-center gap-2 mb-4">
              <label className="text-xs text-gray-400 flex-shrink-0">Rep</label>
              <select
                value={activeRep}
                onChange={e => setActiveRep(e.target.value)}
                className={clsx(
                  'text-xs font-medium border rounded-lg px-2.5 py-1.5 outline-none transition-all cursor-pointer',
                  'focus:border-accent focus:ring-2 focus:ring-accent/10',
                  activeRep !== 'all'
                    ? 'border-accent bg-accent-light text-accent'
                    : 'border-gray-200 bg-white text-gray-600'
                )}
              >
                <option value="all">All reps</option>
                {repsInScope.map(rep => (
                  <option key={rep} value={rep}>{rep}</option>
                ))}
              </select>
              {activeRep !== 'all' && (
                <button
                  onClick={() => setActiveRep('all')}
                  className="text-xs text-gray-400 hover:text-gray-600 transition-colors"
                >
                  Clear
                </button>
              )}
            </div>
          )}

          {/* STAT CARDS */}
          <div className="grid grid-cols-2 lg:grid-cols-3 gap-3 lg:gap-3.5 mb-5">
            <StatCard
              label="Bottles On-Shelf"
              value={totalShelf}
              sub={`Across ${filteredStores.length} stores`}
            />
            <StatCard
              label="Avg Days of Supply"
              value={avgDays}
              valueColor={avgDaysColor}
              sub={avgDaysBadge}
            />
            <StatCard
              label="Need Attention"
              value={needAttention}
              valueColor={needAttention > 0 ? 'text-red-500' : 'text-gray-900'}
              sub="4 or fewer bottles on shelf"
            />
            <StatCard
              label="Bottles In Process"
              value={totalProcess}
              valueColor="text-blue-500"
              sub={`${filteredStores.filter(s => s.inProcess > 0).length} open store orders`}
            />
            <StatCard
              label="Need Follow-Up"
              value={needFollowUp}
              valueColor={needFollowUp > 0 ? 'text-amber-600' : 'text-gray-900'}
              sub="Not visited in 10+ days"
              onClick={needFollowUp > 0 ? () => setShowFollowUp(true) : undefined}
            />
            <StatCard
              label="Events Scheduled"
              value={scheduledEvents}
              valueColor="text-accent"
              sub="Upcoming this month"
            />
          </div>

          {/* INVENTORY SNAPSHOT STRIP */}
          {inv.totalCasesMade > 0 && (
            <div className={clsx(
              'flex flex-wrap items-center gap-x-5 gap-y-2 rounded-xl px-5 py-3 mb-5 border',
              inv.reorderAlert
                ? 'bg-red-50 border-red-100'
                : 'bg-white border-gray-200',
            )}>
              {inv.reorderAlert && (
                <span className="text-xs font-semibold text-red-600 flex-shrink-0">
                  ⚠ Reorder now — {inv.warehouseWeeksLeft}w of on-hand supply vs {inv.reorderLeadWeeks}w lead
                </span>
              )}
              <div className="flex flex-wrap items-center gap-x-5 gap-y-1 flex-1 min-w-0">
                <span className="text-xs text-gray-400 whitespace-nowrap">
                  On-Hand <span className="font-semibold text-blue-600 tabular-nums">{inv.onHandCases.toLocaleString()} cs</span>
                </span>
                <span className="w-px h-3 bg-gray-200 hidden sm:block" />
                <span className="text-xs text-gray-400 whitespace-nowrap">
                  Deployed <span className="font-semibold text-gray-800 tabular-nums">{inv.casesDeployed.toLocaleString()} cs</span>
                </span>
                <span className="w-px h-3 bg-gray-200 hidden sm:block" />
                <span className="text-xs text-gray-400 whitespace-nowrap">
                  ~On Shelf <span className="font-semibold text-gray-800 tabular-nums">{(inv.casesOnShelf * BOTTLES_PER_CASE).toLocaleString()} btls</span>
                </span>
                <span className="w-px h-3 bg-gray-200 hidden sm:block" />
                <span className="text-xs text-gray-400 whitespace-nowrap">
                  Off Shelf <span className="font-semibold text-amber-600 tabular-nums">{inv.casesDepleted.toLocaleString()} cs</span>
                </span>
                {inv.depletionRateWeeklyCases > 0 && (
                  <>
                    <span className="w-px h-3 bg-gray-200 hidden sm:block" />
                    <span className="text-xs text-gray-400 whitespace-nowrap">
                      Velocity <span className="font-semibold text-gray-800 tabular-nums">{inv.depletionRateWeeklyCases} cs/wk</span>
                    </span>
                  </>
                )}
              </div>
              <Link to="/inventory" className="text-xs font-medium text-accent hover:underline flex-shrink-0">
                View inventory →
              </Link>
            </div>
          )}

          {/* EMPTY STATE */}
          {filteredStores.length === 0 && (
            <div className="bg-white border border-gray-200 rounded-xl py-16 text-center mb-5">
              <div className="w-12 h-12 bg-accent-light rounded-full flex items-center justify-center mx-auto mb-3">
                <svg width="22" height="22" viewBox="0 0 22 22" fill="none">
                  <path d="M3 11.5L11 4l8 7.5V19a1 1 0 01-1 1H4a1 1 0 01-1-1v-7.5z" stroke="#724fac" strokeWidth="1.5"/>
                  <path d="M8 20v-7h6v7" stroke="#724fac" strokeWidth="1.5"/>
                </svg>
              </div>
              <p className="text-sm font-semibold text-gray-700 mb-1">No stores found</p>
              <p className="text-xs text-gray-400 mb-4">
                {activeChain !== 'all'
                  ? 'No stores for this chain in the selected market.'
                  : 'No stores in this market yet.'}
              </p>
              <div className="flex items-center justify-center gap-2">
                {activeChain !== 'all' && (
                  <button
                    onClick={() => setActiveChain('all')}
                    className="text-xs font-medium text-accent hover:underline"
                  >
                    Clear chain filter
                  </button>
                )}
                {activeMarket !== 'all' && (
                  <button
                    onClick={() => { setActiveMarket('all'); setActiveChain('all') }}
                    className="text-xs font-medium text-accent hover:underline"
                  >
                    View all regions
                  </button>
                )}
              </div>
            </div>
          )}

          {/* DEPLETION CHART */}
          {filteredStores.length > 0 && (
            <Card className="mb-5">
              <DepletionChart regionName={activeMarketName} data={weeklyData} loading={weeklyLoading} />
            </Card>
          )}
        </>
      )}

      {/* ── REP VIEW ────────────────────────────────────────────────────── */}
      {!isAdmin && (
        <div className="mb-5">
          {!myRep ? (
            <div className="bg-amber-50 border border-amber-100 rounded-xl px-5 py-4 text-sm text-amber-700">
              Your account isn't linked to a rep profile yet — contact an admin to set this up.
            </div>
          ) : (
            <>
              {/* Quick stat row */}
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-5">
                <StatCard label="My Stores" value={myStores.length} sub={myRep.regionName} />
                <StatCard
                  label="Need Attention"
                  value={myStores.filter(s => s.onShelf <= 4).length}
                  valueColor={myStores.some(s => s.onShelf <= 4) ? 'text-red-500' : 'text-gray-900'}
                  sub="4 or fewer bottles"
                />
                <StatCard
                  label="Overdue Visits"
                  value={myStores.filter(s => !s.lastVisit || Date.now() - new Date(s.lastVisit).getTime() > 7 * 86_400_000).length}
                  valueColor={myStores.some(s => !s.lastVisit || Date.now() - new Date(s.lastVisit).getTime() > 7 * 86_400_000) ? 'text-amber-600' : 'text-gray-900'}
                  sub="Not visited in 7+ days"
                />
                <StatCard
                  label="My Events"
                  value={myEvents.length}
                  valueColor="text-accent"
                  sub="Upcoming scheduled"
                />
              </div>

              {/* Priority stores — needs attention */}
              {myStoresSorted.filter(s => s.onShelf <= 4 || !s.lastVisit || Date.now() - new Date(s.lastVisit).getTime() > 7 * 86_400_000).length > 0 && (
                <div className="mb-5">
                  <h2 className="text-sm font-semibold text-gray-900 mb-3">Needs Attention</h2>
                  <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-3">
                    {myStoresSorted
                      .filter(s => s.onShelf <= 4 || !s.lastVisit || Date.now() - new Date(s.lastVisit).getTime() > 7 * 86_400_000)
                      .map(store => (
                        <RepStoreCard
                          key={store.id}
                          store={store}
                          onLog={() => { setLogStore(store); setShowLogVisit(true) }}
                        />
                      ))}
                  </div>
                </div>
              )}

              {/* All my stores */}
              <div>
                <h2 className="text-sm font-semibold text-gray-900 mb-3">
                  All My Stores
                  <span className="ml-2 text-xs font-normal text-gray-400">{myStores.length} assigned</span>
                </h2>
                {myStoresSorted.length === 0 ? (
                  <p className="text-sm text-gray-400 bg-white border border-gray-200 rounded-xl px-5 py-8 text-center">
                    No stores assigned to you yet
                  </p>
                ) : (
                  <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-3">
                    {myStoresSorted.map(store => (
                      <RepStoreCard
                        key={store.id}
                        store={store}
                        onLog={() => { setLogStore(store); setShowLogVisit(true) }}
                      />
                    ))}
                  </div>
                )}
              </div>
            </>
          )}
        </div>
      )}

      {/* MAP + STORE TABLE */}
      {(() => {
        const displayStores = isAdmin ? filteredStores : myStores
        return (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 lg:gap-5 mb-5">
            <Card>
              <MarketMap stores={displayStores} regionName={activeMarketName} />
            </Card>
            <Card>
              <CardHeader
                title="Store Inventory"
                subtitle={`${displayStores.length} store${displayStores.length !== 1 ? 's' : ''}`}
                action={
                  <Link to="/stores" className="text-xs font-medium text-accent hover:underline">
                    View all →
                  </Link>
                }
              />
              <StoreTable stores={displayStores} limit={6} onViewAll={() => setShowAllStores(true)} />
            </Card>
          </div>
        )
      })()}

      {/* ALERTS + ACTIVITY */}
      <div className="grid grid-cols-1 lg:grid-cols-[1fr_320px] gap-4 lg:gap-5">
        <Card>
          <AlertsPanel alerts={filteredAlerts} />
        </Card>
        <Card>
          <ActivityFeed />
        </Card>
      </div>

      <Modal
        open={showAllStores}
        onClose={() => setShowAllStores(false)}
        title="Store Inventory"
        subtitle={`${(isAdmin ? filteredStores : myStores).length} stores · ${activeMarket === 'all' ? 'All Markets' : activeMarketName}`}
        width="lg"
      >
        <div className="overflow-y-auto max-h-[60vh]">
          <StoreTable stores={isAdmin ? filteredStores : myStores} />
        </div>
      </Modal>

      {/* Follow-up list modal */}
      <Modal
        open={showFollowUp}
        onClose={() => setShowFollowUp(false)}
        title="Need Follow-Up"
        subtitle={`${followUpStores.length} store${followUpStores.length !== 1 ? 's' : ''} not visited in 10+ days`}
        width="md"
      >
        <div className="overflow-y-auto max-h-[60vh] divide-y divide-gray-100">
          {followUpStores.map(store => {
            const daysSince = store.lastVisit
              ? Math.floor((Date.now() - new Date(store.lastVisit).getTime()) / 86_400_000)
              : null
            return (
              <div key={store.id} className="px-6 py-3.5 flex items-center justify-between gap-4">
                <div className="min-w-0">
                  <Link
                    to={`/stores/${store.id}`}
                    onClick={() => setShowFollowUp(false)}
                    className="text-sm font-medium text-gray-900 hover:text-accent transition-colors truncate block"
                  >
                    {store.name}
                  </Link>
                  <p className="text-xs text-gray-400 truncate">
                    {[store.chainName, store.regionName, store.rep].filter(Boolean).join(' · ')}
                  </p>
                </div>
                <div className="flex items-center gap-3 flex-shrink-0">
                  <span className="text-xs text-amber-600 font-medium whitespace-nowrap">
                    {daysSince === null ? 'Never visited' : `${daysSince}d ago`}
                  </span>
                  <button
                    onClick={() => { setShowFollowUp(false); setLogStore(store); setShowLogVisit(true) }}
                    className="px-3 py-1 text-xs font-medium bg-accent text-white rounded-lg hover:bg-accent/90 transition-colors"
                  >
                    Log
                  </button>
                </div>
              </div>
            )
          })}
        </div>
      </Modal>

      <LogVisitModal
        open={showLogVisit}
        onClose={() => { setShowLogVisit(false); setLogStore(null) }}
        store={logStore ?? undefined}
        stores={logStore ? undefined : allStores}
        onSave={(data) => {
          const store = logStore ?? allStores.find(s => s.id === data.storeId)
          createVisit.mutate(data, {
            onSuccess: () => toast(`Visit logged for ${store?.name ?? 'store'}`),
            onError:   (err: Error) => toast(err.message, 'error'),
          })
        }}
        onCloseEvent={(eventId, data) => {
          updateEvent.mutate(
            { id: eventId, status: 'completed', completionNotes: data.notes,
              hoursWorked: data.hoursWorked, takeaways: data.takeaways, accomplishments: data.accomplishments },
            { onSuccess: () => toast('Private event closed out') },
          )
        }}
      />
    </div>
  )
}

// ─── Rep store card ───────────────────────────────────────────────────────────

function RepStoreCard({ store, onLog }: { store: DashboardStore; onLog: () => void }) {
  const daysSince = store.lastVisit
    ? Math.floor((Date.now() - new Date(store.lastVisit).getTime()) / 86_400_000)
    : null
  const isCritical = store.onShelf <= 3
  const isLow      = store.onShelf <= 6 && !isCritical
  const isOverdue  = daysSince === null || daysSince > 7

  return (
    <div className={clsx(
      'bg-white border rounded-xl px-4 py-3.5 flex items-center justify-between gap-3',
      isCritical ? 'border-red-200' : isLow ? 'border-amber-200' : isOverdue ? 'border-amber-100' : 'border-gray-200',
    )}>
      <div className="min-w-0 flex-1">
        <Link to={`/stores/${store.id}`} className="text-sm font-semibold text-gray-900 hover:text-accent transition-colors truncate block">
          {store.name}
        </Link>
        <p className="text-xs text-gray-400 truncate mt-0.5">
          {[store.chainName, store.regionName].filter(Boolean).join(' · ')}
        </p>
        <div className="flex items-center gap-3 mt-1.5">
          <span className={clsx(
            'text-xs font-semibold tabular-nums',
            isCritical ? 'text-red-500' : isLow ? 'text-amber-600' : 'text-gray-700',
          )}>
            {store.onShelf} btls
          </span>
          {store.daysOfSupply !== null && (
            <span className={clsx(
              'text-xs tabular-nums',
              isCritical ? 'text-red-400' : isLow ? 'text-amber-500' : 'text-gray-400',
            )}>
              ~{store.daysOfSupply}d supply
            </span>
          )}
          <span className={clsx('text-xs', isOverdue ? 'text-amber-500 font-medium' : 'text-gray-400')}>
            {daysSince === null ? 'Never visited' : daysSince === 0 ? 'Visited today' : `${daysSince}d ago`}
          </span>
        </div>
      </div>
      <button
        onClick={onLog}
        className="flex-shrink-0 px-3 py-1.5 text-xs font-medium bg-accent text-white rounded-lg hover:bg-accent/90 transition-colors"
      >
        Log
      </button>
    </div>
  )
}