import { useState, useMemo } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { clsx } from 'clsx'
import { Button } from '@/components/ui/Button'
import { Modal } from '@/components/ui/Modal'
import { AddRepModal } from '@/components/admin/AddRepModal'
import { Rep } from '@/types'
import { useReps, useStores, useRegions, useCreateRep, useUpdateRep, useDeleteRep, useClerkUsers, useInviteUser } from '@/hooks/useQueries'
import { toast } from '@/components/ui/Toast'
import { RepDetailModal } from '@/components/admin/RepDetailModal'
import { EditRepModal } from '@/components/admin/EditRepModal'

export default function AdminReps() {
  const [searchParams] = useSearchParams()

  const [showAdd, setShowAdd]       = useState(false)
  const [search, setSearch]         = useState('')
  const [market, setMarket]         = useState(searchParams.get('region') ?? 'all')
  const [deleteId, setDeleteId]     = useState<string | null>(null)
  const [linkRepId, setLinkRepId]   = useState<string | null>(null)
  const [viewRepId, setViewRepId]   = useState<string | null>(null)
  const [editRepId, setEditRepId]   = useState<string | null>(null)
  const [invitedIds, setInvitedIds] = useState<Set<string>>(new Set())

  const { data: apiReps       } = useReps()
  const { data: apiStores     } = useStores()
  const { data: apiMarkets    } = useRegions()
  const { data: clerkUsers = [] } = useClerkUsers()
  const createRep  = useCreateRep()
  const updateRep  = useUpdateRep()
  const deleteRep  = useDeleteRep()
  const inviteUser = useInviteUser()

  const reps      = apiReps    ?? []
  const allStores = apiStores  ?? []
  const markets   = apiMarkets ?? []

  const storeCounts = useMemo(() =>
    allStores.reduce((acc, s) => {
      if (s.repId) acc[s.repId] = (acc[s.repId] ?? 0) + 1
      return acc
    }, {} as Record<string, number>)
  , [allStores])

  const filtered = useMemo(() => {
    let rows = reps
    if (market !== 'all') rows = rows.filter(r => r.region === market)
    if (search.trim()) {
      const q = search.toLowerCase()
      rows = rows.filter(r =>
        r.name.toLowerCase().includes(q) ||
        r.email.toLowerCase().includes(q) ||
        r.regionName.toLowerCase().includes(q)
      )
    }
    return rows
  }, [reps, market, search])

  function toggleStatus(id: string) {
    const rep = reps.find(r => r.id === id)
    if (!rep) return
    updateRep.mutate({ id, status: rep.status === 'active' ? 'inactive' : 'active' })
  }

  function handleDelete(id: string) {
    deleteRep.mutate(id, { onSuccess: () => setDeleteId(null) })
  }

  return (
    <div className="p-4 lg:p-8">

      {/* HEADER */}
      <div className="flex flex-wrap items-start justify-between gap-3 mb-6">
        <div>
          <h1 className="text-xl font-semibold text-gray-900 tracking-tight">Reps</h1>
          <p className="text-sm text-gray-400 mt-0.5">
            {reps.length} reps · {new Set(reps.filter(r => r.status === 'active').map(r => r.region)).size} regions covered
          </p>
        </div>
        <Button variant="primary" size="sm" onClick={() => setShowAdd(true)}>
          <svg width="11" height="11" viewBox="0 0 11 11" fill="none">
            <path d="M5.5 1v9M1 5.5h9" stroke="white" strokeWidth="1.6" strokeLinecap="round"/>
          </svg>
          Add Rep
        </Button>
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
            placeholder="Search reps…"
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
          onChange={e => setMarket(e.target.value)}
          className="px-3 py-1.5 text-sm bg-white border border-gray-200 rounded-lg outline-none focus:border-accent focus:ring-2 focus:ring-accent/10 text-gray-600 transition-all"
        >
          <option value="all">All Regions</option>
          {markets.map(m => {
            const count = reps.filter(r => r.region === m.slug).length
            if (count === 0) return null
            return <option key={m.slug} value={m.slug}>{m.name} ({count})</option>
          })}
        </select>

        {(market !== 'all' || search) && (
          <button
            onClick={() => { setMarket('all'); setSearch('') }}
            className="px-3 py-1.5 text-sm text-gray-400 hover:text-gray-700 transition-colors"
          >
            Clear all
          </button>
        )}

        {filtered.length !== reps.length && (
          <span className="text-xs text-gray-400 ml-auto">{filtered.length} of {reps.length} reps</span>
        )}
      </div>

      {/* TABLE */}
      <div className="bg-white border border-gray-200 rounded-xl overflow-x-auto">
        {filtered.length === 0 ? (
          <div className="py-16 text-center">
            <p className="text-sm text-gray-400">No reps found</p>
          </div>
        ) : (
          <table className="w-full">
            <thead>
              <tr className="border-b border-gray-100 bg-gray-50/50">
                {['Rep', 'Region', 'Stores', 'Linked User', 'Status', ''].map(h => (
                  <th key={h} className="px-5 py-3 text-left text-[10px] font-semibold text-gray-400 uppercase tracking-wider whitespace-nowrap">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {filtered.map(rep => {
                const stores  = storeCounts[rep.id] ?? 0
                const isActive = rep.status === 'active'

                return (
                  <tr key={rep.id} className={clsx('hover:bg-gray-50/70 transition-colors group', !isActive && 'opacity-60')}>

                    {/* Rep */}
                    <td className="px-5 py-3.5">
                      <div className="flex items-center gap-3">
                        <div className={clsx(
                          'w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0',
                          isActive ? 'bg-accent-light' : 'bg-gray-100'
                        )}>
                          <span className={clsx('text-xs font-bold', isActive ? 'text-accent' : 'text-gray-400')}>
                            {rep.name.split(' ').map(n => n[0]).join('').slice(0, 2)}
                          </span>
                        </div>
                        <div>
                          <button
                            onClick={() => setViewRepId(rep.id)}
                            className="text-sm font-medium text-gray-900 hover:text-accent transition-colors leading-tight text-left"
                          >
                            {rep.name}
                          </button>
                          <p className="text-xs text-gray-400 mt-0.5">{rep.email}</p>
                          {rep.phone && (
                            <a
                              href={`tel:${rep.phone}`}
                              className="inline-flex items-center gap-1 text-[11px] text-accent hover:underline mt-0.5"
                            >
                              <svg width="10" height="10" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
                                <path d="M2 3a1 1 0 011-1h2.5a1 1 0 011 1l.5 2.5a1 1 0 01-.3.9L5.4 7.1c.9 1.8 2.7 3.6 4.5 4.5l.7-1.3a1 1 0 01.9-.3l2.5.5a1 1 0 011 1V14a1 1 0 01-1 1h-1C6.4 15 1 9.6 1 3V2a1 1 0 011-1h.5"/>
                              </svg>
                              {rep.phone}
                            </a>
                          )}
                        </div>
                      </div>
                    </td>

                    {/* Region */}
                    <td className="px-5 py-3.5">
                      <Link
                        to="/admin/regions"
                        className="text-[10px] bg-gray-100 text-gray-500 hover:bg-accent-light hover:text-accent px-1.5 py-0.5 rounded-full whitespace-nowrap transition-colors"
                      >
                        {rep.regionName}
                      </Link>
                    </td>

                    {/* Stores */}
                    <td className="px-5 py-3.5">
                      <Link
                        to={`/admin/stores?rep=${rep.id}`}
                        className="text-sm font-medium text-gray-900 hover:text-accent transition-colors tabular-nums"
                      >
                        {stores}
                      </Link>
                      <span className="text-xs text-gray-400 ml-1">store{stores !== 1 ? 's' : ''}</span>
                    </td>

                    {/* Linked User */}
                    <td className="px-5 py-3.5">
                      {rep.clerkUserId ? (
                        <div className="flex items-center gap-2">
                          <span className="text-xs text-gray-700">
                            {clerkUsers.find(u => u.id === rep.clerkUserId)?.name ?? 'Linked'}
                          </span>
                          <button
                            onClick={() => updateRep.mutate({ id: rep.id, clerkUserId: null }, { onSuccess: () => toast('User unlinked') })}
                            className="text-[10px] text-gray-400 hover:text-red-500 transition-colors"
                            title="Unlink"
                          >
                            ✕
                          </button>
                        </div>
                      ) : (
                        <div className="flex items-center gap-2">
                          {invitedIds.has(rep.id) ? (
                            <span className="text-xs text-green-600 font-medium">Invite sent</span>
                          ) : (
                            <button
                              onClick={() => {
                                inviteUser.mutate(rep.email, {
                                  onSuccess: () => {
                                    setInvitedIds(prev => new Set(prev).add(rep.id))
                                    toast(`Invite sent to ${rep.email}`)
                                  },
                                })
                              }}
                              disabled={inviteUser.isPending}
                              className="text-xs text-accent hover:underline disabled:opacity-50"
                            >
                              Send invite
                            </button>
                          )}
                          <span className="text-gray-200 text-xs">|</span>
                          <button
                            onClick={() => setLinkRepId(rep.id)}
                            className="text-xs text-gray-400 hover:text-gray-700 hover:underline"
                          >
                            Link user
                          </button>
                        </div>
                      )}
                    </td>

                    {/* Status */}
                    <td className="px-5 py-3.5">
                      <span className={clsx(
                        'inline-flex items-center gap-1.5 text-xs font-medium px-2 py-0.5 rounded-full',
                        isActive ? 'bg-green-50 text-green-700' : 'bg-gray-100 text-gray-500'
                      )}>
                        <span className={clsx('w-1.5 h-1.5 rounded-full', isActive ? 'bg-green-500' : 'bg-gray-400')} />
                        {isActive ? 'Active' : 'Inactive'}
                      </span>
                    </td>

                    {/* Actions */}
                    <td className="px-5 py-3.5">
                      <div className="flex items-center justify-end gap-1">
                        <button
                          onClick={() => setViewRepId(rep.id)}
                          className="px-2.5 py-1 text-xs font-medium text-gray-500 hover:text-gray-900 hover:bg-gray-100 rounded-md transition-colors"
                        >
                          View
                        </button>
                        <button
                          onClick={() => setEditRepId(rep.id)}
                          className="px-2.5 py-1 text-xs font-medium text-accent hover:bg-accent-light rounded-md transition-colors"
                        >
                          Edit
                        </button>
                        <button
                          onClick={() => toggleStatus(rep.id)}
                          className="px-2.5 py-1 text-xs font-medium text-gray-500 hover:text-gray-900 hover:bg-gray-100 rounded-md transition-colors"
                        >
                          {isActive ? 'Deactivate' : 'Reactivate'}
                        </button>
                        {deleteId === rep.id ? (
                          <div className="flex items-center gap-1">
                            <button onClick={() => handleDelete(rep.id)} className="px-2.5 py-1 text-xs font-medium text-white bg-red-500 hover:bg-red-600 rounded-md transition-colors">Confirm</button>
                            <button onClick={() => setDeleteId(null)} className="px-2.5 py-1 text-xs font-medium text-gray-500 hover:text-gray-900 hover:bg-gray-100 rounded-md transition-colors">Cancel</button>
                          </div>
                        ) : (
                          <button onClick={() => setDeleteId(rep.id)} className="px-2.5 py-1 text-xs font-medium text-red-400 hover:text-red-600 hover:bg-red-50 rounded-md transition-colors">Delete</button>
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

      <AddRepModal
        open={showAdd}
        onClose={() => setShowAdd(false)}
        onAdd={rep => {
          if (apiReps) {
            createRep.mutate({
              name: rep.name, email: rep.email, phone: rep.phone ?? undefined,
              regionSlug: rep.region, status: rep.status,
              allRegions: rep.allRegions, markets: rep.markets,
            })
          }
        }}
      />

      <RepDetailModal
        rep={reps.find(r => r.id === viewRepId) ?? null}
        stores={allStores.filter(s => s.repId === viewRepId)}
        onClose={() => setViewRepId(null)}
        onUpdatePhone={phone => {
          if (!viewRepId) return
          updateRep.mutate({ id: viewRepId, phone: phone || null }, { onSuccess: () => toast('Phone updated') })
        }}
      />

      <EditRepModal
        rep={reps.find(r => r.id === editRepId) ?? null}
        open={editRepId !== null}
        onClose={() => setEditRepId(null)}
        onSave={(id, updates) => {
          updateRep.mutate({ id, ...updates }, {
            onSuccess: () => { toast('Rep updated'); setEditRepId(null) },
          })
        }}
      />

      <LinkUserModal
        open={linkRepId !== null}
        onClose={() => setLinkRepId(null)}
        clerkUsers={clerkUsers}
        linkedUserIds={reps.map(r => r.clerkUserId).filter(Boolean) as string[]}
        onLink={clerkUserId => {
          if (!linkRepId) return
          updateRep.mutate(
            { id: linkRepId, clerkUserId },
            { onSuccess: () => { toast('User linked to rep'); setLinkRepId(null) } }
          )
        }}
      />
    </div>
  )
}

function LinkUserModal({ open, onClose, clerkUsers, linkedUserIds, onLink }: {
  open: boolean
  onClose: () => void
  clerkUsers: { id: string; name: string; email: string }[]
  linkedUserIds: string[]
  onLink: (clerkUserId: string) => void
}) {
  const [selected, setSelected] = useState('')
  const available = clerkUsers.filter(u => !linkedUserIds.includes(u.id))

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!selected) return
    onLink(selected)
    setSelected('')
  }

  return (
    <Modal open={open} onClose={onClose} title="Link Clerk User" subtitle="Connect a login account to this rep" width="sm">
      <form onSubmit={handleSubmit}>
        <div className="px-6 py-5">
          {available.length === 0 ? (
            <p className="text-sm text-gray-400">All Clerk users are already linked to a rep.</p>
          ) : (
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1.5">Select user</label>
              <select
                value={selected}
                onChange={e => setSelected(e.target.value)}
                className="w-full px-3 py-2 text-sm bg-white border border-gray-200 rounded-lg outline-none focus:border-accent focus:ring-2 focus:ring-accent/10 transition-all"
              >
                <option value="" disabled>Choose a user…</option>
                {available.map(u => (
                  <option key={u.id} value={u.id}>{u.name} — {u.email}</option>
                ))}
              </select>
              <p className="mt-1.5 text-xs text-gray-400">
                Only users not already linked to another rep are shown.
              </p>
            </div>
          )}
        </div>
        <div className="px-6 py-4 border-t border-gray-100 flex justify-end gap-2 bg-gray-50/50 rounded-b-2xl">
          <Button type="button" variant="ghost" size="sm" onClick={onClose}>Cancel</Button>
          <Button type="submit" variant="primary" size="sm" disabled={!selected}>Link User</Button>
        </div>
      </form>
    </Modal>
  )
}
