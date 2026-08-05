import { useState, useMemo, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { clsx } from 'clsx'
import { Button } from '@/components/ui/Button'
import { Modal } from '@/components/ui/Modal'
import type { DashboardStore } from '@/types'
import { useRegions, useStores, useCreateRegion, useUpdateRegion, useDeleteRegion } from '@/hooks/useQueries'

interface Region {
  slug:   string
  name:   string
  _count: { stores: number }
}

interface RegionRow extends Region {
  storeCount:  number
  totalShelf:  number
  avgDays:     number | null
  critical:    number
  chainLinks:  { id: string; name: string }[]
}

function buildRows(regions: Region[], allStores: DashboardStore[]): RegionRow[] {
  return regions.map(m => {
    const stores = allStores.filter(s => s.region === m.slug)
    const days   = stores.map(s => s.daysOfSupply).filter((d): d is number => d !== null)
    return {
      ...m,
      storeCount: stores.length,
      totalShelf: stores.reduce((s, r) => s + r.onShelf, 0),
      avgDays:    days.length ? Math.round(days.reduce((a, b) => a + b) / days.length) : null,
      critical:   stores.filter(s => s.daysOfSupply !== null && s.daysOfSupply < 7).length,
      chainLinks: [...new Map(
        stores.filter(s => s.chainId).map(s => [s.chainId!, { id: s.chainId!, name: s.chainName ?? '' }])
      ).values()],
    }
  })
}

export default function AdminRegions() {
  const [showAdd, setShowAdd]         = useState(false)
  const [deleteSlug, setDeleteSlug]   = useState<string | null>(null)
  const [editSlug, setEditSlug]       = useState<string | null>(null)
  const [search, setSearch]           = useState('')

  const { data: apiRegions } = useRegions()
  const { data: apiStores  } = useStores()
  const createRegion = useCreateRegion()
  const updateRegion = useUpdateRegion()
  const deleteRegion = useDeleteRegion()

  const regions   = (apiRegions ?? []) as Region[]
  const allStores = apiStores ?? []

  const rows = useMemo(() => {
    const built = buildRows(regions, allStores)
    if (!search.trim()) return built
    const q = search.toLowerCase()
    return built.filter(r => r.name.toLowerCase().includes(q))
  }, [regions, allStores, search])

  function handleAdd(name: string) {
    createRegion.mutate(name, { onSuccess: () => setShowAdd(false) })
  }

  function handleRename(name: string) {
    if (!editSlug) return
    updateRegion.mutate({ slug: editSlug, name }, { onSuccess: () => setEditSlug(null) })
  }

  function handleDelete(slug: string) {
    deleteRegion.mutate(slug, { onSuccess: () => setDeleteSlug(null) })
  }

  const totalStores = rows.reduce((s, r) => s + r.storeCount, 0)
  const totalShelf  = rows.reduce((s, r) => s + r.totalShelf, 0)

  return (
    <div className="p-4 lg:p-8">

      {/* HEADER */}
      <div className="flex flex-wrap items-start justify-between gap-3 mb-6">
        <div>
          <h1 className="text-xl font-semibold text-gray-900 tracking-tight">Regions</h1>
          <p className="text-sm text-gray-400 mt-0.5">
            {regions.length} regions · {totalStores} stores · {totalShelf} bottles on shelf
          </p>
        </div>
        <Button variant="primary" size="sm" onClick={() => setShowAdd(true)}>
          <svg width="11" height="11" viewBox="0 0 11 11" fill="none">
            <path d="M5.5 1v9M1 5.5h9" stroke="white" strokeWidth="1.6" strokeLinecap="round"/>
          </svg>
          Add Region
        </Button>
      </div>

      {/* SEARCH */}
      <div className="relative max-w-72 mb-5">
        <svg className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" width="14" height="14" viewBox="0 0 14 14" fill="none">
          <circle cx="6" cy="6" r="4.5" stroke="currentColor" strokeWidth="1.4"/>
          <path d="M9.5 9.5L12 12" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/>
        </svg>
        <input
          type="text"
          placeholder="Search regions…"
          value={search}
          onChange={e => setSearch(e.target.value)}
          className="w-full pl-8 pr-3 py-1.5 text-sm bg-white border border-gray-200 rounded-lg outline-none focus:border-accent focus:ring-2 focus:ring-accent/10 transition-all placeholder:text-gray-400"
        />
      </div>

      {/* TABLE */}
      <div className="bg-white border border-gray-200 rounded-xl overflow-x-auto">
        {rows.length === 0 ? (
          <div className="py-16 text-center">
            <p className="text-sm text-gray-400">No regions found</p>
          </div>
        ) : (
          <table className="w-full">
            <thead>
              <tr className="border-b border-gray-100 bg-gray-50/50">
                {['Region', 'Stores', 'Chains', 'On Shelf', 'Avg Days Supply', 'Critical', ''].map(h => (
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
                  <tr key={row.slug} className="hover:bg-gray-50/70 transition-colors group">

                    <td className="px-5 py-3.5">
                      <Link to={`/admin/chains?region=${row.slug}`} className="flex items-center gap-3 group/name">
                        <div className="w-8 h-8 rounded-lg bg-accent-light flex items-center justify-center flex-shrink-0">
                          <span className="text-xs font-bold text-accent">{row.name.charAt(0)}</span>
                        </div>
                        <p className="text-sm font-medium text-gray-900 group-hover/name:text-accent transition-colors">{row.name}</p>
                      </Link>
                    </td>

                    <td className="px-5 py-3.5 text-sm tabular-nums">
                      <Link to={`/admin/stores?region=${row.slug}`} className="text-gray-700 hover:text-accent transition-colors font-medium">
                        {row.storeCount}
                      </Link>
                    </td>

                    <td className="px-5 py-3.5">
                      <div className="flex flex-wrap gap-1">
                        {row.chainLinks.length === 0
                          ? <span className="text-gray-300 text-sm">—</span>
                          : row.chainLinks.map(c => (
                              <Link
                                key={c.id}
                                to={`/admin/chains?region=${row.slug}`}
                                className="text-[10px] bg-gray-100 text-gray-500 hover:bg-accent-light hover:text-accent px-1.5 py-0.5 rounded-full whitespace-nowrap transition-colors"
                              >
                                {c.name}
                              </Link>
                            ))
                        }
                      </div>
                    </td>

                    <td className="px-5 py-3.5 text-sm font-semibold tabular-nums text-gray-900">
                      {row.totalShelf}
                    </td>

                    <td className="px-5 py-3.5">
                      <span className={clsx('text-sm font-semibold tabular-nums', avgColor)}>
                        {row.avgDays !== null ? `${row.avgDays}d` : '—'}
                      </span>
                    </td>

                    <td className="px-5 py-3.5">
                      {row.critical > 0
                        ? <span className="inline-flex items-center gap-1 text-xs font-semibold text-red-500 bg-red-50 px-2 py-0.5 rounded-full">
                            <span className="w-1 h-1 rounded-full bg-red-400" />
                            {row.critical} critical
                          </span>
                        : <span className="text-gray-300 text-sm">—</span>
                      }
                    </td>

                    <td className="px-5 py-3.5">
                      <div className="flex items-center justify-end gap-2">
                        <button
                          onClick={() => setEditSlug(row.slug)}
                          className="px-2.5 py-1 text-xs font-medium text-accent hover:bg-accent-light rounded-md transition-colors"
                        >
                          Edit
                        </button>
                        {deleteSlug === row.slug ? (
                          <div className="flex items-center gap-1">
                            <button onClick={() => handleDelete(row.slug)} className="px-2.5 py-1 text-xs font-medium text-white bg-red-500 hover:bg-red-600 rounded-md transition-colors">Confirm</button>
                            <button onClick={() => setDeleteSlug(null)} className="px-2.5 py-1 text-xs font-medium text-gray-500 hover:text-gray-900 hover:bg-gray-100 rounded-md transition-colors">Cancel</button>
                          </div>
                        ) : (
                          <button onClick={() => setDeleteSlug(row.slug)} className="px-2.5 py-1 text-xs font-medium text-red-400 hover:text-red-600 hover:bg-red-50 rounded-md transition-colors">Delete</button>
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

      <AddRegionModal
        open={showAdd}
        existingSlugs={regions.map(m => m.slug)}
        onClose={() => setShowAdd(false)}
        onAdd={handleAdd}
        pending={createRegion.isPending}
      />
      <RenameRegionModal
        open={editSlug !== null}
        initialName={regions.find(m => m.slug === editSlug)?.name ?? ''}
        onClose={() => setEditSlug(null)}
        onRename={handleRename}
        pending={updateRegion.isPending}
      />
    </div>
  )
}

// ─── Add Region Modal ─────────────────────────────────────────────────────────

function AddRegionModal({
  open, existingSlugs, onClose, onAdd, pending,
}: {
  open: boolean
  existingSlugs: string[]
  onClose: () => void
  onAdd: (name: string) => void
  pending?: boolean
}) {
  const [name, setName]   = useState('')
  const [error, setError] = useState('')

  const slug = name.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!name.trim()) { setError('Region name is required'); return }
    if (existingSlugs.includes(slug)) { setError('A region with this name already exists'); return }
    onAdd(name.trim())
  }

  function handleClose() {
    setName(''); setError(''); onClose()
  }

  return (
    <Modal open={open} onClose={handleClose} title="Add Region" subtitle="Add a new geographic region to the distribution network" width="sm">
      <form onSubmit={handleSubmit} noValidate>
        <div className="px-6 py-5 space-y-4">
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1.5">
              Region Name<span className="text-red-400 ml-0.5">*</span>
            </label>
            <input
              type="text"
              value={name}
              onChange={e => { setName(e.target.value); setError('') }}
              placeholder="e.g. Fort Worth, Lubbock…"
              className={clsx(
                'w-full px-3 py-2 text-sm bg-white border rounded-lg outline-none transition-all placeholder:text-gray-400',
                'focus:border-accent focus:ring-2 focus:ring-accent/10',
                error ? 'border-red-300' : 'border-gray-200',
              )}
              autoFocus
            />
            {error && <p className="mt-1 text-xs text-red-500">{error}</p>}
          </div>
          <p className="text-xs text-gray-400">
            Stores can be assigned to this region once it's created.
          </p>
        </div>
        <div className="px-6 py-4 border-t border-gray-100 flex justify-end gap-2 bg-gray-50/50 rounded-b-2xl">
          <Button type="button" variant="ghost" size="sm" onClick={handleClose}>Cancel</Button>
          <Button type="submit" variant="primary" size="sm" disabled={pending}>{pending ? 'Adding…' : 'Add Region'}</Button>
        </div>
      </form>
    </Modal>
  )
}

// ─── Rename Region Modal ──────────────────────────────────────────────────────

function RenameRegionModal({
  open, initialName, onClose, onRename, pending,
}: {
  open: boolean; initialName: string; onClose: () => void; onRename: (name: string) => void; pending?: boolean
}) {
  const [name, setName]   = useState(initialName)
  const [error, setError] = useState('')

  useEffect(() => { if (open) { setName(initialName); setError('') } }, [open, initialName])

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!name.trim()) { setError('Region name is required'); return }
    onRename(name.trim())
  }

  return (
    <Modal open={open} onClose={onClose} title="Rename Region" width="sm">
      <form onSubmit={handleSubmit} noValidate>
        <div className="px-6 py-5">
          <label className="block text-xs font-medium text-gray-600 mb-1.5">
            Region Name<span className="text-red-400 ml-0.5">*</span>
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
