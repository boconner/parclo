import { useState } from 'react'
import { clsx } from 'clsx'
import { useInventory, BOTTLES_PER_CASE } from '@/hooks/useCasesOut'
import { useQuery } from '@tanstack/react-query'
import { api } from '@/lib/api'

type Action = 'production' | 'deploy' | 'depletions' | 'leadtime' | 'buffer' | null
type DeployMode = 'chain' | 'rep'
type BreakdownView = 'chain' | 'store' | 'rep' | 'market'

export function SellThroughCard() {
  const inv = useInventory()
  const [action, setAction]         = useState<Action>(null)
  const [inputVal, setInputVal]     = useState('')
  const [notesVal, setNotesVal]     = useState('')
  const [marketSlug, setMarketSlug] = useState('')
  const [chainId, setChainId]       = useState('')
  const [repId, setRepId]           = useState('')
  const [deployMode, setDeployMode] = useState<DeployMode>('chain')
  const [breakdown, setBreakdown]   = useState<BreakdownView>('chain')

  const { data: regions = [] } = useQuery({
    queryKey: ['regions'],
    queryFn:  api.getRegions,
    staleTime: 300_000,
  })

  const { data: chains = [] } = useQuery({
    queryKey: ['chains'],
    queryFn:  api.getChains,
    staleTime: 300_000,
  })

  const { data: allReps = [] } = useQuery({
    queryKey: ['reps'],
    queryFn:  () => api.getReps(),
    staleTime: 300_000,
    enabled: action === 'deploy',
  })

  function cancel() { setAction(null); setInputVal(''); setNotesVal(''); setMarketSlug(''); setChainId(''); setRepId('') }

  function handleProduction() {
    const n = parseInt(inputVal, 10)
    if (!isNaN(n) && n > 0) { inv.addProductionRun({ quantity: n, notes: notesVal || undefined }); cancel() }
  }

  function handleDeploy() {
    const n = parseInt(inputVal, 10)
    if (!isNaN(n) && n > 0) {
      inv.addDeployment({
        quantity:   n,
        repId:      deployMode === 'rep'   ? (repId      || undefined) : undefined,
        chainId:    deployMode === 'chain' ? (chainId    || undefined) : undefined,
        marketSlug: deployMode === 'chain' ? (marketSlug || undefined) : undefined,
        notes:      notesVal || undefined,
      })
      cancel()
    }
  }

  function handleDepletions() {
    const n = parseInt(inputVal, 10)
    if (!isNaN(n) && n > 0) {
      inv.addSalesEntry({ quantity: n, notes: notesVal || undefined })
      cancel()
    }
  }

  function handleLeadTime() {
    const n = parseInt(inputVal, 10)
    if (!isNaN(n) && n > 0) { inv.updateSettings({ reorderLeadWeeks: n }); cancel() }
  }

  function handleBuffer() {
    const n = parseInt(inputVal, 10)
    if (!isNaN(n) && n > 0) { inv.updateSettings({ bufferWeeks: n }); cancel() }
  }

  if (inv.isLoading) return null

  // ── Setup state ───────────────────────────────────────────────────────────────
  if (inv.totalCasesMade === 0) {
    return (
      <div className="bg-white border border-gray-200 rounded-xl overflow-hidden mb-5">
        <div className="px-5 py-4 border-b border-gray-100">
          <h2 className="text-sm font-semibold text-gray-900">Inventory Tracker</h2>
          <p className="text-xs text-gray-400 mt-0.5">
            Enter your total production run to start tracking inventory
          </p>
        </div>
        <div className="px-5 py-4 flex flex-wrap items-center gap-3">
          <span className="text-sm text-gray-500">Cases produced</span>
          <input
            type="number" min="1" placeholder="e.g. 1000"
            value={inputVal}
            onChange={e => setInputVal(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && handleProduction()}
            className="w-28 px-3 py-1.5 text-sm border border-gray-200 rounded-lg outline-none focus:border-accent focus:ring-2 focus:ring-accent/10 tabular-nums"
          />
          <button
            onClick={handleProduction}
            disabled={!inputVal || parseInt(inputVal, 10) <= 0 || inv.isPending}
            className="px-3 py-1.5 text-xs font-medium bg-accent text-white rounded-lg hover:bg-accent/90 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
          >
            Start Tracking
          </button>
        </div>
      </div>
    )
  }

  // ── Progress bar segments (% of totalCasesMade) ───────────────────────────────
  const base        = inv.totalCasesMade || 1
  const warehousePct = Math.round((inv.casesInWarehouse / base) * 100)
  const onShelfPct   = Math.round((inv.casesOnShelf     / base) * 100)
  const offShelfPct  = Math.round((inv.casesDepleted    / base) * 100)

  return (
    <div className="bg-white border border-gray-200 rounded-xl overflow-hidden mb-5">

      {/* Header */}
      <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h2 className="text-sm font-semibold text-gray-900">Inventory Tracker</h2>
          <p className="text-xs text-gray-400 mt-0.5">
            {inv.totalCasesMade.toLocaleString()} cases made
            {' · '}
            {action === 'leadtime' ? (
              <span className="inline-flex items-center gap-1.5">
                <span>Lead time</span>
                <input
                  type="number" min="1" autoFocus
                  placeholder={String(inv.reorderLeadWeeks)}
                  value={inputVal}
                  onChange={e => setInputVal(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter') handleLeadTime(); if (e.key === 'Escape') cancel() }}
                  className="w-12 px-1.5 py-0.5 text-xs border border-gray-300 rounded outline-none focus:border-accent tabular-nums"
                />
                <span>wks</span>
                <button onClick={handleLeadTime} className="text-accent text-xs font-medium hover:underline">Save</button>
                <button onClick={cancel} className="text-gray-400 hover:text-gray-600 text-xs">✕</button>
              </span>
            ) : action === 'buffer' ? (
              <span className="inline-flex items-center gap-1.5">
                <span>Buffer</span>
                <input
                  type="number" min="1" autoFocus
                  placeholder={String(inv.bufferWeeks)}
                  value={inputVal}
                  onChange={e => setInputVal(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter') handleBuffer(); if (e.key === 'Escape') cancel() }}
                  className="w-12 px-1.5 py-0.5 text-xs border border-gray-300 rounded outline-none focus:border-accent tabular-nums"
                />
                <span>wks</span>
                <button onClick={handleBuffer} className="text-accent text-xs font-medium hover:underline">Save</button>
                <button onClick={cancel} className="text-gray-400 hover:text-gray-600 text-xs">✕</button>
              </span>
            ) : (
              <>
                <button
                  onClick={() => { setAction('leadtime'); setInputVal(String(inv.reorderLeadWeeks)) }}
                  className="hover:text-accent transition-colors"
                >
                  {inv.reorderLeadWeeks}wk lead
                </button>
                {' · '}
                <button
                  onClick={() => { setAction('buffer'); setInputVal(String(inv.bufferWeeks)) }}
                  className="hover:text-accent transition-colors"
                >
                  {inv.bufferWeeks}wk buffer ✎
                </button>
              </>
            )}
          </p>
        </div>

        {/* Action buttons */}
        {action === 'production' ? (
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs text-gray-400 flex-shrink-0">Cases received</span>
            <input
              type="number" min="1" autoFocus placeholder="0"
              value={inputVal}
              onChange={e => setInputVal(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') handleProduction(); if (e.key === 'Escape') cancel() }}
              className="w-20 px-2.5 py-1 text-sm border border-gray-200 rounded-lg outline-none focus:border-accent focus:ring-2 focus:ring-accent/10 tabular-nums"
            />
            <input
              type="text" placeholder="Notes (optional)"
              value={notesVal}
              onChange={e => setNotesVal(e.target.value)}
              className="w-36 px-2.5 py-1 text-xs border border-gray-200 rounded-lg outline-none focus:border-accent text-gray-600 placeholder-gray-300"
            />
            <button
              onClick={handleProduction}
              disabled={!inputVal || parseInt(inputVal, 10) <= 0 || inv.isPending}
              className="px-2.5 py-1 text-xs font-medium bg-accent text-white rounded-lg hover:bg-accent/90 disabled:opacity-40 transition-colors"
            >Add</button>
            <button onClick={cancel} className="px-2.5 py-1 text-xs text-gray-400 hover:text-gray-600 transition-colors">Cancel</button>
          </div>
        ) : action === 'deploy' ? (
          <div className="flex flex-col gap-2 w-full">
            {/* Mode toggle */}
            <div className="flex items-center gap-2 flex-wrap">
              <div className="flex items-center gap-0.5 bg-gray-100 rounded-lg p-0.5">
                <button
                  onClick={() => { setDeployMode('chain'); setRepId('') }}
                  className={clsx('px-2.5 py-1 rounded-md text-[10px] font-semibold transition-all',
                    deployMode === 'chain' ? 'bg-white text-gray-800 shadow-sm' : 'text-gray-400 hover:text-gray-600')}
                >To Chain</button>
                <button
                  onClick={() => { setDeployMode('rep'); setChainId(''); setMarketSlug('') }}
                  className={clsx('px-2.5 py-1 rounded-md text-[10px] font-semibold transition-all',
                    deployMode === 'rep' ? 'bg-white text-gray-800 shadow-sm' : 'text-gray-400 hover:text-gray-600')}
                >To Rep</button>
              </div>
              <span className="text-[10px] text-gray-400">
                {deployMode === 'chain'
                  ? 'Bulk shipment — chain distributes to their stores internally'
                  : 'Cases given to a rep to carry and deliver to stores'}
              </span>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-xs text-gray-400 flex-shrink-0">Cases</span>
              <input
                type="number" min="1" max={inv.casesInWarehouse}
                autoFocus placeholder="0"
                value={inputVal}
                onChange={e => setInputVal(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') handleDeploy(); if (e.key === 'Escape') cancel() }}
                className="w-20 px-2.5 py-1 text-sm border border-gray-200 rounded-lg outline-none focus:border-accent focus:ring-2 focus:ring-accent/10 tabular-nums"
              />
              {deployMode === 'chain' && (
                <>
                  {chains.length > 0 && (
                    <select value={chainId} onChange={e => setChainId(e.target.value)}
                      className="px-2.5 py-1 text-xs border border-gray-200 rounded-lg outline-none focus:border-accent bg-white">
                      <option value="">All chains</option>
                      {chains.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                    </select>
                  )}
                  {regions.length > 0 && (
                    <select value={marketSlug} onChange={e => setMarketSlug(e.target.value)}
                      className="px-2.5 py-1 text-xs border border-gray-200 rounded-lg outline-none focus:border-accent bg-white">
                      <option value="">All markets</option>
                      {regions.map(r => <option key={r.slug} value={r.slug}>{r.name}</option>)}
                    </select>
                  )}
                </>
              )}
              {deployMode === 'rep' && (
                <select value={repId} onChange={e => setRepId(e.target.value)}
                  className="px-2.5 py-1 text-xs border border-gray-200 rounded-lg outline-none focus:border-accent bg-white max-w-[200px]">
                  <option value="">Select rep…</option>
                  {allReps
                    .slice()
                    .sort((a, b) => a.name.localeCompare(b.name))
                    .map(r => <option key={r.id} value={r.id}>{r.name}</option>)}
                </select>
              )}
              <input
                type="text" placeholder="Notes (optional)"
                value={notesVal}
                onChange={e => setNotesVal(e.target.value)}
                className="w-36 px-2.5 py-1 text-xs border border-gray-200 rounded-lg outline-none focus:border-accent text-gray-600 placeholder-gray-300"
              />
              <button
                onClick={handleDeploy}
                disabled={!inputVal || parseInt(inputVal, 10) <= 0 || parseInt(inputVal, 10) > inv.casesInWarehouse || inv.isPending || (deployMode === 'rep' && !repId)}
                className="px-2.5 py-1 text-xs font-medium bg-accent text-white rounded-lg hover:bg-accent/90 disabled:opacity-40 transition-colors"
              >Deploy</button>
              <button onClick={cancel} className="px-2.5 py-1 text-xs text-gray-400 hover:text-gray-600 transition-colors">Cancel</button>
            </div>
          </div>
        ) : action === 'depletions' ? (
          <div className="flex flex-col gap-1.5 w-full">
            <p className="text-[10px] text-gray-400">Enter cases sold from your distributor depletion report</p>
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-xs text-gray-400 flex-shrink-0">Cases</span>
              <input
                type="number" min="1" autoFocus placeholder="0"
                value={inputVal}
                onChange={e => setInputVal(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') handleDepletions(); if (e.key === 'Escape') cancel() }}
                className="w-20 px-2.5 py-1 text-sm border border-gray-200 rounded-lg outline-none focus:border-accent focus:ring-2 focus:ring-accent/10 tabular-nums"
              />
              <input
                type="text" placeholder="Notes — e.g. May depletion report"
                value={notesVal}
                onChange={e => setNotesVal(e.target.value)}
                className="w-52 px-2.5 py-1 text-xs border border-gray-200 rounded-lg outline-none focus:border-accent text-gray-600 placeholder-gray-300"
              />
              <button
                onClick={handleDepletions}
                disabled={!inputVal || parseInt(inputVal, 10) <= 0 || inv.isPending}
                className="px-2.5 py-1 text-xs font-medium bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-40 transition-colors"
              >Log</button>
              <button onClick={cancel} className="px-2.5 py-1 text-xs text-gray-400 hover:text-gray-600 transition-colors">Cancel</button>
            </div>
          </div>
        ) : (
          <div className="flex items-center gap-2 flex-wrap">
            <button
              onClick={() => setAction('production')}
              className="px-2.5 py-1.5 text-xs font-medium text-gray-600 border border-gray-200 hover:border-gray-300 rounded-lg transition-colors"
            >+ Production Run</button>
            <button
              onClick={() => setAction('deploy')}
              disabled={inv.casesInWarehouse === 0}
              className="px-2.5 py-1.5 text-xs font-medium text-gray-600 border border-gray-200 hover:border-gray-300 rounded-lg disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            >Deploy to Field</button>
            <button
              onClick={() => setAction('depletions')}
              disabled={inv.casesDeployed === 0}
              className="px-2.5 py-1.5 text-xs font-medium bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            >Log Depletions</button>
          </div>
        )}
      </div>

      {/* Body */}
      <div className="px-5 py-4">

        {/* Three-segment progress bar */}
        <div className="flex h-2.5 rounded-full overflow-hidden bg-gray-100 mb-3">
          {warehousePct > 0 && (
            <div className="bg-gray-300 h-full transition-all duration-500" style={{ width: `${warehousePct}%` }} />
          )}
          {onShelfPct > 0 && (
            <div className="bg-accent h-full transition-all duration-500" style={{ width: `${onShelfPct}%` }} />
          )}
          {offShelfPct > 0 && (
            <div className="bg-amber-400 h-full transition-all duration-500" style={{ width: `${offShelfPct}%` }} />
          )}
        </div>

        {/* Legend */}
        <div className="flex items-center gap-4 mb-5 text-[10px] text-gray-400">
          <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-gray-300 flex-shrink-0" />Warehouse</span>
          <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-accent flex-shrink-0" />On Shelf</span>
          <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-amber-400 flex-shrink-0" />Off Shelf</span>
        </div>

        {/* Six global stats — bottles primary, cases secondary */}
        <div className="grid grid-cols-2 lg:grid-cols-6 gap-4 mb-4">
          <div>
            <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide mb-1">Warehouse</p>
            <p className="text-xl font-bold text-gray-900 tabular-nums">{(inv.casesInWarehouse * BOTTLES_PER_CASE).toLocaleString()}</p>
            <p className="text-[10px] text-gray-400 mt-0.5">bottles</p>
            <p className="text-[10px] text-gray-400">{inv.casesInWarehouse.toLocaleString()} cases</p>
          </div>
          <div>
            <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide mb-1">Deployed</p>
            <p className="text-xl font-bold text-gray-900 tabular-nums">{inv.bottlesDeployed.toLocaleString()}</p>
            <p className="text-[10px] text-gray-400 mt-0.5">bottles to field</p>
            <p className="text-[10px] text-gray-400">{inv.casesDeployed.toLocaleString()} cases</p>
          </div>
          <div>
            <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide mb-1">On Shelf</p>
            <p className="text-xl font-bold text-gray-900 tabular-nums">~{inv.bottlesOnShelf.toLocaleString()}</p>
            <p className="text-[10px] text-gray-400 mt-0.5">bottles at stores</p>
            <p className="text-[10px] text-gray-400">~{inv.casesOnShelf.toLocaleString()} cases</p>
          </div>
          <div>
            <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide mb-1">Off Shelf</p>
            <p className="text-xl font-bold text-amber-500 tabular-nums">{inv.bottlesDepleted.toLocaleString()}</p>
            <p className="text-[10px] text-gray-400 mt-0.5">bottles not at stores</p>
            <p className="text-[10px] text-gray-400">{inv.casesDepleted.toLocaleString()} cases</p>
          </div>
          <div>
            <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide mb-1">Event Sales</p>
            <p className={clsx('text-xl font-bold tabular-nums',
              inv.eventSalesBottles > 0 ? 'text-purple-600' : 'text-gray-400'
            )}>
              {inv.eventSalesBottles > 0 ? inv.eventSalesBottles.toLocaleString() : '—'}
            </p>
            <p className="text-[10px] text-gray-400 mt-0.5">
              {inv.eventSalesBottles > 0 ? 'bottles at tastings/events' : 'from tastings & events'}
            </p>
            <p className="text-[10px] text-gray-400">{inv.eventSalesBottles > 0 ? `${inv.eventSalesCases} cases` : ''}</p>
          </div>
          <div>
            <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide mb-1">Depletions</p>
            <p className={clsx('text-xl font-bold tabular-nums',
              inv.sellThroughPct >= 80 ? 'text-green-600' : inv.sellThroughPct >= 50 ? 'text-green-500' : inv.casesSold > 0 ? 'text-green-600' : 'text-gray-400'
            )}>
              {inv.casesSold > 0 ? inv.bottlesSold.toLocaleString() : '—'}
            </p>
            <p className="text-[10px] text-gray-400 mt-0.5">
              {inv.casesSold > 0 ? `bottles · ${inv.sellThroughPct}% of deployed` : 'from distributor report'}
            </p>
            <p className="text-[10px] text-gray-400">{inv.casesSold > 0 ? `${inv.casesSold.toLocaleString()} cases` : ''}</p>
          </div>
        </div>

        {/* Rate + projection footer */}
        {inv.depletionRateWeeklyCases > 0 && (
          <div className={clsx(
            'rounded-lg px-4 py-2.5 text-xs flex flex-wrap items-center gap-x-5 gap-y-1 mb-4',
            inv.reorderAlert ? 'bg-red-50 border border-red-100' : 'bg-gray-50'
          )}>
            {inv.reorderAlert ? (
              <>
                <span className="font-semibold text-red-600">
                  ⚠ Reorder now — {inv.warehouseWeeksLeft} weeks of supply left, lead time is {inv.reorderLeadWeeks} weeks
                </span>
                {inv.recommendedOrderCases && (
                  <span className="text-red-500">
                    Order <span className="font-semibold">{inv.recommendedOrderCases.toLocaleString()} cases</span> to cover lead + {inv.bufferWeeks}wk buffer
                  </span>
                )}
              </>
            ) : (
              <>
                <span className="text-gray-500">
                  Depletion: <span className="font-semibold text-gray-800">{inv.depletionRateWeeklyCases} cases/week</span>
                </span>
                {inv.warehouseWeeksLeft !== null && (
                  <span className="text-gray-500">
                    Warehouse lasts <span className="font-semibold text-gray-800">~{inv.warehouseWeeksLeft} weeks</span>
                  </span>
                )}
                {inv.reorderDate && (
                  <span className="text-gray-500">
                    Reorder by <span className="font-semibold text-gray-800">{inv.reorderDate}</span>
                  </span>
                )}
                {inv.recommendedOrderCases && (
                  <span className="text-gray-500">
                    Suggested qty: <span className="font-semibold text-gray-800">{inv.recommendedOrderCases.toLocaleString()} cases</span>
                  </span>
                )}
              </>
            )}
          </div>
        )}

        {/* Breakdown toggle */}
        {inv.casesDeployed > 0 && (inv.chains.length > 0 || inv.repDeliveries.length > 0 || inv.storeDeliveries.length > 0 || inv.markets.length > 0) && (
          <div>
            <div className="flex items-center justify-between mb-2">
              <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide">Breakdown</p>
              <div className="flex items-center gap-0.5 bg-gray-100 rounded-md p-0.5">
                {inv.chains.length > 0 && (
                  <button onClick={() => setBreakdown('chain')}
                    className={clsx('px-2 py-0.5 rounded text-[10px] font-semibold transition-all',
                      breakdown === 'chain' ? 'bg-white text-gray-800 shadow-sm' : 'text-gray-400 hover:text-gray-600')}>
                    By Chain
                  </button>
                )}
                {inv.repDeliveries.length > 0 && (
                  <button onClick={() => setBreakdown('rep')}
                    className={clsx('px-2 py-0.5 rounded text-[10px] font-semibold transition-all',
                      breakdown === 'rep' ? 'bg-white text-gray-800 shadow-sm' : 'text-gray-400 hover:text-gray-600')}>
                    By Rep
                  </button>
                )}
                {inv.storeDeliveries.length > 0 && (
                  <button onClick={() => setBreakdown('store')}
                    className={clsx('px-2 py-0.5 rounded text-[10px] font-semibold transition-all',
                      breakdown === 'store' ? 'bg-white text-gray-800 shadow-sm' : 'text-gray-400 hover:text-gray-600')}>
                    By Store
                  </button>
                )}
                {inv.markets.length > 0 && (
                  <button onClick={() => setBreakdown('market')}
                    className={clsx('px-2 py-0.5 rounded text-[10px] font-semibold transition-all',
                      breakdown === 'market' ? 'bg-white text-gray-800 shadow-sm' : 'text-gray-400 hover:text-gray-600')}>
                    By Market
                  </button>
                )}
              </div>
            </div>

            {breakdown === 'chain' && inv.chains.length > 0 && (
              <div className="divide-y divide-gray-100">
                {inv.chains.map(c => (
                  <div key={c.chainId} className="py-2 grid grid-cols-4 gap-2 text-xs">
                    <div className="font-medium text-gray-700 truncate">{c.chainName}</div>
                    <div className="text-gray-500 tabular-nums">
                      <span className="text-gray-400">deployed </span>{c.casesDeployed.toLocaleString()} cs
                    </div>
                    <div className="text-gray-500 tabular-nums">
                      <span className="text-gray-400">on shelf </span>~{c.casesOnShelf.toLocaleString()} cs
                    </div>
                    <div className={clsx('tabular-nums font-medium',
                      c.offShelfPct >= 80 ? 'text-amber-600' : c.offShelfPct >= 50 ? 'text-amber-500' : 'text-gray-600'
                    )}>
                      {c.casesOffShelf} cs off shelf
                      <span className="text-gray-400 font-normal ml-1">({c.offShelfPct}%)</span>
                    </div>
                  </div>
                ))}
                {/* unallocated row if some deployments have no chain */}
                {(() => {
                  const allocatedCases = inv.chains.reduce((s, c) => s + c.casesDeployed, 0)
                  const unallocated = inv.casesDeployed - allocatedCases
                  if (unallocated <= 0) return null
                  return (
                    <div className="py-2 grid grid-cols-4 gap-2 text-xs">
                      <div className="font-medium text-gray-400 truncate italic">Unallocated</div>
                      <div className="text-gray-400 tabular-nums">{unallocated.toLocaleString()} cs</div>
                      <div className="text-gray-300 tabular-nums">—</div>
                      <div className="text-gray-300">no chain assigned</div>
                    </div>
                  )
                })()}
              </div>
            )}

            {breakdown === 'rep' && inv.repDeliveries.length > 0 && (
              <div className="divide-y divide-gray-100">
                {inv.repDeliveries.map(r => (
                  <div key={r.repId} className="py-2 grid grid-cols-4 gap-2 text-xs">
                    <div className="font-medium text-gray-700 truncate">{r.repName}</div>
                    <div className="text-gray-500 tabular-nums">
                      <span className="text-gray-400">given </span>{(r.casesDeployed * BOTTLES_PER_CASE).toLocaleString()} btls
                      <span className="text-gray-400 ml-1">({r.casesDeployed} cs)</span>
                    </div>
                    <div className="text-gray-500 tabular-nums">
                      <span className="text-gray-400">on shelf </span>~{(r.casesOnShelf * BOTTLES_PER_CASE).toLocaleString()} btls
                    </div>
                    <div className={clsx('tabular-nums font-medium',
                      r.offShelfPct >= 80 ? 'text-amber-600' : r.offShelfPct >= 50 ? 'text-amber-500' : 'text-gray-600'
                    )}>
                      {(r.casesOffShelf * BOTTLES_PER_CASE).toLocaleString()} btls off shelf
                      <span className="text-gray-400 font-normal ml-1">({r.offShelfPct}%)</span>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {breakdown === 'store' && inv.storeDeliveries.length > 0 && (
              <div className="divide-y divide-gray-100">
                {inv.storeDeliveries.map(s => (
                  <div key={s.storeId} className="py-2 grid grid-cols-4 gap-2 text-xs">
                    <div className="font-medium text-gray-700 truncate">{s.storeName}</div>
                    <div className="text-gray-500 tabular-nums">
                      <span className="text-gray-400">delivered </span>{s.casesDeployed.toLocaleString()} cs
                    </div>
                    <div className="text-gray-500 tabular-nums">
                      <span className="text-gray-400">on shelf </span>~{s.casesOnShelf.toLocaleString()} cs
                    </div>
                    <div className={clsx('tabular-nums font-medium',
                      s.offShelfPct >= 80 ? 'text-amber-600' : s.offShelfPct >= 50 ? 'text-amber-500' : 'text-gray-600'
                    )}>
                      {s.casesOffShelf} cs off shelf
                      <span className="text-gray-400 font-normal ml-1">({s.offShelfPct}%)</span>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {breakdown === 'market' && inv.markets.length > 0 && (
              <div className="divide-y divide-gray-100">
                {inv.markets.map(m => (
                  <div key={m.slug} className="py-2 grid grid-cols-4 gap-2 text-xs">
                    <div className="font-medium text-gray-700 truncate">{m.name}</div>
                    <div className="text-gray-500 tabular-nums">
                      <span className="text-gray-400">deployed </span>{m.casesDeployed.toLocaleString()} cs
                    </div>
                    <div className="text-gray-500 tabular-nums">
                      <span className="text-gray-400">on shelf </span>~{Math.round(m.bottlesOnShelf / BOTTLES_PER_CASE).toLocaleString()} cs
                    </div>
                    <div className={clsx('tabular-nums font-medium',
                      m.sellThroughPct >= 80 ? 'text-amber-600' : m.sellThroughPct >= 50 ? 'text-amber-500' : 'text-gray-600'
                    )}>
                      {m.sellThroughPct}% off shelf
                      {m.depletionRateWeeklyCases > 0 && (
                        <span className="text-gray-400 font-normal ml-1">· {m.depletionRateWeeklyCases} cs/wk</span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

      </div>
    </div>
  )
}
