import { useState } from 'react'
import { clsx } from 'clsx'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api, type StaleAlertsReport } from '@/lib/api'
import { useInventory, BOTTLES_PER_CASE } from '@/hooks/useCasesOut'

// ─── local types ──────────────────────────────────────────────────────────────

type Action      = 'production' | 'transfer' | 'deploy' | null
type DeployMode  = 'chain' | 'rep' | 'store'
type Breakdown   = 'chain' | 'rep' | 'store' | 'market'
type EditEntry   = { type: 'run' | 'transfer' | 'deploy' | 'depletion'; id: string; quantity: string; notes: string; date: string }
type ConfirmDel  = { type: 'run' | 'transfer' | 'deploy' | 'depletion' | 'reset'; id?: string }

// ─── page ────────────────────────────────────────────────────────────────────

export default function Inventory() {
  const inv = useInventory()
  const qc  = useQueryClient()

  // action form state
  const [action,     setAction]     = useState<Action>(null)
  const [inputVal,   setInputVal]   = useState('')
  const [notesVal,   setNotesVal]   = useState('')
  const [chainId,    setChainId]    = useState('')
  const [marketSlug, setMarketSlug] = useState('')
  const [storeId,    setStoreId]    = useState('')
  const [repId,      setRepId]      = useState('')
  const [deployMode, setDeployMode] = useState<DeployMode>('chain')
  const [breakdown,  setBreakdown]  = useState<Breakdown>('chain')

  // settings inline edit
  const [leadEdit,   setLeadEdit]   = useState<string | null>(null)
  const [bufferEdit, setBufferEdit] = useState<string | null>(null)

  // table edit/delete
  const [editing,       setEditing]       = useState<EditEntry | null>(null)
  const [confirmDelete, setConfirmDelete] = useState<ConfirmDel | null>(null)

  // Danger zone stays collapsed by default so the full-reset control can't be
  // clicked by accident.
  const [showDanger,    setShowDanger]    = useState(false)

  // ── data ────────────────────────────────────────────────────────────────────

  const { data: invLog }    = useQuery({ queryKey: ['inventory-log'], queryFn: api.getInventoryLog })
  const { data: regions = [] } = useQuery({ queryKey: ['regions'], queryFn: api.getRegions, staleTime: 300_000 })
  const { data: chains  = [] } = useQuery({ queryKey: ['chains'],  queryFn: api.getChains,  staleTime: 300_000 })
  const { data: allReps = [] } = useQuery({ queryKey: ['reps'],    queryFn: () => api.getReps(), staleTime: 300_000 })
  const { data: allStores = [] } = useQuery({
    queryKey: ['stores'],
    queryFn:  () => api.getStores(),
    staleTime: 300_000,
    enabled:  action === 'deploy' && deployMode === 'store',
  })

  // ── mutations ────────────────────────────────────────────────────────────────

  function invalidateBoth() {
    qc.invalidateQueries({ queryKey: ['inventory'] })
    qc.invalidateQueries({ queryKey: ['inventory-log'] })
  }

  const addRun      = useMutation({ mutationFn: api.addProductionRun,        onSuccess: invalidateBoth })
  const addTransfer = useMutation({ mutationFn: api.addWarehouseTransfer,   onSuccess: invalidateBoth })
  const addDeploy   = useMutation({ mutationFn: api.addDeployment,          onSuccess: invalidateBoth })
  // addDeplet hidden — depletions feature not in use
  // const addDeplet = useMutation({ mutationFn: api.addSalesEntry, onSuccess: invalidateBoth })
  const patchSet  = useMutation({ mutationFn: api.updateInventorySettings, onSuccess: () => qc.invalidateQueries({ queryKey: ['inventory'] }) })
  const resetAll  = useMutation({ mutationFn: api.resetInventory,         onSuccess: () => { invalidateBoth(); setConfirmDelete(null) } })

  const patchRun      = useMutation({ mutationFn: ({ id, body }: { id: string; body: Parameters<typeof api.patchProductionRun>[1] })      => api.patchProductionRun(id, body),      onSuccess: () => { invalidateBoth(); setEditing(null) } })
  const patchTransfer = useMutation({ mutationFn: ({ id, body }: { id: string; body: Parameters<typeof api.patchWarehouseTransfer>[1] }) => api.patchWarehouseTransfer(id, body), onSuccess: () => { invalidateBoth(); setEditing(null) } })
  const patchDeploy   = useMutation({ mutationFn: ({ id, body }: { id: string; body: Parameters<typeof api.patchDeployment>[1] })         => api.patchDeployment(id, body),         onSuccess: () => { invalidateBoth(); setEditing(null) } })
  // patchDeplet / deleteDeplet hidden — depletions feature not in use

  const deleteRun      = useMutation({ mutationFn: api.deleteProductionRun,      onSuccess: () => { invalidateBoth(); setConfirmDelete(null) } })
  const deleteTransfer = useMutation({ mutationFn: api.deleteWarehouseTransfer, onSuccess: () => { invalidateBoth(); setConfirmDelete(null) } })
  const deleteDeploy   = useMutation({ mutationFn: api.deleteDeployment,        onSuccess: () => { invalidateBoth(); setConfirmDelete(null) } })

  const anyPending = addRun.isPending || addTransfer.isPending || addDeploy.isPending

  // ── handlers ─────────────────────────────────────────────────────────────────

  function cancelAction() { setAction(null); setInputVal(''); setNotesVal(''); setChainId(''); setMarketSlug(''); setStoreId(''); setRepId('') }

  function submitRun() {
    const n = parseInt(inputVal, 10)
    if (n > 0) { addRun.mutate({ quantity: n, notes: notesVal || undefined }); cancelAction() }
  }

  function submitTransfer() {
    const n = parseInt(inputVal, 10)
    if (n > 0 && n <= inv.casesInWarehouse) { addTransfer.mutate({ quantity: n, notes: notesVal || undefined }); cancelAction() }
  }

  function submitDeploy() {
    const n = parseInt(inputVal, 10)
    if (n > 0 && n <= inv.onHandCases) {
      addDeploy.mutate({
        quantity:   n,
        chainId:    deployMode === 'chain' ? chainId    || undefined : undefined,
        marketSlug: deployMode === 'chain' ? marketSlug || undefined : undefined,
        repId:      deployMode === 'rep'   ? repId      || undefined : undefined,
        storeId:    deployMode === 'store' ? storeId    || undefined : undefined,
        notes:      notesVal || undefined,
      })
      cancelAction()
    }
  }

  function saveEdit() {
    if (!editing) return
    const qty = parseInt(editing.quantity, 10)
    if (isNaN(qty) || qty < 1) return
    const body = {
      quantity: qty,
      notes: editing.notes || undefined,
      ...(editing.date ? (
        editing.type === 'run'      ? { receivedAt:    editing.date } :
        editing.type === 'transfer' ? { transferredAt: editing.date } :
        editing.type === 'deploy'   ? { deployedAt:    editing.date } :
                                      { soldAt:        editing.date }
      ) : {}),
    }
    if (editing.type === 'run')      patchRun.mutate({ id: editing.id, body })
    if (editing.type === 'transfer') patchTransfer.mutate({ id: editing.id, body })
    if (editing.type === 'deploy')   patchDeploy.mutate({ id: editing.id, body })
  }

  // ── derived ──────────────────────────────────────────────────────────────────

  const base         = inv.totalCasesMade || 1
  const warehousePct = Math.round((inv.casesInWarehouse / base) * 100)
  const onHandPct    = Math.round((inv.onHandCases      / base) * 100)
  const onShelfPct   = Math.round((inv.casesOnShelf     / base) * 100)
  const offShelfPct  = Math.round((inv.casesDepleted    / base) * 100)

  const hasData        = inv.totalCasesMade > 0
  const hasOnHand      = inv.totalTransferred > 0

  // Unallocated: cases with no chain, rep, or store
  const allocatedCases =
    inv.chains.reduce((s, c) => s + c.casesDeployed, 0) +
    inv.repDeliveries.reduce((s, r) => s + r.casesDeployed, 0) +
    inv.storeDeliveries.reduce((s, s2) => s + s2.casesDeployed, 0)
  // chain/rep/store can overlap (e.g. store delivery also has chainId), so clamp
  const unallocated = Math.max(0, inv.casesDeployed - allocatedCases)

  if (inv.isLoading) return <div className="p-8 text-sm text-gray-400">Loading…</div>

  return (
    <div className="p-4 lg:p-8">

      {/* ── HEADER ─────────────────────────────────────────────────────────── */}
      <div className="flex flex-wrap items-start justify-between gap-3 mb-5">
        <div>
          <h1 className="text-xl font-semibold text-gray-900 tracking-tight">Inventory</h1>
          <p className="text-xs text-gray-400 mt-0.5">
            {hasData ? (
              <>
                {inv.totalCasesMade.toLocaleString()} cases made
                {' · '}
                {/* Lead time inline edit */}
                {leadEdit !== null ? (
                  <span className="inline-flex items-center gap-1">
                    Lead time
                    <input type="number" min="1" autoFocus value={leadEdit}
                      onChange={e => setLeadEdit(e.target.value)}
                      onKeyDown={e => {
                        if (e.key === 'Enter') { const n = parseInt(leadEdit, 10); if (n > 0) { patchSet.mutate({ reorderLeadWeeks: n }); setLeadEdit(null) } }
                        if (e.key === 'Escape') setLeadEdit(null)
                      }}
                      className="w-10 px-1 py-0.5 text-xs border border-accent rounded outline-none tabular-nums"
                    />
                    wks
                    <button onClick={() => { const n = parseInt(leadEdit, 10); if (n > 0) { patchSet.mutate({ reorderLeadWeeks: n }); setLeadEdit(null) } }} className="text-accent text-xs hover:underline">Save</button>
                    <button onClick={() => setLeadEdit(null)} className="text-gray-400 text-xs">✕</button>
                  </span>
                ) : (
                  <button onClick={() => setLeadEdit(String(inv.reorderLeadWeeks))} className="hover:text-accent transition-colors">
                    {inv.reorderLeadWeeks}wk lead
                  </button>
                )}
                {' · '}
                {bufferEdit !== null ? (
                  <span className="inline-flex items-center gap-1">
                    Buffer
                    <input type="number" min="1" autoFocus value={bufferEdit}
                      onChange={e => setBufferEdit(e.target.value)}
                      onKeyDown={e => {
                        if (e.key === 'Enter') { const n = parseInt(bufferEdit, 10); if (n > 0) { patchSet.mutate({ bufferWeeks: n }); setBufferEdit(null) } }
                        if (e.key === 'Escape') setBufferEdit(null)
                      }}
                      className="w-10 px-1 py-0.5 text-xs border border-accent rounded outline-none tabular-nums"
                    />
                    wks
                    <button onClick={() => { const n = parseInt(bufferEdit, 10); if (n > 0) { patchSet.mutate({ bufferWeeks: n }); setBufferEdit(null) } }} className="text-accent text-xs hover:underline">Save</button>
                    <button onClick={() => setBufferEdit(null)} className="text-gray-400 text-xs">✕</button>
                  </span>
                ) : (
                  <button onClick={() => setBufferEdit(String(inv.bufferWeeks))} className="hover:text-accent transition-colors">
                    {inv.bufferWeeks}wk buffer ✎
                  </button>
                )}
              </>
            ) : 'No production runs yet — add one to start tracking'}
          </p>
        </div>

        {/* Action buttons / inline forms */}
        {action === null ? (
          <div className="flex items-center gap-2 flex-wrap">
            <button onClick={() => setAction('production')}
              className="px-3 py-1.5 text-xs font-medium text-gray-600 border border-gray-200 hover:border-gray-300 rounded-lg transition-colors">
              + Production Run
            </button>
            <button onClick={() => setAction('transfer')} disabled={inv.casesInWarehouse === 0}
              className="px-3 py-1.5 text-xs font-medium text-gray-600 border border-gray-200 hover:border-gray-300 rounded-lg disabled:opacity-40 disabled:cursor-not-allowed transition-colors">
              Pull from Warehouse
            </button>
            <button onClick={() => setAction('deploy')} disabled={inv.onHandCases === 0}
              className="px-3 py-1.5 text-xs font-medium bg-accent text-white rounded-lg hover:bg-accent/90 disabled:opacity-40 disabled:cursor-not-allowed transition-colors">
              Deploy to Field
            </button>
            {/* Log Depletions — hidden until distributor reporting is in use */}
          </div>
        ) : action === 'production' ? (
          <ActionForm label="Cases received" placeholder="0" buttonLabel="Add" buttonClass="bg-accent"
            value={inputVal} notes={notesVal} onValue={setInputVal} onNotes={setNotesVal}
            onSubmit={submitRun} onCancel={cancelAction} disabled={anyPending} />
        ) : action === 'transfer' ? (
          <div className="flex flex-col gap-1">
            <p className="text-[10px] text-gray-400">
              Move cases from the main warehouse to On-Hand · {inv.casesInWarehouse.toLocaleString()} cases available
            </p>
            <ActionForm label="Cases" placeholder="0" buttonLabel="Pull" buttonClass="bg-accent"
              value={inputVal} notes={notesVal} onValue={setInputVal} onNotes={setNotesVal}
              onSubmit={submitTransfer} onCancel={cancelAction}
              disabled={anyPending || parseInt(inputVal, 10) > inv.casesInWarehouse} />
          </div>
        ) : null}
      </div>

      <StaleAlertsCard />

      {/* Deploy form (full width when active) */}
      {action === 'deploy' && (
        <div className="bg-white border border-gray-200 rounded-xl px-5 py-4 mb-5">
          <div className="flex items-center gap-2 mb-3 flex-wrap">
            <div className="flex items-center gap-0.5 bg-gray-100 rounded-lg p-0.5">
              {(['chain', 'rep', 'store'] as DeployMode[]).map(mode => (
                <button key={mode} onClick={() => { setDeployMode(mode); setChainId(''); setMarketSlug(''); setStoreId(''); setRepId('') }}
                  className={clsx('px-2.5 py-1 rounded-md text-[10px] font-semibold transition-all capitalize',
                    deployMode === mode ? 'bg-white text-gray-800 shadow-sm' : 'text-gray-400 hover:text-gray-600')}>
                  To {mode === 'store' ? 'Store (direct)' : mode === 'rep' ? 'Rep' : 'Chain'}
                </button>
              ))}
            </div>
            <span className="text-[10px] text-gray-400">
              {deployMode === 'chain' ? 'Bulk shipment — chain receives and distributes internally' :
               deployMode === 'rep'   ? 'Cases given to a rep to carry and deliver' :
                                        'Direct drop-off at a specific store (e.g. independent)'}
            </span>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs text-gray-400">Cases</span>
            <input type="number" min="1" max={inv.onHandCases} autoFocus placeholder="0"
              value={inputVal} onChange={e => setInputVal(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') submitDeploy(); if (e.key === 'Escape') cancelAction() }}
              className="w-20 px-2.5 py-1 text-sm border border-gray-200 rounded-lg outline-none focus:border-accent tabular-nums" />

            {deployMode === 'chain' && chains.length > 0 && (
              <select value={chainId} onChange={e => setChainId(e.target.value)}
                className="px-2.5 py-1 text-xs border border-gray-200 rounded-lg outline-none focus:border-accent bg-white">
                <option value="">All chains</option>
                {chains.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            )}
            {deployMode === 'chain' && regions.length > 0 && (
              <select value={marketSlug} onChange={e => setMarketSlug(e.target.value)}
                className="px-2.5 py-1 text-xs border border-gray-200 rounded-lg outline-none focus:border-accent bg-white">
                <option value="">All markets</option>
                {regions.map(r => <option key={r.slug} value={r.slug}>{r.name}</option>)}
              </select>
            )}
            {deployMode === 'rep' && (
              <select value={repId} onChange={e => setRepId(e.target.value)}
                className="px-2.5 py-1 text-xs border border-gray-200 rounded-lg outline-none focus:border-accent bg-white max-w-[200px]">
                <option value="">Select rep…</option>
                {allReps.slice().sort((a, b) => a.name.localeCompare(b.name)).map(r => <option key={r.id} value={r.id}>{r.name}</option>)}
              </select>
            )}
            {deployMode === 'store' && (
              <select value={storeId} onChange={e => setStoreId(e.target.value)}
                className="px-2.5 py-1 text-xs border border-gray-200 rounded-lg outline-none focus:border-accent bg-white max-w-[220px]">
                <option value="">Select store…</option>
                {allStores.slice().sort((a, b) => a.name.localeCompare(b.name)).map(s => (
                  <option key={s.id} value={s.id}>{s.name}{s.region ? ` — ${s.region}` : ''}</option>
                ))}
              </select>
            )}
            <input type="text" placeholder="Notes (optional)" value={notesVal} onChange={e => setNotesVal(e.target.value)}
              className="w-44 px-2.5 py-1 text-xs border border-gray-200 rounded-lg outline-none focus:border-accent text-gray-600 placeholder-gray-300" />
            <button onClick={submitDeploy}
              disabled={!inputVal || parseInt(inputVal, 10) <= 0 || parseInt(inputVal, 10) > inv.onHandCases || anyPending ||
                (deployMode === 'rep' && !repId) || (deployMode === 'store' && !storeId)}
              className="px-3 py-1 text-xs font-medium bg-accent text-white rounded-lg hover:bg-accent/90 disabled:opacity-40 transition-colors">
              Deploy
            </button>
            <button onClick={cancelAction} className="text-xs text-gray-400 hover:text-gray-600 transition-colors">Cancel</button>
          </div>
        </div>
      )}

      {/* ── SETUP STATE ────────────────────────────────────────────────────── */}
      {!hasData && action === null && (
        <div className="bg-white border border-gray-200 rounded-xl p-10 text-center mb-5">
          <p className="text-sm font-medium text-gray-700 mb-1">No production runs yet</p>
          <p className="text-xs text-gray-400 mb-4">Add your first production run to start tracking the full inventory lifecycle</p>
          <button onClick={() => setAction('production')}
            className="px-4 py-2 text-sm font-medium bg-accent text-white rounded-lg hover:bg-accent/90 transition-colors">
            + Add Production Run
          </button>
        </div>
      )}

      {hasData && !hasOnHand && action === null && (
        <div className="bg-amber-50 border border-amber-100 rounded-xl px-5 py-4 mb-5 flex items-center justify-between gap-4">
          <div>
            <p className="text-sm font-semibold text-amber-800">Pull cases to On-Hand to enable field deployment</p>
            <p className="text-xs text-amber-600 mt-0.5">
              You have {inv.casesInWarehouse.toLocaleString()} cases in the warehouse — pull the quantity you have on-site and ready to deploy
            </p>
          </div>
          <button onClick={() => setAction('transfer')}
            className="flex-shrink-0 px-3 py-1.5 text-xs font-medium bg-amber-600 text-white rounded-lg hover:bg-amber-700 transition-colors">
            Pull from Warehouse
          </button>
        </div>
      )}

      {/* ── LIVE SNAPSHOT ──────────────────────────────────────────────────── */}
      {hasData && (
        <div className="bg-white border border-gray-200 rounded-xl p-5 mb-5">

          {/* Reorder alert */}
          {inv.reorderAlert && (
            <div className="bg-red-50 border border-red-100 rounded-lg px-4 py-2.5 text-xs flex flex-wrap items-center gap-x-5 gap-y-1 mb-4">
              <span className="font-semibold text-red-600">
                ⚠ Reorder now — {inv.warehouseWeeksLeft}w of warehouse supply, lead time is {inv.reorderLeadWeeks}w
              </span>
              {inv.recommendedOrderCases && (
                <span className="text-red-500">Order <span className="font-semibold">{inv.recommendedOrderCases.toLocaleString()} cases</span> to cover lead + {inv.bufferWeeks}wk buffer</span>
              )}
            </div>
          )}

          {/* Progress bar — 4 segments */}
          <div className="flex h-2.5 rounded-full overflow-hidden bg-gray-100 mb-3">
            {warehousePct > 0 && <div className="bg-gray-300 h-full transition-all duration-500"  style={{ width: `${warehousePct}%` }} />}
            {onHandPct    > 0 && <div className="bg-blue-400 h-full transition-all duration-500"   style={{ width: `${onHandPct}%` }} />}
            {onShelfPct   > 0 && <div className="bg-accent h-full transition-all duration-500"     style={{ width: `${onShelfPct}%` }} />}
            {offShelfPct  > 0 && <div className="bg-amber-400 h-full transition-all duration-500" style={{ width: `${offShelfPct}%` }} />}
          </div>
          <div className="flex items-center gap-4 mb-5 text-[10px] text-gray-400">
            <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-gray-300 flex-shrink-0" />Warehouse</span>
            <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-blue-400 flex-shrink-0" />On-Hand</span>
            <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-accent flex-shrink-0" />On Shelf</span>
            <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-amber-400 flex-shrink-0" />Off Shelf</span>
          </div>

          {/* Stats */}
          <div className="grid grid-cols-2 lg:grid-cols-6 gap-4 mb-4">
            <StatBlock label="Warehouse" bottles={inv.casesInWarehouse * BOTTLES_PER_CASE} cases={inv.casesInWarehouse} />
            <StatBlock label="On-Hand"   bottles={inv.onHandBottles}   cases={inv.onHandCases}   color="text-blue-600"
              sub="ready to deploy" />
            <StatBlock label="Deployed"  bottles={inv.bottlesDeployed} cases={inv.casesDeployed} />
            <StatBlock label="On Shelf"  bottles={inv.bottlesOnShelf}  cases={inv.casesOnShelf}  approx />
            <StatBlock label="Off Shelf" bottles={inv.bottlesDepleted} cases={inv.casesDepleted} color="text-amber-500"
              sub={`${inv.casesDepleted > 0 ? Math.round((inv.casesDepleted / (inv.casesDeployed || 1)) * 100) : 0}% of deployed`} />
            <StatBlock label="Event Sales" bottles={inv.eventSalesBottles} cases={inv.eventSalesCases} color="text-purple-600"
              sub={inv.eventSalesBottles > 0 ? 'tastings & events' : 'from tastings & events'} />
            {/* Depletions stat hidden — distributor reporting not in use */}
          </div>

          {/* Depletion rate info */}
          {inv.depletionRateWeeklyCases > 0 && !inv.reorderAlert && (
            <div className="bg-gray-50 rounded-lg px-4 py-2.5 text-xs flex flex-wrap items-center gap-x-5 gap-y-1">
              <span className="text-gray-500">Depletion rate: <span className="font-semibold text-gray-800">{inv.depletionRateWeeklyCases} cases/week</span></span>
              {inv.warehouseWeeksLeft !== null && (
                <span className="text-gray-500">Warehouse: <span className="font-semibold text-gray-800">~{inv.warehouseWeeksLeft} weeks</span></span>
              )}
              {inv.reorderDate && (
                <span className="text-gray-500">Reorder by <span className="font-semibold text-gray-800">{inv.reorderDate}</span></span>
              )}
            </div>
          )}
        </div>
      )}

      {/* ── BREAKDOWN ──────────────────────────────────────────────────────── */}
      {hasData && inv.casesDeployed > 0 && (
        <div className="bg-white border border-gray-200 rounded-xl overflow-hidden mb-5">
          <div className="px-5 py-3 border-b border-gray-100 flex items-center justify-between">
            <h2 className="text-sm font-semibold text-gray-900">Deployment Breakdown</h2>
            <div className="flex items-center gap-0.5 bg-gray-100 rounded-lg p-0.5">
              {([ ['chain','By Chain'], ['rep','By Rep'], ['store','By Store'], ['market','By Market'] ] as [Breakdown, string][])
                .filter(([b]) =>
                  (b === 'chain'  && inv.chains.length > 0) ||
                  (b === 'rep'    && inv.repDeliveries.length > 0) ||
                  (b === 'store'  && inv.storeDeliveries.length > 0) ||
                  (b === 'market' && inv.markets.length > 0)
                )
                .map(([b, label]) => (
                  <button key={b} onClick={() => setBreakdown(b)}
                    className={clsx('px-2.5 py-1 rounded-md text-[10px] font-semibold transition-all',
                      breakdown === b ? 'bg-white text-gray-800 shadow-sm' : 'text-gray-400 hover:text-gray-600')}>
                    {label}
                  </button>
                ))}
            </div>
          </div>

          {breakdown === 'chain' && (
            <BreakdownTable
              rows={inv.chains.map(c => ({ key: c.chainId, name: c.chainName, deployed: c.casesDeployed, onShelf: c.casesOnShelf, offShelf: c.casesOffShelf, offShelfPct: c.offShelfPct }))}
              unallocated={unallocated}
              headers={['Chain', 'Deployed', 'On Shelf', 'Off Shelf', '% Off Shelf']}
            />
          )}
          {breakdown === 'rep' && (
            <BreakdownTable
              rows={inv.repDeliveries.map(r => ({ key: r.repId, name: r.repName, deployed: r.casesDeployed, onShelf: r.casesOnShelf, offShelf: r.casesOffShelf, offShelfPct: r.offShelfPct }))}
              headers={['Rep', 'Delivered', 'On Shelf (their stores)', 'Off Shelf', '% Off Shelf']}
            />
          )}
          {breakdown === 'store' && (
            <BreakdownTable
              rows={inv.storeDeliveries.map(s => ({ key: s.storeId, name: s.storeName, deployed: s.casesDeployed, onShelf: s.casesOnShelf, offShelf: s.casesOffShelf, offShelfPct: s.offShelfPct }))}
              headers={['Store', 'Delivered', 'On Shelf', 'Off Shelf', '% Off Shelf']}
            />
          )}
          {breakdown === 'market' && (
            <BreakdownTable
              rows={inv.markets.map(m => ({ key: m.slug, name: m.name, deployed: m.casesDeployed, onShelf: Math.round(m.bottlesOnShelf / BOTTLES_PER_CASE), offShelf: m.casesDepleted, offShelfPct: m.sellThroughPct }))}
              headers={['Market', 'Deployed', 'On Shelf', 'Off Shelf', '% Off Shelf']}
            />
          )}
        </div>
      )}

      {/* ── MANAGEMENT TABLES ──────────────────────────────────────────────── */}

      {/* Production Runs */}
      <LogTable
        title="Production Runs"
        subtitle={`${invLog?.productionRuns.length ?? 0} entries · ${(invLog?.productionRuns ?? []).reduce((s, r) => s + r.quantity, 0).toLocaleString()} total cases received`}
        loading={!invLog}
        empty="No production runs recorded"
        headers={['Date Received', 'Cases', 'Bottles', 'Notes', '']}
        footer={invLog?.productionRuns.reduce((s, r) => s + r.quantity, 0) ?? 0}
      >
        {(invLog?.productionRuns ?? []).map(run => {
          const isEdit = editing?.type === 'run' && editing.id === run.id
          const isConf = confirmDelete?.type === 'run' && confirmDelete.id === run.id
          return (
            <tr key={run.id} className={clsx('transition-colors', isEdit ? 'bg-accent/5' : 'hover:bg-gray-50/70')}>
              {isEdit ? (
                <InlineEditRow
                  date={editing.date} qty={editing.quantity} notes={editing.notes}
                  onDate={v => setEditing(e => e && { ...e, date: v })}
                  onQty={v  => setEditing(e => e && { ...e, quantity: v })}
                  onNotes={v => setEditing(e => e && { ...e, notes: v })}
                  onSave={saveEdit} onCancel={() => setEditing(null)}
                  saving={patchRun.isPending}
                />
              ) : (
                <>
                  <td className="px-5 py-3 text-sm text-gray-700">{fmtDate(run.receivedAt)}</td>
                  <td className="px-5 py-3 text-right text-sm font-semibold tabular-nums text-gray-900">{run.quantity.toLocaleString()}</td>
                  <td className="px-5 py-3 text-right text-sm tabular-nums text-gray-500">{(run.quantity * BOTTLES_PER_CASE).toLocaleString()}</td>
                  <td className="px-5 py-3 text-sm text-gray-400 max-w-xs truncate">{run.notes ?? <span className="text-gray-200">—</span>}</td>
                  <td className="px-5 py-3 text-right whitespace-nowrap">
                    {isConf ? (
                      <ConfirmRow onYes={() => deleteRun.mutate(run.id)} onNo={() => setConfirmDelete(null)} loading={deleteRun.isPending} />
                    ) : (
                      <RowActions
                        onEdit={() => setEditing({ type: 'run', id: run.id, quantity: String(run.quantity), notes: run.notes ?? '', date: run.receivedAt.slice(0, 10) })}
                        onDelete={() => setConfirmDelete({ type: 'run', id: run.id })}
                      />
                    )}
                  </td>
                </>
              )}
            </tr>
          )
        })}
      </LogTable>

      {/* Warehouse Transfers */}
      <LogTable
        title="Warehouse Transfers"
        subtitle={`${invLog?.warehouseTransfers.length ?? 0} entries · ${(invLog?.warehouseTransfers ?? []).reduce((s, t) => s + t.quantity, 0).toLocaleString()} cases pulled to On-Hand`}
        loading={!invLog}
        empty="No transfers yet — use 'Pull from Warehouse' to move cases to On-Hand"
        headers={['Date Transferred', 'Cases', 'Bottles', 'Notes', '']}
        footer={invLog?.warehouseTransfers.reduce((s, t) => s + t.quantity, 0) ?? 0}
        footerColor="text-blue-600"
      >
        {(invLog?.warehouseTransfers ?? []).map(transfer => {
          const isEdit = editing?.type === 'transfer' && editing.id === transfer.id
          const isConf = confirmDelete?.type === 'transfer' && confirmDelete.id === transfer.id
          return (
            <tr key={transfer.id} className={clsx('transition-colors', isEdit ? 'bg-accent/5' : 'hover:bg-gray-50/70')}>
              {isEdit ? (
                <InlineEditRow
                  date={editing.date} qty={editing.quantity} notes={editing.notes}
                  onDate={v => setEditing(e => e && { ...e, date: v })}
                  onQty={v  => setEditing(e => e && { ...e, quantity: v })}
                  onNotes={v => setEditing(e => e && { ...e, notes: v })}
                  onSave={saveEdit} onCancel={() => setEditing(null)}
                  saving={patchTransfer.isPending}
                />
              ) : (
                <>
                  <td className="px-5 py-3 text-sm text-gray-700">{fmtDate(transfer.transferredAt)}</td>
                  <td className="px-5 py-3 text-right text-sm font-semibold tabular-nums text-blue-600">{transfer.quantity.toLocaleString()}</td>
                  <td className="px-5 py-3 text-right text-sm tabular-nums text-gray-500">{(transfer.quantity * BOTTLES_PER_CASE).toLocaleString()}</td>
                  <td className="px-5 py-3 text-sm text-gray-400 max-w-xs truncate">{transfer.notes ?? <span className="text-gray-200">—</span>}</td>
                  <td className="px-5 py-3 text-right whitespace-nowrap">
                    {isConf ? (
                      <ConfirmRow onYes={() => deleteTransfer.mutate(transfer.id)} onNo={() => setConfirmDelete(null)} loading={deleteTransfer.isPending} />
                    ) : (
                      <RowActions
                        onEdit={() => setEditing({ type: 'transfer', id: transfer.id, quantity: String(transfer.quantity), notes: transfer.notes ?? '', date: transfer.transferredAt.slice(0, 10) })}
                        onDelete={() => setConfirmDelete({ type: 'transfer', id: transfer.id })}
                      />
                    )}
                  </td>
                </>
              )}
            </tr>
          )
        })}
      </LogTable>

      {/* Field Deployments */}
      <LogTable
        title="Field Deployments"
        subtitle={`${invLog?.deployments.length ?? 0} entries · ${(invLog?.deployments ?? []).reduce((s, d) => s + d.quantity, 0).toLocaleString()} cases sent to field`}
        loading={!invLog}
        empty="No deployments recorded"
        headers={['Date Deployed', 'Cases', 'Bottles', 'Rep', 'Store', 'Chain', 'Market', 'Notes', '']}
        footer={invLog?.deployments.reduce((s, d) => s + d.quantity, 0) ?? 0}
      >
        {(invLog?.deployments ?? []).map(dep => {
          const isEdit = editing?.type === 'deploy' && editing.id === dep.id
          const isConf = confirmDelete?.type === 'deploy' && confirmDelete.id === dep.id
          return (
            <tr key={dep.id} className={clsx('transition-colors', isEdit ? 'bg-accent/5' : 'hover:bg-gray-50/70')}>
              {isEdit ? (
                <InlineEditRow
                  date={editing.date} qty={editing.quantity} notes={editing.notes}
                  onDate={v => setEditing(e => e && { ...e, date: v })}
                  onQty={v  => setEditing(e => e && { ...e, quantity: v })}
                  onNotes={v => setEditing(e => e && { ...e, notes: v })}
                  onSave={saveEdit} onCancel={() => setEditing(null)}
                  saving={patchDeploy.isPending}
                  extraCols={6}
                />
              ) : (
                <>
                  <td className="px-5 py-3 text-sm text-gray-700">{fmtDate(dep.deployedAt)}</td>
                  <td className="px-5 py-3 text-right text-sm font-semibold tabular-nums text-gray-900">{dep.quantity.toLocaleString()}</td>
                  <td className="px-5 py-3 text-right text-sm tabular-nums text-gray-500">{(dep.quantity * BOTTLES_PER_CASE).toLocaleString()}</td>
                  <td className="px-5 py-3 text-sm text-gray-500">{dep.repName   ?? <span className="text-gray-300">—</span>}</td>
                  <td className="px-5 py-3 text-sm text-gray-500">{dep.storeName ?? <span className="text-gray-300">—</span>}</td>
                  <td className="px-5 py-3 text-sm text-gray-500">{dep.chainName ?? <span className="text-gray-300">—</span>}</td>
                  <td className="px-5 py-3 text-sm text-gray-500">{dep.marketName ?? <span className="text-gray-300">—</span>}</td>
                  <td className="px-5 py-3 text-sm text-gray-400 max-w-xs truncate">{dep.notes ?? <span className="text-gray-200">—</span>}</td>
                  <td className="px-5 py-3 text-right whitespace-nowrap">
                    {isConf ? (
                      <ConfirmRow onYes={() => deleteDeploy.mutate(dep.id)} onNo={() => setConfirmDelete(null)} loading={deleteDeploy.isPending} />
                    ) : (
                      <RowActions
                        onEdit={() => setEditing({ type: 'deploy', id: dep.id, quantity: String(dep.quantity), notes: dep.notes ?? '', date: dep.deployedAt.slice(0, 10) })}
                        onDelete={() => setConfirmDelete({ type: 'deploy', id: dep.id })}
                      />
                    )}
                  </td>
                </>
              )}
            </tr>
          )
        })}
      </LogTable>

      {/* Depletion Reports — hidden until distributor reporting is in use
      <LogTable
        title="Depletion Reports"
        subtitle={`${invLog?.salesEntries.length ?? 0} entries · ${(invLog?.salesEntries ?? []).reduce((s, e) => s + e.quantity, 0).toLocaleString()} total cases depleted`}
        loading={!invLog}
        empty="No depletions logged — use Log Depletions to record data from your distributor report"
        headers={['Date Reported', 'Cases', 'Bottles', 'Notes', '']}
        footer={invLog?.salesEntries.reduce((s, e) => s + e.quantity, 0) ?? 0}
        footerColor="text-green-600"
      >
        {(invLog?.salesEntries ?? []).map(entry => {
          const isEdit = editing?.type === 'depletion' && editing.id === entry.id
          const isConf = confirmDelete?.type === 'depletion' && confirmDelete.id === entry.id
          return (
            <tr key={entry.id} className={clsx('transition-colors', isEdit ? 'bg-green-50/50' : 'hover:bg-gray-50/70')}>
              {isEdit ? (
                <InlineEditRow
                  date={editing.date} qty={editing.quantity} notes={editing.notes}
                  onDate={v => setEditing(e => e && { ...e, date: v })}
                  onQty={v  => setEditing(e => e && { ...e, quantity: v })}
                  onNotes={v => setEditing(e => e && { ...e, notes: v })}
                  onSave={saveEdit} onCancel={() => setEditing(null)}
                  saving={patchDeplet.isPending}
                />
              ) : (
                <>
                  <td className="px-5 py-3 text-sm text-gray-700">{fmtDate(entry.soldAt)}</td>
                  <td className="px-5 py-3 text-right text-sm font-semibold tabular-nums text-green-600">{entry.quantity.toLocaleString()}</td>
                  <td className="px-5 py-3 text-right text-sm tabular-nums text-gray-500">{(entry.quantity * BOTTLES_PER_CASE).toLocaleString()}</td>
                  <td className="px-5 py-3 text-sm text-gray-400 max-w-xs truncate">{entry.notes ?? <span className="text-gray-200">—</span>}</td>
                  <td className="px-5 py-3 text-right whitespace-nowrap">
                    {isConf ? (
                      <ConfirmRow onYes={() => deleteDeplet.mutate(entry.id)} onNo={() => setConfirmDelete(null)} loading={deleteDeplet.isPending} />
                    ) : (
                      <RowActions
                        onEdit={() => setEditing({ type: 'depletion', id: entry.id, quantity: String(entry.quantity), notes: entry.notes ?? '', date: entry.soldAt.slice(0, 10) })}
                        onDelete={() => setConfirmDelete({ type: 'depletion', id: entry.id })}
                      />
                    )}
                  </td>
                </>
              )}
            </tr>
          )
        })}
      </LogTable>
      */}

      {/* ── DANGER ZONE — collapsed by default to prevent accidental resets ── */}
      <div className="mt-6">
        {!showDanger ? (
          <button
            onClick={() => setShowDanger(true)}
            className="text-[11px] text-gray-300 hover:text-gray-500 transition-colors"
          >
            Advanced settings
          </button>
        ) : (
          <div className="bg-red-50/40 border border-red-100 rounded-xl px-5 py-3.5 flex flex-wrap items-center justify-between gap-4">
            <div>
              <p className="text-xs font-semibold text-red-600">Danger zone</p>
              <p className="text-xs text-gray-400 mt-0.5">
                Reset all inventory data — permanently clears every production run, transfer, deployment, and depletion entry. This cannot be undone.
              </p>
            </div>
            <div className="flex items-center gap-2 flex-shrink-0">
              {confirmDelete?.type === 'reset' ? (
                <span className="inline-flex items-center gap-3">
                  <span className="text-xs text-gray-600 font-medium">Delete everything?</span>
                  <button onClick={() => resetAll.mutate()} disabled={resetAll.isPending}
                    className="px-3 py-1.5 text-xs font-semibold bg-red-600 text-white rounded-lg hover:bg-red-700 disabled:opacity-50 transition-colors">
                    Yes, reset all
                  </button>
                  <button onClick={() => setConfirmDelete(null)} className="text-xs text-gray-400 hover:text-gray-600">Cancel</button>
                </span>
              ) : (
                <>
                  <button onClick={() => setConfirmDelete({ type: 'reset' })}
                    className="px-3 py-1.5 text-xs font-medium text-red-500 border border-red-200 rounded-lg hover:bg-red-50 transition-colors">
                    Reset All
                  </button>
                  <button
                    onClick={() => { setShowDanger(false); setConfirmDelete(null) }}
                    className="text-xs text-gray-400 hover:text-gray-600"
                  >
                    Hide
                  </button>
                </>
              )}
            </div>
          </div>
        )}
      </div>

    </div>
  )
}

// ─── helpers ─────────────────────────────────────────────────────────────────

function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

// Manual trigger for the nightly stale-store scan: dry run first, then an
// explicit confirm before anything is written.
function StaleAlertsCard() {
  const qc = useQueryClient()
  const [report,  setReport]  = useState<StaleAlertsReport | null>(null)
  const [running, setRunning] = useState<'dry' | 'live' | null>(null)
  const [error,   setError]   = useState<string | null>(null)
  const [confirm, setConfirm] = useState(false)

  function run(dryRun: boolean) {
    setError(null)
    setConfirm(false)
    setRunning(dryRun ? 'dry' : 'live')
    api.runStaleAlerts(dryRun)
      .then(r => {
        setReport(r)
        if (!dryRun) {
          qc.invalidateQueries({ queryKey: ['alerts'] })
          qc.invalidateQueries({ queryKey: ['dashboard'] })
        }
      })
      .catch((e: Error) => setError(e.message))
      .finally(() => setRunning(null))
  }

  const busy    = running !== null
  const raised  = report ? report.visitOverdueRaised + report.noMovementRaised : 0
  const cleared = report ? report.visitOverdueResolved + report.noMovementResolved : 0

  return (
    <div className="bg-white border border-gray-200 rounded-xl overflow-hidden mb-5">
      <div className="px-5 py-4 border-b border-gray-100 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-sm font-semibold text-gray-900">Stale Store Scan</h2>
          <p className="text-xs text-gray-400 mt-0.5">
            Flags stores where product isn't moving — no rep visit inside the threshold, or a
            synced shelf count that hasn't budged. Runs automatically each night at 1:30am.
          </p>
          {report && (
            <p className="text-xs text-gray-500 mt-1.5">
              Thresholds: {report.visitOverdueDays}d without a visit · {report.noMovementDays}d flat on shelf
            </p>
          )}
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          <button
            onClick={() => run(true)}
            disabled={busy}
            className="px-3 py-1.5 text-xs font-medium text-gray-600 border border-gray-200 hover:border-gray-300 rounded-lg disabled:opacity-40 transition-colors"
          >
            {running === 'dry' ? 'Checking…' : 'Dry run'}
          </button>
          {confirm ? (
            <span className="inline-flex items-center gap-2">
              <span className="text-xs text-gray-500">Create/resolve alerts?</span>
              <button
                onClick={() => run(false)}
                disabled={busy}
                className="px-3 py-1.5 text-xs font-semibold bg-accent text-white rounded-lg hover:bg-accent/90 disabled:opacity-40 transition-colors"
              >
                {running === 'live' ? 'Scanning…' : 'Confirm'}
              </button>
              <button onClick={() => setConfirm(false)} className="text-xs text-gray-400 hover:text-gray-600">Cancel</button>
            </span>
          ) : (
            <button
              onClick={() => setConfirm(true)}
              disabled={busy}
              className="px-3 py-1.5 text-xs font-medium bg-accent text-white rounded-lg hover:bg-accent/90 disabled:opacity-40 transition-colors"
            >
              Scan now
            </button>
          )}
        </div>
      </div>

      {error && (
        <div className="px-5 py-3 bg-red-50 border-b border-red-100 text-xs text-red-600">{error}</div>
      )}

      {report && (
        <div>
          <div className="px-5 py-3 flex flex-wrap items-center gap-x-5 gap-y-1 text-xs bg-gray-50/50 border-b border-gray-100">
            {report.dryRun && (
              <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full bg-amber-50 text-amber-600">
                DRY RUN · nothing written
              </span>
            )}
            <span className="text-gray-500">
              <span className="font-semibold text-gray-800">{raised}</span> {report.dryRun ? 'would be raised' : 'raised'}
            </span>
            <span className="text-gray-500">
              <span className="font-semibold text-gray-800">{cleared}</span> {report.dryRun ? 'would clear' : 'cleared'}
            </span>
            <span className="text-gray-400">{report.storesConsidered} stores checked</span>
            <span className="text-gray-400">{new Date(report.ranAt).toLocaleString()}</span>
          </div>

          {report.details.length === 0 ? (
            <p className="px-5 py-6 text-xs text-gray-400 text-center">
              Nothing to flag — every store is inside both thresholds.
            </p>
          ) : (
            <div className="overflow-x-auto max-h-80 overflow-y-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-gray-100 bg-gray-50/50 sticky top-0">
                    {['Store', 'Signal', 'Change', 'Why'].map(h => (
                      <th key={h} className="px-5 py-2.5 text-left text-[10px] font-semibold text-gray-400 uppercase tracking-wider whitespace-nowrap">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {report.details.map((d, i) => (
                    <tr key={`${d.storeId}-${d.type}-${i}`} className="hover:bg-gray-50/70 transition-colors">
                      <td className="px-5 py-2.5 text-sm text-gray-700">{d.storeName}</td>
                      <td className="px-5 py-2.5 text-xs">
                        <span className={clsx(
                          'px-2 py-0.5 rounded-full font-medium',
                          d.type === 'VISIT_OVERDUE'
                            ? 'bg-orange-50 text-orange-700'
                            : 'bg-purple-50 text-purple-700',
                        )}>
                          {d.type === 'VISIT_OVERDUE' ? 'Visit overdue' : 'Not moving'}
                        </span>
                      </td>
                      <td className="px-5 py-2.5 text-xs">
                        <span className={d.action === 'raised' ? 'text-red-600' : 'text-green-600'}>
                          {d.action === 'raised' ? 'Raised' : 'Resolved'}
                        </span>
                      </td>
                      <td className="px-5 py-2.5 text-xs text-gray-500">{d.reason}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// ─── sub-components ───────────────────────────────────────────────────────────

function StatBlock({ label, bottles, cases, color = 'text-gray-900', sub, approx }: {
  label: string; bottles: number; cases: number; color?: string; sub?: string; approx?: boolean
}) {
  return (
    <div>
      <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide mb-1">{label}</p>
      <p className={clsx('text-xl font-bold tabular-nums', color, bottles === 0 && color === 'text-gray-900' ? 'text-gray-400' : '')}>
        {bottles === 0 && !['text-amber-500','text-purple-600','text-green-600'].includes(color) ? '—' : `${approx ? '~' : ''}${bottles.toLocaleString()}`}
      </p>
      <p className="text-[10px] text-gray-400 mt-0.5">bottles</p>
      <p className="text-[10px] text-gray-400">{approx ? '~' : ''}{cases.toLocaleString()} cases{sub ? '' : ''}</p>
      {sub && <p className="text-[10px] text-gray-400">{sub}</p>}
    </div>
  )
}

function BreakdownTable({ rows, headers, unallocated = 0 }: {
  rows: { key: string; name: string; deployed: number; onShelf: number; offShelf: number; offShelfPct: number }[]
  headers: string[]
  unallocated?: number
}) {
  if (rows.length === 0 && unallocated === 0) {
    return <div className="px-5 py-6 text-sm text-gray-400 text-center">No allocation data yet</div>
  }
  return (
    <div className="divide-y divide-gray-50">
      {rows.map(row => (
        <div key={row.key} className="px-5 py-3 grid grid-cols-5 gap-2 text-xs items-center">
          <div className="font-medium text-gray-700 truncate">{row.name}</div>
          <div className="text-right tabular-nums text-gray-700">{(row.deployed * BOTTLES_PER_CASE).toLocaleString()} btls <span className="text-gray-400">({row.deployed} cs)</span></div>
          <div className="text-right tabular-nums text-gray-500">~{(row.onShelf * BOTTLES_PER_CASE).toLocaleString()} btls</div>
          <div className="text-right tabular-nums text-amber-600 font-medium">{(row.offShelf * BOTTLES_PER_CASE).toLocaleString()} btls</div>
          <div className={clsx('text-right tabular-nums font-semibold',
            row.offShelfPct >= 80 ? 'text-amber-600' : row.offShelfPct >= 50 ? 'text-amber-500' : 'text-gray-500')}>
            {row.offShelfPct}%
          </div>
        </div>
      ))}
      {unallocated > 0 && (
        <div className="px-5 py-3 grid grid-cols-5 gap-2 text-xs items-center">
          <div className="font-medium text-gray-400 italic">Unallocated</div>
          <div className="text-right tabular-nums text-gray-400">{(unallocated * BOTTLES_PER_CASE).toLocaleString()} btls <span className="text-gray-300">({unallocated} cs)</span></div>
          <div className="text-right text-gray-300">—</div>
          <div className="text-right text-gray-300">—</div>
          <div className="text-right text-gray-300">—</div>
        </div>
      )}
      <div className="px-5 py-2 text-[10px] text-gray-400 text-right">{headers[0]} · {headers[1]} · {headers[2]} · {headers[3]}</div>
    </div>
  )
}

function LogTable({ title, subtitle, loading, empty, headers, footer, footerColor = 'text-gray-900', children }: {
  title: string; subtitle: string; loading: boolean; empty: string
  headers: string[]; footer: number; footerColor?: string; children: React.ReactNode
}) {
  return (
    <div className="bg-white border border-gray-200 rounded-xl overflow-hidden mb-4">
      <div className="px-5 py-3 border-b border-gray-100 flex items-center justify-between">
        <div>
          <h2 className="text-sm font-semibold text-gray-900">{title}</h2>
          <p className="text-xs text-gray-400 mt-0.5">{subtitle}</p>
        </div>
      </div>
      {loading ? (
        <div className="py-8 text-center text-sm text-gray-400">Loading…</div>
      ) : !(children as React.ReactElement[])?.length ? (
        <div className="py-8 text-center text-sm text-gray-400">{empty}</div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-gray-100 bg-gray-50/50">
                {headers.map(h => (
                  <th key={h} className={clsx('px-5 py-3 text-[10px] font-semibold text-gray-400 uppercase tracking-wider', h ? 'text-left' : '')}>
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">{children}</tbody>
            <tfoot>
              <tr className="border-t border-gray-200 bg-gray-50/50">
                <td className="px-5 py-2.5 text-xs font-semibold text-gray-500">Total</td>
                <td className={clsx('px-5 py-2.5 text-right text-xs font-semibold tabular-nums', footerColor)}>
                  {footer.toLocaleString()} cases
                </td>
                <td className="px-5 py-2.5 text-right text-xs tabular-nums text-gray-400">
                  {(footer * BOTTLES_PER_CASE).toLocaleString()} bottles
                </td>
                <td colSpan={headers.length - 3} />
              </tr>
            </tfoot>
          </table>
        </div>
      )}
    </div>
  )
}

function ActionForm({ label, placeholder, buttonLabel, buttonClass, notesPlaceholder, value, notes, onValue, onNotes, onSubmit, onCancel, disabled }: {
  label: string; placeholder: string; buttonLabel: string; buttonClass: string
  notesPlaceholder?: string; value: string; notes: string
  onValue: (v: string) => void; onNotes: (v: string) => void
  onSubmit: () => void; onCancel: () => void; disabled: boolean
}) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <span className="text-xs text-gray-400">{label}</span>
      <input type="number" min="1" autoFocus placeholder={placeholder}
        value={value} onChange={e => onValue(e.target.value)}
        onKeyDown={e => { if (e.key === 'Enter') onSubmit(); if (e.key === 'Escape') onCancel() }}
        className="w-20 px-2.5 py-1 text-sm border border-gray-200 rounded-lg outline-none focus:border-accent tabular-nums" />
      <input type="text" placeholder={notesPlaceholder ?? 'Notes (optional)'}
        value={notes} onChange={e => onNotes(e.target.value)}
        className="w-44 px-2.5 py-1 text-xs border border-gray-200 rounded-lg outline-none focus:border-accent text-gray-600 placeholder-gray-300" />
      <button onClick={onSubmit} disabled={disabled || !value || parseInt(value, 10) <= 0}
        className={clsx('px-3 py-1 text-xs font-medium text-white rounded-lg disabled:opacity-40 transition-colors', buttonClass)}>
        {buttonLabel}
      </button>
      <button onClick={onCancel} className="text-xs text-gray-400 hover:text-gray-600 transition-colors">Cancel</button>
    </div>
  )
}

function InlineEditRow({ date, qty, notes, onDate, onQty, onNotes, onSave, onCancel, saving, extraCols = 0 }: {
  date: string; qty: string; notes: string
  onDate: (v: string) => void; onQty: (v: string) => void; onNotes: (v: string) => void
  onSave: () => void; onCancel: () => void; saving: boolean; extraCols?: number
}) {
  return (
    <>
      <td className="px-3 py-2">
        <input type="date" value={date} onChange={e => onDate(e.target.value)}
          className="w-full px-2 py-1 text-xs border border-gray-200 rounded outline-none focus:border-accent" />
      </td>
      <td className="px-3 py-2">
        <input type="number" min="1" value={qty} onChange={e => onQty(e.target.value)}
          className="w-20 px-2 py-1 text-xs border border-gray-200 rounded outline-none focus:border-accent text-right tabular-nums" />
      </td>
      <td className="px-3 py-2 text-right text-xs text-gray-400 tabular-nums">
        {((parseInt(qty, 10) || 0) * BOTTLES_PER_CASE).toLocaleString()}
      </td>
      {extraCols > 0 && <td colSpan={extraCols} className="px-3 py-2 text-xs text-gray-300 italic">unchanged</td>}
      <td className="px-3 py-2">
        <input type="text" value={notes} onChange={e => onNotes(e.target.value)} placeholder="Notes"
          className="w-full px-2 py-1 text-xs border border-gray-200 rounded outline-none focus:border-accent" />
      </td>
      <td className="px-3 py-2 text-right whitespace-nowrap">
        <button onClick={onSave} disabled={saving} className="text-xs font-semibold text-accent hover:underline disabled:opacity-50 mr-2">Save</button>
        <button onClick={onCancel} className="text-xs text-gray-400 hover:text-gray-600">Cancel</button>
      </td>
    </>
  )
}

function RowActions({ onEdit, onDelete }: { onEdit: () => void; onDelete: () => void }) {
  return (
    <span className="inline-flex items-center gap-1">
      <button onClick={onEdit}
        className="text-[10px] font-medium text-gray-300 hover:text-accent transition-colors px-2 py-1 rounded hover:bg-accent/5">
        Edit
      </button>
      <button onClick={onDelete}
        className="text-[10px] font-medium text-gray-300 hover:text-red-500 transition-colors px-2 py-1 rounded hover:bg-red-50">
        Delete
      </button>
    </span>
  )
}

function ConfirmRow({ onYes, onNo, loading }: { onYes: () => void; onNo: () => void; loading: boolean }) {
  return (
    <span className="inline-flex items-center gap-2">
      <span className="text-xs text-gray-500">Delete?</span>
      <button onClick={onYes} disabled={loading} className="text-xs font-semibold text-red-600 hover:underline disabled:opacity-50">Yes</button>
      <button onClick={onNo} className="text-xs text-gray-400 hover:text-gray-600">No</button>
    </span>
  )
}
