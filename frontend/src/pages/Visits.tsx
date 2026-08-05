import { useState, useMemo } from 'react'
import { Link } from 'react-router-dom'
import { clsx } from 'clsx'
import { Button } from '@/components/ui/Button'
import { LogVisitModal } from '@/components/stores/LogVisitModal'
import { EventModal } from '@/components/events/EventModal'
import type { StoreVisit, VisitAction } from '@/types'
import type { DashboardStore, Event } from '@/types'
import type { ApiVisit } from '@/lib/api'
import { toast } from '@/components/ui/Toast'
import { useVisits, useStores, useRegions, useCreateVisit, useUpdateVisit, useDeleteVisit, useCreateEvent, useUpdateEvent } from '@/hooks/useQueries'
import { SortIcon } from '@/components/ui/SortIcon'
import { exportVisits } from '@/lib/exportVisits'

// ─── types ────────────────────────────────────────────────────────────────────

interface VisitRow {
  id:           string
  date:         string
  repId:        string
  rep:          string
  onShelf:      number
  action?:      VisitAction | null
  logType?:     string | null
  notes:        string
  contactId?:   string
  contactName?: string
  storeId:      string
  storeName:    string
  region:       string
  regionName:   string
  chainId:      string
  chainName:    string
  // Not shown in the table, but carried so the CSV export is complete.
  bottlesSold?:     number | null
  hoursWorked?:     number | null
  takeaways?:       string | null
  accomplishments?: string | null
}

// ─── constants ────────────────────────────────────────────────────────────────

const ACTION_META: Record<VisitAction, { label: string; color: string; bg: string }> = {
  'stocked':        { label: 'Stocked',        color: 'text-green-700', bg: 'bg-green-50'      },
  'checked':        { label: 'Checked',         color: 'text-blue-600',  bg: 'bg-blue-50'       },
  'order-placed':   { label: 'Order Placed',    color: 'text-accent',    bg: 'bg-accent-light'  },
  'issue-reported': { label: 'Issue Reported',  color: 'text-red-600',   bg: 'bg-red-50'        },
}

const LOGTYPE_META: Record<string, { label: string; color: string; bg: string }> = {
  'visit':   { label: 'Visit',   color: 'text-blue-600', bg: 'bg-blue-50'     },
  'tasting': { label: 'Tasting', color: 'text-accent',   bg: 'bg-accent-light' },
}

type ActionFilter = 'all' | VisitAction
type SortCol      = 'date' | 'store' | 'market' | 'rep' | 'onShelf' | 'action'

const ACTION_FILTERS: { value: ActionFilter | 'all'; label: string }[] = [
  { value: 'all',            label: 'All'           },
  { value: 'stocked',        label: 'Stocked'       },
  { value: 'checked',        label: 'Checked'       },
  { value: 'order-placed',   label: 'Order Placed'  },
  { value: 'issue-reported', label: 'Issues'        },
]

// ─── page ─────────────────────────────────────────────────────────────────────

export default function Visits() {
  const [showLogVisit, setShowLogVisit]         = useState(false)
  const [showSchedule, setShowSchedule]         = useState(false)
  const [editingVisit, setEditingVisit]         = useState<ApiVisit | null>(null)
  const [deleteId, setDeleteId]                 = useState<string | null>(null)
  const [activeMarket, setActiveMarket]         = useState('all')
  const [activeChain, setActiveChain]           = useState('all')
  const [actionFilter, setActionFilter]         = useState<ActionFilter>('all')
  const [repFilter, setRepFilter]               = useState('all')
  const [search, setSearch]                     = useState('')
  const [sort, setSort]                         = useState<{ col: SortCol; dir: 'asc' | 'desc' }>({ col: 'date', dir: 'desc' })


  // Filtering and sorting are done client-side over the whole set, so the page
  // needs more than the API's default 100. That cap also made the "N entries"
  // count in the header wrong, and would have silently truncated the CSV export.
  const { data: apiVisits, dataUpdatedAt } = useVisits({ limit: '2000' })
  const { data: apiStores  } = useStores()
  const { data: apiMarkets } = useRegions()
  const createVisit = useCreateVisit()
  const updateVisit = useUpdateVisit()
  const deleteVisit = useDeleteVisit()
  const createEvent = useCreateEvent()
  const updateEvent = useUpdateEvent()

  const allStores = apiStores  ?? []
  const markets   = apiMarkets ?? []

  const allVisits = useMemo<VisitRow[]>(() =>
    (apiVisits ?? []).map(v => {
      const store = allStores.find(s => s.id === v.storeId)
      return {
        id:          v.id,
        date:        v.date,
        repId:       v.repId,
        rep:         v.rep,
        onShelf:     v.onShelf,
        action:      v.action  ?? null,
        logType:     v.logType ?? null,
        notes:       v.notes   ?? '',
        contactId:   v.contactId   ?? undefined,
        contactName: v.contactName ?? undefined,
        storeId:     v.storeId,
        storeName:   v.storeName,
        region:      v.region,
        regionName:  store?.regionName ?? v.region,
        chainId:     store?.chainId    ?? '',
        chainName:   store?.chainName  ?? '',
        bottlesSold:     v.bottlesSold     ?? null,
        hoursWorked:     v.hoursWorked     ?? null,
        takeaways:       v.takeaways       ?? null,
        accomplishments: v.accomplishments ?? null,
      }
    }).sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
  , [apiVisits, allStores])

  const marketVisits = useMemo(() =>
    activeMarket === 'all' ? allVisits : allVisits.filter(v => v.region === activeMarket)
  , [allVisits, activeMarket])

  const allReps = useMemo(() => {
    const names = new Set<string>()
    allVisits.forEach(v => (v.rep ?? '').split(', ').forEach(r => r.trim() && names.add(r.trim())))
    return [...names].sort()
  }, [allVisits])

  const chainOptions = useMemo(() => {
    const seen = new Map<string, string>()
    const source = activeMarket === 'all' ? allStores : allStores.filter(s => s.region === activeMarket)
    source.forEach(s => { if (s.chainId && s.chainName) seen.set(s.chainId, s.chainName) })
    return [...seen.entries()].map(([id, name]) => ({ id, name })).sort((a, b) => a.name.localeCompare(b.name))
  }, [allStores, activeMarket])

  const filtered = useMemo(() => {
    let rows = activeChain === 'all' ? marketVisits : marketVisits.filter(v => v.chainId === activeChain)

    if (actionFilter !== 'all')
      rows = rows.filter(v => v.action != null && v.action === actionFilter)

    if (repFilter !== 'all')
      rows = rows.filter(v => (v.rep ?? '').split(', ').map(r => r.trim()).includes(repFilter))

    if (search.trim()) {
      const q = search.toLowerCase()
      rows = rows.filter(v =>
        v.storeName.toLowerCase().includes(q) ||
        (v.rep ?? '').toLowerCase().includes(q) ||
        v.notes.toLowerCase().includes(q)
      )
    }

    return [...rows].sort((a, b) => {
      let av: string | number = ''
      let bv: string | number = ''
      switch (sort.col) {
        case 'date':    av = a.date;       bv = b.date;       break
        case 'store':   av = a.storeName;  bv = b.storeName;  break
        case 'market':  av = a.regionName; bv = b.regionName; break
        case 'rep':     av = a.rep;        bv = b.rep;        break
        case 'onShelf': av = a.onShelf;    bv = b.onShelf;    break
        case 'action':  av = a.action ?? ''; bv = b.action ?? ''; break
      }
      if (av < bv) return sort.dir === 'asc' ? -1 : 1
      if (av > bv) return sort.dir === 'asc' ?  1 : -1
      return 0
    })
  }, [marketVisits, actionFilter, repFilter, search, sort, activeChain])

  function toggleSort(col: SortCol) {
    setSort(prev =>
      prev.col === col
        ? { col, dir: prev.dir === 'asc' ? 'desc' : 'asc' }
        : { col, dir: col === 'date' ? 'desc' : 'asc' }
    )
  }

  const COLS: { key: SortCol; label: string; align?: 'right' }[] = [
    { key: 'date',    label: 'Date'       },
    { key: 'store',   label: 'Store'      },
    { key: 'market',  label: 'Market'     },
    { key: 'rep',     label: 'Rep'        },
    { key: 'onShelf', label: 'On Shelf', align: 'right' },
    { key: 'action',  label: 'Type'       },
  ]

  return (
    <div className="p-4 lg:p-8">

      {/* HEADER */}
      <div className="flex flex-wrap items-start justify-between gap-3 mb-6">
        <div>
          <h1 className="text-xl font-semibold text-gray-900 tracking-tight">Visit Log</h1>
          <p className="text-sm text-gray-400 mt-0.5">
            {allVisits.length} entries · {allStores.length} stores · Texas
            {dataUpdatedAt > 0 && (
              <span className="ml-2 text-[11px] text-gray-300">
                · updated {new Date(dataUpdatedAt).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}
              </span>
            )}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="ghost"
            size="sm"
            disabled={filtered.length === 0}
            onClick={() => {
              exportVisits(filtered)
              toast(`Exported ${filtered.length} visit${filtered.length === 1 ? '' : 's'}`, 'success')
            }}
          >
            <svg width="12" height="12" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.4">
              <path d="M2 10v2a1 1 0 001 1h8a1 1 0 001-1v-2M7 2v7M4.5 6.5L7 9l2.5-2.5" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
            Export
          </Button>
          <Button variant="ghost" size="sm" onClick={() => setShowSchedule(true)}>
            + Schedule
          </Button>
          <Button variant="primary" size="sm" onClick={() => setShowLogVisit(true)}>
            + Log
          </Button>
        </div>
      </div>

      {/* SEARCH + FILTERS */}
      <div className="flex items-center gap-3 mb-5 flex-wrap">

        {/* Search */}
        <div className="relative max-w-72">
          <svg className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" width="14" height="14" viewBox="0 0 14 14" fill="none">
            <circle cx="6" cy="6" r="4.5" stroke="currentColor" strokeWidth="1.4"/>
            <path d="M9.5 9.5L12 12" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/>
          </svg>
          <input
            type="text"
            placeholder="Search stores, reps, notes…"
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
          value={activeMarket}
          onChange={e => { setActiveMarket(e.target.value); setActiveChain('all') }}
          className="px-3 py-1.5 text-sm bg-white border border-gray-200 rounded-lg outline-none focus:border-accent focus:ring-2 focus:ring-accent/10 text-gray-600 transition-all"
        >
          <option value="all">All Regions</option>
          {markets.map(m => <option key={m.slug} value={m.slug}>{m.name}</option>)}
        </select>

        <select
          value={activeChain}
          onChange={e => setActiveChain(e.target.value)}
          className="px-3 py-1.5 text-sm bg-white border border-gray-200 rounded-lg outline-none focus:border-accent focus:ring-2 focus:ring-accent/10 text-gray-600 transition-all"
        >
          <option value="all">All Chains</option>
          {chainOptions.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>

        <select
          value={repFilter}
          onChange={e => setRepFilter(e.target.value)}
          className="px-3 py-1.5 text-sm bg-white border border-gray-200 rounded-lg outline-none focus:border-accent focus:ring-2 focus:ring-accent/10 text-gray-600 transition-all"
        >
          <option value="all">All Reps</option>
          {allReps.map(r => <option key={r} value={r}>{r}</option>)}
        </select>

        {/* Action filter */}
        <div className="flex items-center gap-0.5 bg-white border border-gray-200 rounded-lg p-0.5">
          {ACTION_FILTERS.map(f => (
            <button
              key={f.value}
              onClick={() => setActionFilter(f.value)}
              className={clsx(
                'px-3 py-1 rounded-[6px] text-xs font-medium transition-all',
                actionFilter === f.value
                  ? 'bg-accent text-white shadow-sm'
                  : 'text-gray-500 hover:text-gray-800 hover:bg-gray-50'
              )}
            >
              {f.label}
            </button>
          ))}
        </div>

        {/* Active filter clear */}
        {(search || activeMarket !== 'all' || activeChain !== 'all' || repFilter !== 'all' || actionFilter !== 'all') && (
          <button
            onClick={() => { setSearch(''); setActiveMarket('all'); setActiveChain('all'); setRepFilter('all'); setActionFilter('all') }}
            className="text-xs font-medium text-accent hover:underline"
          >
            Clear all filters
          </button>
        )}

      </div>

      {/* TABLE */}
      <div className="bg-white border border-gray-200 rounded-xl overflow-x-auto">
        {filtered.length === 0 ? (
          <div className="py-16 text-center">
            <p className="text-sm font-medium text-gray-500">No entries match your filters</p>
            <button
              onClick={() => { setSearch(''); setActionFilter('all'); setRepFilter('all'); setActiveMarket('all') }}
              className="mt-2 text-xs text-accent hover:underline"
            >
              Clear filters
            </button>
          </div>
        ) : (
          <table className="w-full min-w-[700px]">
            <thead>
              <tr className="border-b border-gray-100 bg-gray-50/50">
                {COLS.map(col => (
                  <th
                    key={col.key}
                    onClick={() => toggleSort(col.key)}
                    className={clsx(
                      'px-5 py-3 text-[10px] font-semibold text-gray-400 uppercase tracking-wider cursor-pointer select-none hover:text-gray-600 transition-colors whitespace-nowrap',
                      col.align === 'right' ? 'text-right' : 'text-left'
                    )}
                  >
                    {col.label}
                    <SortIcon active={sort.col === col.key} dir={sort.dir} />
                  </th>
                ))}
                <th className="px-5 py-3 text-left text-[10px] font-semibold text-gray-400 uppercase tracking-wider">
                  Notes
                </th>
                <th className="px-5 py-3 w-40" />
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {filtered.map(v => {
                const meta = v.action
                  ? ACTION_META[v.action]
                  : (v.logType ? LOGTYPE_META[v.logType] : null)
                return (
                  <tr
                    key={v.id}
                    className="hover:bg-gray-100 transition-colors group cursor-pointer"
                    onClick={() => {
                      const av = apiVisits?.find(a => a.id === v.id)
                      if (av) setEditingVisit(av)
                    }}
                  >

                    {/* Date */}
                    <td className="px-5 py-3.5 whitespace-nowrap">
                      <p className="text-sm text-gray-700">
                        {new Date(v.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                      </p>
                      <p className="text-[10px] text-gray-400 mt-0.5">{daysAgo(v.date)}</p>
                    </td>

                    {/* Store */}
                    <td className="px-5 py-3.5">
                      <Link to={`/stores/${v.storeId}`} onClick={e => e.stopPropagation()} className="flex items-center gap-2.5 group/link">
                        <div className="w-7 h-7 rounded-lg bg-accent-light flex items-center justify-center flex-shrink-0">
                          <span className="text-[10px] font-bold text-accent">{v.storeName.charAt(0)}</span>
                        </div>
                        <span className="text-sm font-medium text-gray-900 group-hover/link:text-accent transition-colors">
                          {v.storeName}
                        </span>
                      </Link>
                    </td>

                    {/* Market */}
                    <td className="px-5 py-3.5">
                      <span className="text-sm text-gray-500">{v.regionName}</span>
                    </td>

                    {/* Rep */}
                    <td className="px-5 py-3.5">
                      <div className="flex items-center gap-1.5">
                        <div className="w-5 h-5 rounded-full bg-gray-100 flex items-center justify-center flex-shrink-0">
                          <span className="text-[8px] font-bold text-gray-500">
                            {(v.rep ?? '').split(' ').map(n => n[0]).join('').slice(0, 2)}
                          </span>
                        </div>
                        <span className="text-sm text-gray-500">{v.rep}</span>
                      </div>
                    </td>

                    {/* On Shelf */}
                    <td className="px-5 py-3.5 text-right">
                      <span className="text-sm font-semibold tabular-nums text-gray-900">{v.onShelf}</span>
                      <span className="text-[10px] text-gray-400 ml-1">btl</span>
                    </td>

                    {/* Action */}
                    <td className="px-5 py-3.5">
                      {meta && (
                        <span className={clsx('inline-flex text-[10px] font-semibold px-2 py-0.5 rounded-full', meta.bg, meta.color)}>
                          {meta.label}
                        </span>
                      )}
                    </td>

                    {/* Notes */}
                    <td className="px-5 py-3.5 max-w-xs">
                      <p className="text-xs text-gray-400 truncate">{v.notes}</p>
                    </td>

                    {/* Actions */}
                    <td className="px-5 py-3.5">
                      <div className="flex items-center justify-end gap-1">
                        {deleteId === v.id ? (
                          <>
                            <button
                              onClick={e => {
                                e.stopPropagation()
                                deleteVisit.mutate({ id: v.id, storeId: v.storeId }, {
                                  onSuccess: () => { toast('Log deleted'); setDeleteId(null) },
                                  onError:   (err: Error) => toast(err.message, 'error'),
                                })
                              }}
                              className="px-2.5 py-1 text-xs font-medium text-white bg-red-500 hover:bg-red-600 rounded-md transition-colors"
                            >
                              Confirm
                            </button>
                            <button
                              onClick={e => { e.stopPropagation(); setDeleteId(null) }}
                              className="px-2.5 py-1 text-xs font-medium text-gray-500 hover:text-gray-900 hover:bg-gray-100 rounded-md transition-colors"
                            >
                              Cancel
                            </button>
                          </>
                        ) : (
                          <>
                            <button
                              onClick={e => {
                                e.stopPropagation()
                                const av = apiVisits?.find(a => a.id === v.id)
                                if (av) setEditingVisit(av)
                              }}
                              className="px-2.5 py-1 text-xs font-medium text-accent hover:bg-accent-light rounded-md transition-colors"
                            >
                              Edit
                            </button>
                            <button
                              onClick={e => { e.stopPropagation(); setDeleteId(v.id) }}
                              className="px-2.5 py-1 text-xs font-medium text-red-400 hover:text-red-600 hover:bg-red-50 rounded-md transition-colors"
                            >
                              Delete
                            </button>
                          </>
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

      <LogVisitModal
        open={showLogVisit}
        onClose={() => setShowLogVisit(false)}
        stores={allStores}
        onSave={(data) => {
          const store = allStores.find(s => s.id === data.storeId)
          createVisit.mutate(data, {
            onSuccess: () => toast(`Visit logged for ${store?.name ?? 'store'}`),
            onError:   (err: Error) => toast(err.message, 'error'),
          })
        }}
        onCloseEvent={(eventId, data) => {
          updateEvent.mutate(
            { id: eventId, status: 'completed', completionNotes: data.notes,
              hoursWorked: data.hoursWorked, takeaways: data.takeaways, accomplishments: data.accomplishments,
              bottlesSold: data.bottlesSold ?? null },
            { onSuccess: () => toast('Private event closed out') },
          )
        }}
      />

      <LogVisitModal
        open={!!editingVisit}
        onClose={() => setEditingVisit(null)}
        stores={allStores}
        store={allStores.find(s => s.id === editingVisit?.storeId)}
        editVisit={editingVisit ?? undefined}
        onSave={() => {}}
        onUpdate={(id, body) => {
          updateVisit.mutate({ id, body: body as Parameters<typeof updateVisit.mutate>[0]['body'] }, {
            onSuccess: () => { toast('Log updated'); setEditingVisit(null) },
            onError:   (err: Error) => toast(err.message, 'error'),
          })
        }}
      />

      <EventModal
        open={showSchedule}
        onClose={() => setShowSchedule(false)}
        onSave={(ev: Omit<Event, 'id' | 'status' | 'completionNotes' | 'visitId'>) => {
          createEvent.mutate(
            {
              storeId:     ev.storeId,
              type:        ev.type,
              scheduledAt: ev.scheduledAt,
              endTime:     ev.endTime ?? undefined,
              repIds:      ev.reps.map(r => r.id),
              notes:       ev.notes ?? undefined,
              contactId:   ev.contactId ?? undefined,
            },
            {
              onSuccess: () => {
                toast(`Event scheduled at ${ev.storeName}`)
                setShowSchedule(false)
              },
            },
          )
        }}
      />

    </div>
  )
}

// ─── helpers ──────────────────────────────────────────────────────────────────

function daysAgo(iso: string) {
  const diff = Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000)
  if (diff === 0) return 'Today'
  if (diff === 1) return 'Yesterday'
  if (diff < 0)  return `In ${Math.abs(diff)}d`
  return `${diff}d ago`
}

