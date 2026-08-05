import { useState, useMemo, useEffect } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { clsx } from 'clsx'
import { Button } from '@/components/ui/Button'
import { Modal } from '@/components/ui/Modal'
import { ImportModal } from '@/components/import/ImportModal'
import { ChainPortalCard } from '@/components/chains/ChainPortalCard'
import { useUser } from '@clerk/clerk-react'
import type { Chain, DashboardStore } from '@/types'
import { useChains, useStores, useCreateChain, useUpdateChain, useDeleteChain } from '@/hooks/useQueries'
import { useQueryClient } from '@tanstack/react-query'

// ─── per-chain stats ──────────────────────────────────────────────────────────

interface ChainRow extends Chain {
  storeCount:  number
  totalShelf:  number
  avgDays:     number | null
  critical:    number
  marketLinks: { slug: string; name: string }[]
}

function buildRows(chains: Chain[], allStores: DashboardStore[]): ChainRow[] {
  return chains.map(c => {
    const stores = allStores.filter(s => s.chainId === c.id)
    const days   = stores.map(s => s.daysOfSupply).filter((d): d is number => d !== null)
    return {
      ...c,
      storeCount:  stores.length,
      totalShelf:  stores.reduce((s, r) => s + r.onShelf, 0),
      avgDays:     days.length ? Math.round(days.reduce((a, b) => a + b) / days.length) : null,
      critical:    stores.filter(s => s.daysOfSupply !== null && s.daysOfSupply < 7).length,
      marketLinks: [...new Map(stores.map(s => [s.region, { slug: s.region, name: s.regionName }])).values()],
    }
  })
}

// ─── page ─────────────────────────────────────────────────────────────────────

export default function AdminChains() {
  const [searchParams] = useSearchParams()
  const regionParam = searchParams.get('region') ?? ''

  const [showAdd, setShowAdd]       = useState(false)
  const [showImport, setShowImport] = useState(false)
  const [deleteId, setDeleteId]     = useState<string | null>(null)
  const [editId, setEditId]         = useState<string | null>(null)
  const [qrChainId, setQrChainId]   = useState<string | null>(null)

  // The route is already behind RequireAdmin, but the QR panel mints a
  // credential — check the role here too rather than trusting routing alone.
  const { user } = useUser()
  const isAdmin  = (user?.publicMetadata as { role?: string })?.role === 'admin'
  const [search, setSearch]         = useState('')
  const queryClient = useQueryClient()

  const { data: apiChains } = useChains()
  const { data: apiStores } = useStores()
  const createChain = useCreateChain()
  const updateChain = useUpdateChain()
  const deleteChain = useDeleteChain()

  const chains    = apiChains ?? []
  const allStores = apiStores ?? []

  const rows = useMemo(() => {
    let built = buildRows(chains as Chain[], allStores)
    if (regionParam) built = built.filter(r => r.marketLinks.some(m => m.slug === regionParam))
    if (!search.trim()) return built
    const q = search.toLowerCase()
    return built.filter(r => r.name.toLowerCase().includes(q))
  }, [chains, allStores, search, regionParam])

  function handleAdd(name: string) {
    createChain.mutate(name, { onSuccess: () => setShowAdd(false) })
  }

  function handleRename(name: string) {
    if (!editId) return
    updateChain.mutate({ id: editId, name }, { onSuccess: () => setEditId(null) })
  }

  function handleDelete(id: string) {
    deleteChain.mutate(id, { onSuccess: () => setDeleteId(null) })
  }

  const totalStores = rows.reduce((s, r) => s + r.storeCount, 0)
  const totalShelf  = rows.reduce((s, r) => s + r.totalShelf, 0)

  return (
    <div className="p-4 lg:p-8">

      {/* HEADER */}
      <div className="flex flex-wrap items-start justify-between gap-3 mb-6">
        <div>
          <h1 className="text-xl font-semibold text-gray-900 tracking-tight">Chains</h1>
          <p className="text-sm text-gray-400 mt-0.5">
            {chains.length} chains · {totalStores} stores · {totalShelf} bottles on shelf
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
            Add Chain
          </Button>
        </div>
      </div>

      {/* REGION FILTER INDICATOR */}
      {regionParam && (
        <div className="flex items-center gap-2 mb-4 px-3 py-2 bg-accent-light border border-accent/20 rounded-lg max-w-fit">
          <span className="text-xs text-accent font-medium">
            Filtered: chains in {allStores.find(s => s.region === regionParam)?.regionName ?? regionParam}
          </span>
          <Link to="/admin/chains" className="text-xs text-accent/70 hover:text-accent underline">Clear</Link>
        </div>
      )}

      {/* SEARCH */}
      <div className="relative max-w-72 mb-5">
        <svg className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" width="14" height="14" viewBox="0 0 14 14" fill="none">
          <circle cx="6" cy="6" r="4.5" stroke="currentColor" strokeWidth="1.4"/>
          <path d="M9.5 9.5L12 12" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/>
        </svg>
        <input
          type="text"
          placeholder="Search chains…"
          value={search}
          onChange={e => setSearch(e.target.value)}
          className="w-full pl-8 pr-3 py-1.5 text-sm bg-white border border-gray-200 rounded-lg outline-none focus:border-accent focus:ring-2 focus:ring-accent/10 transition-all placeholder:text-gray-400"
        />
      </div>

      {/* CHAIN TABLE */}
      <div className="bg-white border border-gray-200 rounded-xl overflow-x-auto">
        {rows.length === 0 ? (
          <div className="py-16 text-center">
            <p className="text-sm text-gray-400">No chains found</p>
          </div>
        ) : (
          <table className="w-full">
            <thead>
              <tr className="border-b border-gray-100 bg-gray-50/50">
                {['Chain', 'Stores', 'Regions', 'On Shelf', 'Avg Days Supply', 'Critical', 'Actions'].map(h => (
                  <th key={h} className="px-5 py-3 text-left text-[10px] font-semibold text-gray-400 uppercase tracking-wider whitespace-nowrap">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {rows.map(row => {
                const avgColor = row.avgDays === null ? 'text-gray-400'
                  : row.avgDays < 7 ? 'text-red-500' : row.avgDays < 10 ? 'text-amber-600' : 'text-green-600'

                return (
                  <tr key={row.id} className="hover:bg-gray-50/70 transition-colors group">

                    {/* Chain */}
                    <td className="px-5 py-3.5">
                      <Link to={`/admin/stores?chain=${row.id}`} className="flex items-center gap-3 group/name">
                        <div className="w-8 h-8 rounded-lg bg-accent-light flex items-center justify-center flex-shrink-0">
                          <span className="text-xs font-bold text-accent">{row.name.charAt(0)}</span>
                        </div>
                        <span className="text-sm font-medium text-gray-900 group-hover/name:text-accent transition-colors">{row.name}</span>
                      </Link>
                    </td>

                    {/* Stores */}
                    <td className="px-5 py-3.5 text-sm tabular-nums">
                      <Link to={`/admin/stores?chain=${row.id}`} className="text-gray-700 hover:text-accent transition-colors font-medium">
                        {row.storeCount}
                      </Link>
                    </td>

                    {/* Regions */}
                    <td className="px-5 py-3.5">
                      <div className="flex flex-wrap gap-1">
                        {row.marketLinks.length === 0
                          ? <span className="text-gray-300 text-sm">—</span>
                          : row.marketLinks.map(m => (
                              <Link
                                key={m.slug}
                                to="/admin/regions"
                                className="text-[10px] bg-gray-100 text-gray-500 hover:bg-accent-light hover:text-accent px-1.5 py-0.5 rounded-full whitespace-nowrap transition-colors"
                              >
                                {m.name}
                              </Link>
                            ))
                        }
                      </div>
                    </td>

                    {/* On Shelf */}
                    <td className="px-5 py-3.5 text-sm font-semibold tabular-nums text-gray-900">
                      {row.totalShelf}
                    </td>

                    {/* Avg Days */}
                    <td className="px-5 py-3.5">
                      <span className={clsx('text-sm font-semibold tabular-nums', avgColor)}>
                        {row.avgDays !== null ? `${row.avgDays}d` : '—'}
                      </span>
                    </td>

                    {/* Critical */}
                    <td className="px-5 py-3.5">
                      {row.critical > 0
                        ? <span className="inline-flex items-center gap-1 text-xs font-semibold text-red-500 bg-red-50 px-2 py-0.5 rounded-full">
                            <span className="w-1 h-1 rounded-full bg-red-400" />
                            {row.critical} critical
                          </span>
                        : <span className="text-gray-300 text-sm">—</span>
                      }
                    </td>

                    {/* Actions */}
                    <td className="px-5 py-3.5">
                      <div className="flex items-center justify-end gap-2">
                        <button
                          onClick={() => setQrChainId(row.id)}
                          className="px-2.5 py-1 text-xs font-medium text-gray-500 hover:text-accent hover:bg-accent-light rounded-md transition-colors"
                        >
                          QR code
                        </button>
                        <button
                          onClick={() => setEditId(row.id)}
                          className="px-2.5 py-1 text-xs font-medium text-accent hover:bg-accent-light rounded-md transition-colors"
                        >
                          Edit
                        </button>
                        {deleteId === row.id ? (
                          <div className="flex items-center gap-1">
                            <button onClick={() => handleDelete(row.id)} className="px-2.5 py-1 text-xs font-medium text-white bg-red-500 hover:bg-red-600 rounded-md transition-colors">Confirm</button>
                            <button onClick={() => setDeleteId(null)} className="px-2.5 py-1 text-xs font-medium text-gray-500 hover:text-gray-900 hover:bg-gray-100 rounded-md transition-colors">Cancel</button>
                          </div>
                        ) : (
                          <button onClick={() => setDeleteId(row.id)} className="px-2.5 py-1 text-xs font-medium text-red-400 hover:text-red-600 hover:bg-red-50 rounded-md transition-colors">Delete</button>
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

      {/* Chain-level QR: handed to an HQ buyer rather than left in one store */}
      <Modal
        open={qrChainId !== null}
        onClose={() => setQrChainId(null)}
        title="Chain QR Code"
        subtitle="Share with the chain's buyer so they can request product for any location"
        width="sm"
      >
        {qrChainId && (
          <ChainPortalCard
            chainId={qrChainId}
            chainName={chains.find(c => c.id === qrChainId)?.name ?? ''}
            isAdmin={isAdmin}
          />
        )}
      </Modal>

      <AddChainModal open={showAdd} onClose={() => setShowAdd(false)} onAdd={handleAdd} pending={createChain.isPending} />
      <RenameChainModal
        open={editId !== null}
        initialName={chains.find(c => c.id === editId)?.name ?? ''}
        onClose={() => setEditId(null)}
        onRename={handleRename}
        pending={updateChain.isPending}
      />
      <ImportModal
        open={showImport}
        onClose={() => setShowImport(false)}
        initialType="chains"
        onSuccess={() => queryClient.invalidateQueries({ queryKey: ['chains'] })}
      />
    </div>
  )
}

// ─── Add Chain Modal ──────────────────────────────────────────────────────────

function AddChainModal({
  open, onClose, onAdd, pending,
}: {
  open: boolean
  onClose: () => void
  onAdd: (name: string) => void
  pending?: boolean
}) {
  const [name, setName]   = useState('')
  const [error, setError] = useState('')

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!name.trim()) { setError('Chain name is required'); return }
    onAdd(name.trim())
  }

  function handleClose() {
    setName(''); setError(''); onClose()
  }

  return (
    <Modal open={open} onClose={handleClose} title="Add Chain" subtitle="Add a new retail chain to the distribution network" width="sm">
      <form onSubmit={handleSubmit} noValidate>
        <div className="px-6 py-5">
          <label className="block text-xs font-medium text-gray-600 mb-1.5">
            Chain Name<span className="text-red-400 ml-0.5">*</span>
          </label>
          <input
            type="text"
            value={name}
            onChange={e => { setName(e.target.value); setError('') }}
            placeholder="e.g. Total Wine, Goody Goody…"
            className={clsx(
              'w-full px-3 py-2 text-sm bg-white border rounded-lg outline-none transition-all placeholder:text-gray-400',
              'focus:border-accent focus:ring-2 focus:ring-accent/10',
              error ? 'border-red-300' : 'border-gray-200',
            )}
            autoFocus
          />
          {error && <p className="mt-1 text-xs text-red-500">{error}</p>}
          <p className="mt-2 text-xs text-gray-400">
            Stores can be added to this chain once it's created.
          </p>
        </div>
        <div className="px-6 py-4 border-t border-gray-100 flex justify-end gap-2 bg-gray-50/50 rounded-b-2xl">
          <Button type="button" variant="ghost" size="sm" onClick={handleClose}>Cancel</Button>
          <Button type="submit" variant="primary" size="sm" disabled={pending}>{pending ? 'Adding…' : 'Add Chain'}</Button>
        </div>
      </form>
    </Modal>
  )
}

// ─── Rename Chain Modal ───────────────────────────────────────────────────────

function RenameChainModal({
  open, initialName, onClose, onRename, pending,
}: {
  open: boolean; initialName: string; onClose: () => void; onRename: (name: string) => void; pending?: boolean
}) {
  const [name, setName]   = useState(initialName)
  const [error, setError] = useState('')

  useEffect(() => { if (open) { setName(initialName); setError('') } }, [open, initialName])

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!name.trim()) { setError('Chain name is required'); return }
    onRename(name.trim())
  }

  return (
    <Modal open={open} onClose={onClose} title="Rename Chain" width="sm">
      <form onSubmit={handleSubmit} noValidate>
        <div className="px-6 py-5">
          <label className="block text-xs font-medium text-gray-600 mb-1.5">
            Chain Name<span className="text-red-400 ml-0.5">*</span>
          </label>
          <input
            type="text"
            value={name}
            onChange={e => { setName(e.target.value); setError('') }}
            className={clsx(
              'w-full px-3 py-2 text-sm bg-white border rounded-lg outline-none transition-all placeholder:text-gray-400',
              'focus:border-accent focus:ring-2 focus:ring-accent/10',
              error ? 'border-red-300' : 'border-gray-200',
            )}
            autoFocus
          />
          {error && <p className="mt-1 text-xs text-red-500">{error}</p>}
        </div>
        <div className="px-6 py-4 border-t border-gray-100 flex justify-end gap-2 bg-gray-50/50 rounded-b-2xl">
          <Button type="button" variant="ghost" size="sm" onClick={onClose}>Cancel</Button>
          <Button type="submit" variant="primary" size="sm" disabled={pending}>{pending ? 'Saving…' : 'Save'}</Button>
        </div>
      </form>
    </Modal>
  )
}
