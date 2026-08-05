import { useState, useMemo } from 'react'
import { Link, useSearchParams, useNavigate } from 'react-router-dom'
import { clsx } from 'clsx'
import { Button } from '@/components/ui/Button'
import { AddStoreModal } from '@/components/stores/AddStoreModal'
import { EditStoreModal } from '@/components/stores/EditStoreModal'
import { ImportModal } from '@/components/import/ImportModal'
import { DashboardStore } from '@/types'
import { useStores, useReps, useRegions, useChains, useCreateStore, useUpdateStore, useDeleteStore } from '@/hooks/useQueries'
import { useQueryClient } from '@tanstack/react-query'

export default function AdminStores() {
  const [searchParams] = useSearchParams()
  const navigate = useNavigate()

  const [showAdd, setShowAdd]       = useState(false)
  const [showImport, setShowImport] = useState(false)
  const [search, setSearch]         = useState('')
  const [market, setMarket]         = useState(searchParams.get('region') ?? 'all')
  const [chain, setChain]           = useState(searchParams.get('chain') ?? 'all')
  const [rep, setRep]               = useState(searchParams.get('rep') ?? 'all')
  const [deleteId, setDeleteId]     = useState<string | null>(null)
  const [editStore, setEditStore]   = useState<DashboardStore | null>(null)
  const queryClient = useQueryClient()

  const { data: apiStores  } = useStores()
  const { data: apiReps    } = useReps()
  const { data: apiMarkets } = useRegions()
  const { data: apiChains  } = useChains()
  const createStore = useCreateStore()
  const updateStore = useUpdateStore()
  const deleteStore = useDeleteStore()

  const stores  = apiStores  ?? []
  const allReps = apiReps    ?? []
  const markets = apiMarkets ?? []
  const chains  = apiChains  ?? []

  const filtered = useMemo(() => {
    let rows = stores
    if (market !== 'all') rows = rows.filter(s => s.region === market)
    if (chain !== 'all')  rows = rows.filter(s => s.chainId === chain)
    if (rep !== 'all')    rows = rows.filter(s => s.repId === rep)
    if (search.trim()) {
      const q = search.toLowerCase()
      rows = rows.filter(s =>
        s.name.toLowerCase().includes(q) ||
        (s.chainName ?? '').toLowerCase().includes(q) ||
        s.regionName.toLowerCase().includes(q) ||
        (s.rep ?? '').toLowerCase().includes(q)
      )
    }
    return rows
  }, [stores, market, chain, rep, search])

  function handleDelete(id: string) {
    deleteStore.mutate(id, { onSuccess: () => setDeleteId(null) })
  }

  const totalShelf = stores.reduce((s, r) => s + r.onShelf, 0)

  return (
    <div className="p-4 lg:p-8">

      {/* HEADER */}
      <div className="flex flex-wrap items-start justify-between gap-3 mb-6">
        <div>
          <h1 className="text-xl font-semibold text-gray-900 tracking-tight">Stores</h1>
          <p className="text-sm text-gray-400 mt-0.5">
            {stores.length} stores · {markets.length} regions · {totalShelf} bottles on shelf
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="sm" onClick={() => setShowImport(true)}>
            <svg width="12" height="12" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.4">
              <path d="M2 10v2a1 1 0 001 1h8a1 1 0 001-1v-2M7 2v7M4.5 6.5L7 9l2.5-2.5" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
            Import
          </Button>
          <Button variant="primary" size="sm" onClick={() => setShowAdd(true)}>
            <svg width="11" height="11" viewBox="0 0 11 11" fill="none">
              <path d="M5.5 1v9M1 5.5h9" stroke="white" strokeWidth="1.6" strokeLinecap="round"/>
            </svg>
            Add Store
          </Button>
        </div>
      </div>

      {/* SEARCH + FILTERS */}
      <div className="flex items-center gap-3 mb-5 flex-wrap">
        <div className="relative max-w-72">
          <svg className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" width="14" height="14" viewBox="0 0 14 14" fill="none">
            <circle cx="6" cy="6" r="4.5" stroke="currentColor" strokeWidth="1.4"/>
            <path d="M9.5 9.5L12 12" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/>
          </svg>
          <input
            type="text"
            placeholder="Search stores…"
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="w-full pl-8 pr-8 py-1.5 text-sm bg-white border border-gray-200 rounded-lg outline-none focus:border-accent focus:ring-2 focus:ring-accent/10 transition-all placeholder:text-gray-400"
          />
          {search && (
            <button onClick={() => setSearch('')} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">
              <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                <path d="M2 2l8 8M10 2l-8 8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
              </svg>
            </button>
          )}
        </div>

        <select
          value={market}
          onChange={e => { setMarket(e.target.value); setChain('all') }}
          className="px-3 py-1.5 text-sm bg-white border border-gray-200 rounded-lg outline-none focus:border-accent focus:ring-2 focus:ring-accent/10 text-gray-600 transition-all"
        >
          <option value="all">All Regions</option>
          {markets.map(m => <option key={m.slug} value={m.slug}>{m.name}</option>)}
        </select>

        <select
          value={chain}
          onChange={e => setChain(e.target.value)}
          className="px-3 py-1.5 text-sm bg-white border border-gray-200 rounded-lg outline-none focus:border-accent focus:ring-2 focus:ring-accent/10 text-gray-600 transition-all"
        >
          <option value="all">All Chains</option>
          {chains.map(c => {
            const count = stores.filter(s => s.chainId === c.id && (market === 'all' || s.region === market)).length
            if (count === 0) return null
            return <option key={c.id} value={c.id}>{c.name} ({count})</option>
          })}
        </select>

        <select
          value={rep}
          onChange={e => setRep(e.target.value)}
          className="px-3 py-1.5 text-sm bg-white border border-gray-200 rounded-lg outline-none focus:border-accent focus:ring-2 focus:ring-accent/10 text-gray-600 transition-all"
        >
          <option value="all">All Reps</option>
          {allReps.map(r => <option key={r.id} value={r.id}>{r.name}</option>)}
        </select>

        {(market !== 'all' || chain !== 'all' || rep !== 'all' || search) && (
          <button
            onClick={() => { setMarket('all'); setChain('all'); setRep('all'); setSearch('') }}
            className="px-3 py-1.5 text-sm text-gray-400 hover:text-gray-700 transition-colors"
          >
            Clear all
          </button>
        )}

        {filtered.length !== stores.length && (
          <span className="text-xs text-gray-400 ml-auto">{filtered.length} of {stores.length} stores</span>
        )}
      </div>

      {/* TABLE */}
      <div className="bg-white border border-gray-200 rounded-xl overflow-x-auto">
        {filtered.length === 0 ? (
          <div className="py-16 text-center">
            <p className="text-sm text-gray-400">No stores found</p>
          </div>
        ) : (
          <table className="w-full">
            <thead>
              <tr className="border-b border-gray-100 bg-gray-50/50">
                {['Store', 'Chain', 'Region', 'Rep', 'On Shelf', 'Days Supply', 'Status', ''].map(h => (
                  <th key={h} className="px-5 py-3 text-left text-[10px] font-semibold text-gray-400 uppercase tracking-wider whitespace-nowrap">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {filtered.map(s => {
                const daysColor = s.daysOfSupply === null ? 'text-gray-400'
                  : s.daysOfSupply < 7  ? 'text-red-500'
                  : s.daysOfSupply < 10 ? 'text-amber-600'
                  : 'text-green-600'

                return (
                  <tr key={s.id} className="hover:bg-gray-50/70 transition-colors group">

                    {/* Store */}
                    <td className="px-5 py-3.5">
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-lg bg-accent-light flex items-center justify-center flex-shrink-0">
                          <span className="text-xs font-bold text-accent">{s.name.charAt(0)}</span>
                        </div>
                        <div>
                          <Link to={`/stores/${s.id}`} className="text-sm font-medium text-gray-900 hover:text-accent transition-colors">
                            {s.name}
                          </Link>
                          {s.hasAlert && (
                            <p className="text-[10px] text-red-400 font-medium leading-tight">Active alert</p>
                          )}
                        </div>
                      </div>
                    </td>

                    {/* Chain */}
                    <td className="px-5 py-3.5">
                      {s.chainName
                        ? <Link to={`/admin/chains?region=${s.region}`} className="text-[10px] bg-gray-100 text-gray-500 hover:bg-accent-light hover:text-accent px-1.5 py-0.5 rounded-full whitespace-nowrap transition-colors">
                            {s.chainName}
                          </Link>
                        : <span className="text-gray-300 text-sm">—</span>
                      }
                    </td>

                    {/* Region */}
                    <td className="px-5 py-3.5">
                      <Link to="/admin/regions" className="text-[10px] bg-gray-100 text-gray-500 hover:bg-accent-light hover:text-accent px-1.5 py-0.5 rounded-full whitespace-nowrap transition-colors">
                        {s.regionName}
                      </Link>
                    </td>

                    {/* Rep */}
                    <td className="px-5 py-3.5">
                      <span className="text-sm text-gray-500">{s.rep ?? <span className="text-gray-300">—</span>}</span>
                    </td>

                    {/* On Shelf */}
                    <td className="px-5 py-3.5">
                      <span className="text-sm font-semibold tabular-nums text-gray-900">{s.onShelf}</span>
                    </td>

                    {/* Days Supply */}
                    <td className="px-5 py-3.5">
                      <span className={clsx('text-sm font-semibold tabular-nums', daysColor)}>
                        {s.daysOfSupply !== null ? `${s.daysOfSupply}d` : '—'}
                      </span>
                    </td>

                    {/* Status */}
                    <td className="px-5 py-3.5">
                      {s.onShelf <= 3
                        ? <span className="inline-flex items-center gap-1 text-xs font-semibold text-red-500 bg-red-50 px-2 py-0.5 rounded-full">
                            <span className="w-1 h-1 rounded-full bg-red-400" />
                            Critical
                          </span>
                        : s.onShelf === 4
                        ? <span className="inline-flex items-center gap-1 text-xs font-semibold text-amber-600 bg-amber-50 px-2 py-0.5 rounded-full">
                            <span className="w-1 h-1 rounded-full bg-amber-400" />
                            Low
                          </span>
                        : <span className="inline-flex items-center gap-1 text-xs font-semibold text-green-600 bg-green-50 px-2 py-0.5 rounded-full">
                            <span className="w-1 h-1 rounded-full bg-green-400" />
                            Good
                          </span>
                      }
                    </td>

                    {/* Actions */}
                    <td className="px-5 py-3.5">
                      <div className="flex items-center justify-end gap-1">
                        <button onClick={() => navigate(`/stores/${s.id}`)} className="px-2.5 py-1 text-xs font-medium text-gray-500 hover:text-gray-900 hover:bg-gray-100 rounded-md transition-colors">View</button>
                        <button onClick={() => setEditStore(s)} className="px-2.5 py-1 text-xs font-medium text-accent hover:bg-accent-light rounded-md transition-colors">Edit</button>
                        {deleteId === s.id ? (
                          <div className="flex items-center gap-1">
                            <button onClick={() => handleDelete(s.id)} className="px-2.5 py-1 text-xs font-medium text-white bg-red-500 hover:bg-red-600 rounded-md transition-colors">Confirm</button>
                            <button onClick={() => setDeleteId(null)} className="px-2.5 py-1 text-xs font-medium text-gray-500 hover:text-gray-900 hover:bg-gray-100 rounded-md transition-colors">Cancel</button>
                          </div>
                        ) : (
                          <button onClick={() => setDeleteId(s.id)} className="px-2.5 py-1 text-xs font-medium text-red-400 hover:text-red-600 hover:bg-red-50 rounded-md transition-colors">Delete</button>
                        )}
                      </div>
                    </td>

                  </tr>
                )
              })}
            </tbody>
          </table>
        )}
      </div>

      <AddStoreModal
        open={showAdd}
        onClose={() => setShowAdd(false)}
        onAdd={store => {
          if (apiStores) {
            const repId = store.rep ? allReps.find(r => r.name === store.rep)?.id : undefined
            createStore.mutate({ name: store.name, displayName: store.displayName ?? undefined, address: store.address ?? undefined, regionSlug: store.region, chainId: store.chainId ?? undefined, storeNumber: store.storeNumber ?? undefined, repId, latitude: store.latitude ?? undefined, longitude: store.longitude ?? undefined })
          }
        }}
      />
      <EditStoreModal
        store={editStore}
        open={editStore !== null}
        onClose={() => setEditStore(null)}
        onSave={(id, updates) => {
          updateStore.mutate({ id, ...updates }, { onSuccess: () => setEditStore(null) })
        }}
      />
      <ImportModal
        open={showImport}
        onClose={() => setShowImport(false)}
        initialType="stores"
        onSuccess={() => queryClient.invalidateQueries({ queryKey: ['stores'] })}
      />
    </div>
  )
}
