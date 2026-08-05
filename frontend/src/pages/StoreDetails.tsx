import { useState, useEffect, useMemo } from 'react'
import { useParams, Link } from 'react-router-dom'
import { clsx } from 'clsx'
import {
  ComposedChart, Area, Bar,
  XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid,
} from 'recharts'
import MapGL, { Marker } from 'react-map-gl/mapbox'
import { useUser } from '@clerk/clerk-react'
import { Button } from '@/components/ui/Button'
import { EditStoreModal } from '@/components/stores/EditStoreModal'
import { StorePortalCard } from '@/components/stores/StorePortalCard'
import { alertMeta } from '@/lib/alertMeta'
import { buildInventoryTrend } from '@/lib/inventoryTrend'
import { StatusPill, SupplyBar, statusVariant, statusColor, statusBarColor } from '@/components/ui/SupplyIndicator'
import { LogVisitModal } from '@/components/stores/LogVisitModal'
import { AllVisitsModal } from '@/components/stores/AllVisitsModal'
import type { StoreVisit, StoreOrder, VisitAction } from '@/types'
import { AddContactModal } from '@/components/contacts/AddContactModal'
import { EventModal, EVENT_TYPE_META } from '@/components/events/EventModal'
import type { Contact, Event } from '@/types'
import type { DashboardStore } from '@/types'
import type { ApiVisit } from '@/lib/api'
import { toast } from '@/components/ui/Toast'
import { useStore, useUpdateStore, useCreateVisit, useUpdateVisit, useDeleteVisit, useEvents, useCreateEvent, useUpdateEvent, useAlerts, useCreateContact, useDeleteOrder, useSetStoreStatus } from '@/hooks/useQueries'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '@/lib/api'

const MAPBOX_TOKEN = import.meta.env.VITE_MAPBOX_TOKEN

// ─── helpers ────────────────────────────────────────────────────────────────

function fmt(iso: string, opts?: Intl.DateTimeFormatOptions) {
  return new Date(iso).toLocaleDateString('en-US', opts ?? { month: 'short', day: 'numeric', year: 'numeric' })
}

function fmtShort(iso: string) {
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

function daysAgo(iso: string) {
  const diff = Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000)
  if (diff === 0) return 'Today'
  if (diff === 1) return 'Yesterday'
  return `${diff}d ago`
}

function timeAgo(iso: string) {
  const secs = Math.floor((Date.now() - new Date(iso).getTime()) / 1000)
  if (secs < 60)  return 'just now'
  const mins = Math.floor(secs / 60)
  if (mins < 60)  return `${mins}m ago`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24)   return `${hrs}h ago`
  const days = Math.floor(hrs / 24)
  return `${days}d ago`
}

const ACTION_META: Record<VisitAction, { label: string; color: string; bg: string }> = {
  'stocked':        { label: 'Stocked',       color: 'text-green-700', bg: 'bg-green-50'  },
  'checked':        { label: 'Checked',        color: 'text-blue-600',  bg: 'bg-blue-50'   },
  'order-placed':   { label: 'Order placed',   color: 'text-accent',    bg: 'bg-accent-light' },
  'issue-reported': { label: 'Issue reported', color: 'text-red-600',   bg: 'bg-red-50'    },
}

const LOGTYPE_META: Record<string, { label: string; color: string; bg: string }> = {
  'visit':   { label: 'Visit',   color: 'text-blue-600', bg: 'bg-blue-50'     },
  'tasting': { label: 'Tasting', color: 'text-accent',   bg: 'bg-accent-light' },
}

const EVENT_STATUS_META: Record<Event['status'], { label: string; bg: string; text: string; dot: string }> = {
  scheduled: { label: 'Scheduled', bg: 'bg-accent-light', text: 'text-accent',    dot: 'bg-accent'    },
  completed: { label: 'Completed', bg: 'bg-green-50',     text: 'text-green-700', dot: 'bg-green-500' },
  cancelled: { label: 'Cancelled', bg: 'bg-gray-100',     text: 'text-gray-500',  dot: 'bg-gray-400'  },
}

const ORDER_STATUS_META: Record<StoreOrder['status'], { label: string; color: string; bg: string; dot: string }> = {
  'delivered':  { label: 'Delivered',  color: 'text-green-700', bg: 'bg-green-50',  dot: 'bg-green-500'  },
  'in-transit': { label: 'In transit', color: 'text-blue-600',  bg: 'bg-blue-50',   dot: 'bg-blue-400'   },
  'pending':    { label: 'Pending',    color: 'text-gray-500',  bg: 'bg-gray-100',  dot: 'bg-gray-400'   },
}

// ─── page ───────────────────────────────────────────────────────────────────

export default function StoreDetails() {
  const { id } = useParams<{ id: string }>()
  const { user } = useUser()
  const isAdmin = (user?.publicMetadata as { role?: string })?.role === 'admin'
  const [confirmDeactivate, setConfirmDeactivate] = useState(false)
  const setStoreStatus = useSetStoreStatus()

  const { data: apiStoreDetail } = useStore(id)
  const { data: storeEventsData = [] } = useEvents(id ? { storeId: id } : undefined)
  const { data: storeAlertsData = [] }   = useAlerts(id ? { storeId: id, status: 'OPEN' } : undefined)
  const createVisit   = useCreateVisit()
  const updateVisit   = useUpdateVisit()
  const deleteVisit   = useDeleteVisit()
  const createEvent   = useCreateEvent()
  const updateEvent   = useUpdateEvent()
  const createContact = useCreateContact()
  const updateStore   = useUpdateStore()

  const qc = useQueryClient()
  const deployMutation = useMutation({
    mutationFn: (body: { quantity: number; storeId: string; notes?: string }) => api.addDeployment(body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['inventory'] })
      qc.invalidateQueries({ queryKey: ['inventory-log'] })
    },
  })

  const [showDeploy, setShowDeploy]     = useState(false)
  const [deployQty, setDeployQty]       = useState('')
  const [deployNotes, setDeployNotes]   = useState('')

  const [showLogVisit, setShowLogVisit]               = useState(false)
  const [showAllVisits, setShowAllVisits]             = useState(false)
  const [editingVisit, setEditingVisit]               = useState<ApiVisit | null>(null)
  const [deleteVisitId, setDeleteVisitId]             = useState<string | null>(null)

  useEffect(() => {
    if (!deleteVisitId) return
    function onKey(e: KeyboardEvent) { if (e.key === 'Escape') setDeleteVisitId(null) }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [deleteVisitId])
  const [showAddContact, setShowAddContact]           = useState(false)
  const [showScheduleEvent, setShowScheduleEvent] = useState(false)
  const [editingEvent, setEditingEvent]               = useState<Event | null>(null)
  const [showEditStore, setShowEditStore]             = useState(false)
  const [showMoreActions, setShowMoreActions]         = useState(false)
  const [deleteOrderId, setDeleteOrderId]             = useState<string | null>(null)
  const deleteOrder = useDeleteOrder()
  const [newVisits, setNewVisits]                     = useState<StoreVisit[]>([])
  const [onShelfOverride, setOnShelfOverride]         = useState<number | null>(null)
  const [lastVisitOverride, setLastVisitOverride]     = useState<string | null | undefined>(undefined)
  const [newContacts, setNewContacts]                 = useState<Contact[]>([])

  const store = apiStoreDetail as DashboardStore | undefined

  const apiVisits   = apiStoreDetail?.visits   ?? null
  const apiOrders   = apiStoreDetail?.orders   ?? null
  const apiContacts = apiStoreDetail?.contacts ?? null

  const visits   = useMemo(() => {
    // Once the store query refetches, the just-logged visit comes back in
    // apiVisits — drop the optimistic copy so it isn't rendered twice.
    const apiIds = new Set((apiVisits ?? []).map(v => v.id))
    return [
    ...newVisits.filter(nv => !apiIds.has(nv.id)),
    ...(apiVisits ?? []).map(v => ({
      id:             v.id,
      date:           v.date,
      rep:            v.rep,
      onShelf:        v.onShelf,
      action:         v.action        ?? undefined,
      logType:        v.logType       ?? undefined,
      notes:          v.notes         ?? '',
      visitType:      'visit' as const,
      contactId:      v.contactId     ?? undefined,
      contactName:    v.contactName   ?? undefined,
      bottlesSold:    v.bottlesSold   ?? undefined,
      takeaways:      v.takeaways     ?? undefined,
      accomplishments: v.accomplishments ?? undefined,
      hoursWorked:    v.hoursWorked   ?? undefined,
    } as StoreVisit)),
    ].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
  }, [newVisits, apiVisits])

  // Both rep visits and automated stock syncs are observations of the same
  // thing — what's on the shelf — so the trend uses both. Using visits alone
  // left synced stores (Goody Goody) drawing a few stale points while a far
  // denser series sat unused in the Stock Sync Log below.
  const trend = useMemo(() => buildInventoryTrend([
    ...visits.map(v => ({ date: v.date, onShelf: v.onShelf })),
    ...(apiStoreDetail?.stockSyncs ?? []).map(s => ({ date: s.syncedAt, onShelf: s.onShelf })),
  ]), [visits, apiStoreDetail?.stockSyncs])

  if (!store) {
    return (
      <div className="p-8 text-center py-24">
        <p className="text-sm font-medium text-gray-500">Loading…</p>
      </div>
    )
  }

  const orders   = (apiOrders  ?? []) as StoreOrder[]
  const contacts = [...newContacts, ...(apiContacts ?? [])] as Contact[]

  const onShelf   = onShelfOverride  !== null        ? onShelfOverride  : store.onShelf
  const lastVisit = lastVisitOverride !== undefined  ? lastVisitOverride : store.lastVisit

  const storeAlerts = storeAlertsData
  const storeEvents = storeEventsData.filter(ev => ev.status !== 'cancelled')

  const variant        = statusVariant(store.daysOfSupply, store.onShelf)
  const weeklyVelocity = store.depletionRate != null ? +(store.depletionRate * 7).toFixed(1) : null

  function handleSaveVisit(data: Parameters<typeof createVisit.mutate>[0]) {
    createVisit.mutate(data, {
      onSuccess: (saved) => {
        setNewVisits(prev => [{
          id:             saved.id,
          date:           saved.date,
          rep:            saved.rep,
          onShelf:        saved.onShelf,
          action:         saved.action  ?? undefined,
          logType:        saved.logType ?? undefined,
          notes:          saved.notes   ?? '',
          visitType:      'visit' as const,
          contactId:      saved.contactId   ?? undefined,
          contactName:    saved.contactName ?? undefined,
          bottlesSold:    saved.bottlesSold ?? undefined,
          takeaways:      saved.takeaways   ?? undefined,
          accomplishments: saved.accomplishments ?? undefined,
          hoursWorked:    saved.hoursWorked ?? undefined,
        }, ...prev])
        // Only refresh the header's current shelf count / last-visit date when
        // this is the latest visit by date. A back-dated backfill is historical
        // and leaves the store's current state untouched (matches the backend).
        const newestExisting = visits.reduce((max, v) => Math.max(max, new Date(v.date).getTime()), 0)
        if (new Date(saved.date).getTime() >= newestExisting) {
          setOnShelfOverride(saved.onShelf)
          setLastVisitOverride(saved.date)
        }
        toast(`Visit logged for ${store.name}`)
      },
      onError: (err: Error) => toast(err.message, 'error'),
    })
  }

  function handleDeleteVisit(visitId: string) {
    deleteVisit.mutate({ id: visitId, storeId: id }, {
      onSuccess: () => {
        setNewVisits(prev => prev.filter(nv => nv.id !== visitId))
        // Drop optimistic header overrides so the refetched store state
        // (rolled back server-side) shows through.
        setOnShelfOverride(null)
        setLastVisitOverride(undefined)
        toast('Log deleted')
      },
      onError: (err: Error) => toast(err.message, 'error'),
    })
  }

  function handleSaveContact(c: Contact) {
    createContact.mutate(
      {
        name:     c.name,
        role:     c.role     ?? undefined,
        phone:    c.phone    ?? undefined,
        email:    c.email    ?? undefined,
        chainId:  c.chainId  ?? undefined,
        storeIds: c.storeIds.length ? c.storeIds : [store!.id],
        notes:    c.notes    ?? undefined,
      },
      {
        onSuccess: (saved) => setNewContacts(prev => [saved, ...prev]),
        onError:   (err: Error) => toast(err.message, 'error'),
      }
    )
  }

  const secondaryActions = [
    {
      key: 'deploy', label: 'Deploy Cases', onClick: () => setShowDeploy(d => !d),
      icon: (
        <svg width="11" height="11" viewBox="0 0 12 12" fill="none">
          <path d="M6 1v7M3 5l3 3 3-3" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"/>
          <path d="M1 10h10" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/>
        </svg>
      ),
    },
    {
      key: 'edit', label: 'Edit Store', onClick: () => setShowEditStore(true),
      icon: (
        <svg width="11" height="11" viewBox="0 0 12 12" fill="none">
          <path d="M8.5 1.5l2 2L4 10H2V8l6.5-6.5z" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round"/>
        </svg>
      ),
    },
  ]

  return (
    <div className="p-4 lg:p-8">

      {/* BREADCRUMB */}
      <nav className="flex items-center gap-2 text-sm mb-6">
        <Link
          to={store.chainId ? `/stores?chain=${store.chainId}` : '/stores?chain=independent'}
          className="text-gray-400 hover:text-gray-600 transition-colors flex items-center gap-1"
        >
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
            <path d="M9 2L4 7l5 5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
          {store.chainName ?? 'Independent Stores'}
        </Link>
        <span className="text-gray-300">/</span>
        <span className="text-gray-600 font-medium">{store.name}</span>
      </nav>

      {/* HEADER */}
      <div className="flex flex-wrap items-start justify-between gap-3 mb-6">
        <div className="flex items-start gap-4">
          <div className="w-12 h-12 rounded-xl bg-accent-light flex items-center justify-center flex-shrink-0">
            <span className="text-lg font-bold text-accent">{store.name.charAt(0)}</span>
          </div>
          <div>
            <div className="flex items-center gap-2.5 flex-wrap">
              <h1 className="text-xl font-semibold text-gray-900 tracking-tight">{store.name}</h1>
              <StatusPill days={store.daysOfSupply} onShelf={store.onShelf} />
              {store.status === 'inactive' && (
                <span className="inline-flex items-center gap-1 bg-gray-100 text-gray-500 text-[10px] font-semibold px-2 py-0.5 rounded-full">
                  <span className="w-1 h-1 rounded-full bg-gray-400" />
                  Inactive
                </span>
              )}
              {store.hasAlert && store.status !== 'inactive' && (
                <span className="inline-flex items-center gap-1 bg-red-50 text-red-500 text-[10px] font-semibold px-2 py-0.5 rounded-full">
                  <span className="w-1 h-1 rounded-full bg-red-400" />
                  Active alert
                </span>
              )}
            </div>
            <p className="text-sm text-gray-400 mt-1">
              {[store.chainName, `${store.regionName} Region`, store.rep].filter(Boolean).join(' · ')}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2 w-full sm:w-auto">
          {/* Secondary actions — inline on desktop, in overflow menu on mobile */}
          <div className="hidden sm:flex items-center gap-2">
            {secondaryActions.map(a => (
              <Button key={a.key} variant="ghost" size="sm" onClick={a.onClick}>
                {a.icon}
                {a.label}
              </Button>
            ))}
          </div>

          {/* Mobile overflow menu */}
          <div className="relative sm:hidden">
            <Button variant="ghost" size="sm" onClick={() => setShowMoreActions(v => !v)}>
              <svg width="12" height="12" viewBox="0 0 12 12" fill="currentColor">
                <circle cx="2" cy="6" r="1.1"/>
                <circle cx="6" cy="6" r="1.1"/>
                <circle cx="10" cy="6" r="1.1"/>
              </svg>
              More
            </Button>
            {showMoreActions && (
              <>
                <div className="fixed inset-0 z-10" onClick={() => setShowMoreActions(false)} />
                <div className="absolute left-0 top-full mt-1 z-20 min-w-[180px] bg-white border border-gray-200 rounded-xl shadow-lg py-1">
                  {secondaryActions.map(a => (
                    <button
                      key={a.key}
                      onClick={() => { setShowMoreActions(false); a.onClick() }}
                      className="w-full flex items-center gap-2 px-3.5 py-2 text-sm text-gray-600 hover:bg-gray-50 hover:text-gray-900 text-left"
                    >
                      {a.icon}
                      {a.label}
                    </button>
                  ))}
                </div>
              </>
            )}
          </div>

          {/* Primary CTAs — always visible */}
          <Button variant="secondary" size="sm" className="ml-auto sm:ml-0" onClick={() => setShowScheduleEvent(true)}>
            <svg width="11" height="11" viewBox="0 0 12 12" fill="none">
              <rect x="1" y="2" width="10" height="9" rx="1.5" stroke="currentColor" strokeWidth="1.4"/>
              <path d="M4 1v2M8 1v2M1 5h10" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/>
            </svg>
            + Schedule
          </Button>
          <Button variant="primary" size="sm" onClick={() => setShowLogVisit(true)}>
            + Log
          </Button>
        </div>
      </div>

      {/* DEPLOY CASES INLINE FORM */}
      {showDeploy && (
        <div className="bg-white border border-gray-200 rounded-xl px-5 py-4 mb-5">
          <p className="text-xs text-gray-400 mb-3">
            Record cases delivered to <span className="font-medium text-gray-700">{store.name}</span>
          </p>
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs text-gray-400">Cases</span>
            <input
              type="number" min="1" autoFocus placeholder="0"
              value={deployQty} onChange={e => setDeployQty(e.target.value)}
              onKeyDown={e => {
                if (e.key === 'Enter') {
                  const n = parseInt(deployQty, 10)
                  if (n > 0 && id) {
                    deployMutation.mutate({ quantity: n, storeId: id, notes: deployNotes || undefined }, {
                      onSuccess: () => { toast(`${n} cases deployed to ${store.name}`); setShowDeploy(false); setDeployQty(''); setDeployNotes('') },
                      onError:   (err: Error) => toast(err.message, 'error'),
                    })
                  }
                }
                if (e.key === 'Escape') { setShowDeploy(false); setDeployQty(''); setDeployNotes('') }
              }}
              className="w-20 px-2.5 py-1 text-sm border border-gray-200 rounded-lg outline-none focus:border-accent tabular-nums"
            />
            <input
              type="text" placeholder="Notes (optional)"
              value={deployNotes} onChange={e => setDeployNotes(e.target.value)}
              className="w-44 px-2.5 py-1 text-xs border border-gray-200 rounded-lg outline-none focus:border-accent text-gray-600 placeholder-gray-300"
            />
            <button
              disabled={!deployQty || parseInt(deployQty, 10) <= 0 || deployMutation.isPending}
              onClick={() => {
                const n = parseInt(deployQty, 10)
                if (n > 0 && id) {
                  deployMutation.mutate({ quantity: n, storeId: id, notes: deployNotes || undefined }, {
                    onSuccess: () => { toast(`${n} cases deployed to ${store.name}`); setShowDeploy(false); setDeployQty(''); setDeployNotes('') },
                    onError:   (err: Error) => toast(err.message, 'error'),
                  })
                }
              }}
              className="px-3 py-1 text-xs font-medium bg-accent text-white rounded-lg hover:bg-accent/90 disabled:opacity-40 transition-colors"
            >
              {deployMutation.isPending ? 'Saving…' : 'Deploy'}
            </button>
            <button
              onClick={() => { setShowDeploy(false); setDeployQty(''); setDeployNotes('') }}
              className="text-xs text-gray-400 hover:text-gray-600 transition-colors"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* STAT ROW */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 lg:gap-4 mb-6">
        <StatCard
          label="Bottles On Shelf"
          value={onShelf}
          valueClass={statusColor[variant]}
          sub={<SupplyBar days={store.daysOfSupply} onShelf={store.onShelf} />}
        />
        <StatCard
          label="Bottles In Process"
          value={store.inProcess}
          valueClass={store.inProcess > 0 ? 'text-blue-500' : 'text-gray-900'}
          sub={store.inProcess > 0 ? 'Open order in transit' : 'No open order'}
        />
        <StatCard
          label="Days of Supply"
          value={store.daysOfSupply !== null ? `${store.daysOfSupply}d` : '—'}
          valueClass={statusColor[variant]}
          sub={variant === 'critical' ? 'Order needed now · <7 days' : variant === 'low' ? 'Order soon · 7–10 days' : 'Tracking well'}
        />
        <StatCard
          label="Weekly Velocity"
          value={weeklyVelocity !== null ? `${weeklyVelocity}` : '—'}
          sub="bottles / week"
        />
      </div>

      {/* BY PRODUCT — only rendered for multi-product brands; with a single
          product the stat row above already tells the whole story. */}
      {(apiStoreDetail?.products?.length ?? 0) > 1 && (
        <div className="bg-white border border-gray-200 rounded-xl overflow-x-auto mb-6">
          <div className="px-5 py-4 border-b border-gray-100">
            <h2 className="text-sm font-semibold text-gray-900">Stock by Product</h2>
          </div>
          <table className="w-full">
            <thead>
              <tr className="border-b border-gray-100 bg-gray-50/50">
                {['Product', 'SKU', 'On Shelf', 'In Process'].map((h, i) => (
                  <th key={h} className={clsx('px-5 py-2.5 text-[10px] font-semibold text-gray-400 uppercase tracking-wider whitespace-nowrap', i >= 2 ? 'text-right' : 'text-left')}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {apiStoreDetail!.products.map(p => (
                <tr key={p.productId} className="hover:bg-gray-50/70 transition-colors">
                  <td className="px-5 py-3 text-sm font-medium text-gray-900">
                    {p.name}{p.sizeLabel ? <span className="text-gray-400 font-normal"> · {p.sizeLabel}</span> : null}
                  </td>
                  <td className="px-5 py-3 text-sm text-gray-400 tabular-nums">{p.sku ?? '—'}</td>
                  <td className="px-5 py-3 text-right text-sm font-semibold tabular-nums text-gray-900">{p.onShelf}</td>
                  <td className="px-5 py-3 text-right text-sm tabular-nums text-gray-500">{p.inProcess}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* MAIN GRID */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 lg:gap-5">

        {/* LEFT COLUMN */}
        <div className="lg:col-span-2 space-y-4 lg:space-y-5">

          {/* INVENTORY TREND */}
          <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
            <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
              <h2 className="text-sm font-semibold text-gray-900">Inventory Trend</h2>
              <div className="flex items-center gap-4">
                <LegendDot color="#724fac" label="On shelf" />
                <LegendDot color="#e2e8f0" label="Sold / week" />
              </div>
            </div>
            <div className="px-5 py-4" style={{ height: 160 }}>
              {trend.length === 0 ? (
                <div className="h-full flex items-center justify-center">
                  <p className="text-xs text-gray-400">
                    No shelf readings yet — log a visit to start the trend.
                  </p>
                </div>
              ) : (
              <ResponsiveContainer width="100%" height="100%">
                <ComposedChart data={trend} margin={{ top: 4, right: 4, bottom: 0, left: 0 }}>
                  <defs>
                    <linearGradient id="onShelfGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%"  stopColor="#724fac" stopOpacity={0.15}/>
                      <stop offset="95%" stopColor="#724fac" stopOpacity={0}/>
                    </linearGradient>
                  </defs>
                  <CartesianGrid vertical={false} stroke="#f1f5f9" />
                  <XAxis dataKey="week" tick={{ fontSize: 10, fill: '#9ca3af' }} axisLine={false} tickLine={false} />
                  <YAxis hide />
                  <Tooltip
                    contentStyle={{ background: '#fff', border: '1px solid #e8eaed', borderRadius: 8, fontSize: 12 }}
                    cursor={{ stroke: '#e2e8f0' }}
                    // Weeks with no reading carry null; without this the tooltip
                    // renders them as "null" rather than omitting them.
                    formatter={(value: number | null, name: string) =>
                      value == null ? ['—', name] : [value, name]}
                  />
                  <Area
                    dataKey="onShelf" name="On shelf"
                    stroke="#724fac" strokeWidth={2}
                    fill="url(#onShelfGrad)"
                    // Dots mark real observations; the line bridges unobserved
                    // weeks, which are now spaced by actual elapsed time.
                    dot={{ r: 2, fill: '#724fac', strokeWidth: 0 }}
                    connectNulls
                  />
                  <Bar dataKey="sold" name="Sold / week" fill="#e2e8f0" radius={[3, 3, 0, 0]} />
                </ComposedChart>
              </ResponsiveContainer>
              )}
            </div>
          </div>

          {/* VISIT LOG */}
          <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
            <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
              <h2 className="text-sm font-semibold text-gray-900">Visit Log</h2>
              <button onClick={() => setShowLogVisit(true)} className="text-xs font-medium text-accent hover:underline">+ Log</button>
            </div>
            <div className="divide-y divide-gray-50">
              {visits.slice(0, 5).map((v, i) => {
                const meta = v.action
                  ? ACTION_META[v.action]
                  : (v.logType ? LOGTYPE_META[v.logType] : null)
                const apiV = apiVisits?.find(a => a.id === v.id)
                return (
                  <div
                    key={v.id}
                    className={clsx('px-5 py-3.5 flex items-start gap-4 transition-colors', i === 0 && 'bg-gray-50/40', apiV && deleteVisitId !== v.id && 'cursor-pointer hover:bg-gray-50')}
                    onClick={() => { if (apiV && deleteVisitId !== v.id) setEditingVisit(apiV) }}
                  >
                    {/* Timeline dot */}
                    <div className="flex flex-col items-center gap-1 flex-shrink-0 pt-0.5">
                      <div className={clsx('w-2 h-2 rounded-full', i === 0 ? 'bg-accent' : 'bg-gray-200')} />
                      {i < Math.min(visits.length, 5) - 1 && <div className="w-px flex-1 min-h-[24px] bg-gray-100" />}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between gap-3 mb-0.5">
                        <div className="flex items-center gap-2">
                          {meta && (
                            <span className={clsx('text-[10px] font-semibold px-1.5 py-0.5 rounded-full', meta.bg, meta.color)}>
                              {meta.label}
                            </span>
                          )}
                          <span className="text-xs text-gray-500">{v.rep}</span>
                        </div>
                        <div className="flex items-center gap-2 flex-shrink-0">
                          <span className="text-[10px] text-gray-400">{fmtShort(v.date)}</span>
                          <span className="text-[10px] text-gray-300">({daysAgo(v.date)})</span>
                          {apiV && deleteVisitId === v.id ? (
                            <>
                              <button
                                onClick={e => {
                                  e.stopPropagation()
                                  handleDeleteVisit(v.id)
                                  setDeleteVisitId(null)
                                }}
                                className="px-2 py-0.5 text-[10px] font-semibold text-white bg-red-500 hover:bg-red-600 rounded transition-colors"
                              >
                                Confirm
                              </button>
                              <button
                                onClick={e => { e.stopPropagation(); setDeleteVisitId(null) }}
                                className="px-2 py-0.5 text-[10px] font-medium text-gray-400 hover:text-gray-700 hover:bg-gray-100 rounded transition-colors"
                              >
                                Cancel
                              </button>
                            </>
                          ) : apiV && (
                            <>
                              <svg className="w-3 h-3 text-gray-300 transition-colors" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
                                <path d="M11.5 2.5a1.414 1.414 0 012 2L5 13H2v-3L11.5 2.5z" strokeLinecap="round" strokeLinejoin="round"/>
                              </svg>
                              <button
                                onClick={e => { e.stopPropagation(); setDeleteVisitId(v.id) }}
                                className="text-[10px] text-red-300 hover:text-red-500 transition-colors"
                              >
                                Delete
                              </button>
                            </>
                          )}
                        </div>
                      </div>
                      <p className="text-xs text-gray-500">{v.notes}</p>
                      <div className="flex items-center gap-3 mt-0.5">
                        <p className="text-[10px] text-gray-400">{v.onShelf} bottles on shelf</p>
                        {v.contactName && (
                          <Link to={`/contacts/${v.contactId}`} onClick={e => e.stopPropagation()} className="text-[10px] text-accent hover:underline flex items-center gap-1">
                            <svg width="9" height="9" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
                              <circle cx="8" cy="6" r="3"/><path d="M2 14c0-3.3 2.7-6 6-6s6 2.7 6 6"/>
                            </svg>
                            {v.contactName}
                          </Link>
                        )}
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
            {visits.length > 5 && (
              <button
                onClick={() => setShowAllVisits(true)}
                className="w-full px-5 py-3 text-xs font-medium text-accent hover:bg-gray-50 border-t border-gray-100 transition-colors"
              >
                View all {visits.length} visits
              </button>
            )}
          </div>

          {/* STOCK SYNC LOG — automated API pulls, kept separate from visits */}
          {(apiStoreDetail?.stockSyncs?.length ?? 0) > 0 && (
            <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
              <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
                <div>
                  <h2 className="text-sm font-semibold text-gray-900">Stock Sync Log</h2>
                  <p className="text-[10px] text-gray-400 mt-0.5">Automated shelf-count pulls · not rep visits</p>
                </div>
                <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full bg-accent-light text-accent">API</span>
              </div>
              <div className="divide-y divide-gray-50 max-h-80 overflow-y-auto">
                {(apiStoreDetail?.stockSyncs ?? []).map((s, i) => {
                  const changed = s.previousOnShelf !== s.onShelf
                  return (
                    <div key={s.id} className={clsx('px-5 py-3 flex items-start gap-4', i === 0 && 'bg-gray-50/40')}>
                      <div className="flex flex-col items-center gap-1 flex-shrink-0 pt-0.5">
                        <div className={clsx('w-2 h-2 rounded-full', i === 0 ? 'bg-accent' : 'bg-gray-200')} />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between gap-3 mb-0.5">
                          <div className="flex items-center gap-2">
                            {s.stockStatus === 'OUT_OF_STOCK' ? (
                              <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full bg-red-50 text-red-500">Out of stock</span>
                            ) : (
                              <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full bg-green-50 text-green-600">In stock</span>
                            )}
                            <span className="text-xs text-gray-500">{store.chainName ?? 'Goody Goody'}</span>
                          </div>
                          <div className="flex items-center gap-2 flex-shrink-0">
                            <span className="text-[10px] text-gray-400">{fmtShort(s.syncedAt)}</span>
                            <span className="text-[10px] text-gray-300">({timeAgo(s.syncedAt)})</span>
                          </div>
                        </div>
                        <p className="text-[10px] text-gray-400">
                          {changed
                            ? <>{s.previousOnShelf} <span className="text-gray-300">→</span> <span className="font-semibold text-accent">{s.onShelf}</span> bottles on shelf</>
                            : <>{s.onShelf} bottles on shelf (no change)</>}
                        </p>
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          )}

          {/* EVENTS */}
          <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
            <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
              <h2 className="text-sm font-semibold text-gray-900">
                Events
                {storeEvents.length > 0 && (
                  <span className="ml-2 text-xs font-normal text-gray-400">({storeEvents.length})</span>
                )}
              </h2>
              <button
                onClick={() => setShowScheduleEvent(true)}
                className="text-xs font-medium text-accent hover:underline"
              >
                Schedule
              </button>
            </div>
            {storeEvents.length === 0 ? (
              <div className="py-8 text-center">
                <p className="text-xs text-gray-400">No events for this store</p>
                <button
                  onClick={() => setShowScheduleEvent(true)}
                  className="mt-1 text-xs text-accent hover:underline"
                >
                  Schedule an event
                </button>
              </div>
            ) : (
              <div className="divide-y divide-gray-50">
                {storeEvents.map((ev, i) => {
                  const statusMeta = EVENT_STATUS_META[ev.status]
                  const typeMeta   = EVENT_TYPE_META[ev.type]
                  const editable = ev.status === 'scheduled'
                  return (
                    <div
                      key={ev.id}
                      onClick={editable ? () => setEditingEvent(ev) : undefined}
                      className={clsx('group px-5 py-3.5 flex items-start gap-4 transition-colors', i === 0 && 'bg-gray-50/40', editable && 'cursor-pointer hover:bg-gray-50')}
                    >
                      <div className="flex flex-col items-center gap-1 flex-shrink-0 pt-0.5">
                        <div className={clsx('w-2 h-2 rounded-full', statusMeta.dot)} />
                        {i < storeEvents.length - 1 && <div className="w-px flex-1 min-h-[24px] bg-gray-100" />}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between gap-3 mb-0.5">
                          <div className="flex items-center gap-1.5">
                            {typeMeta && (
                            <span className={clsx('text-[10px] font-semibold px-1.5 py-0.5 rounded-full', typeMeta.bg, typeMeta.color)}>
                              {typeMeta.label}
                            </span>
                            )}
                            <span className={clsx('text-[10px] font-semibold px-1.5 py-0.5 rounded-full', statusMeta.bg, statusMeta.text)}>
                              {statusMeta.label}
                            </span>
                          </div>
                          <div className="flex items-center gap-2 flex-shrink-0">
                            {editable && (
                              <span className="text-[10px] font-medium text-accent opacity-0 group-hover:opacity-100 transition-opacity">Edit</span>
                            )}
                            <span className="text-[10px] text-gray-400">{fmtShort(ev.scheduledAt)}</span>
                          </div>
                        </div>
                        <div className="flex items-center gap-1.5 mt-0.5 flex-wrap">
                          {ev.reps.map((r, ri) => (
                            <span key={r.id} className="text-xs text-gray-500">
                              {r.name}{ri < ev.reps.length - 1 ? ',' : ''}
                            </span>
                          ))}
                        </div>
                        {ev.notes && (
                          <p className="text-xs text-gray-400 mt-0.5 truncate">{ev.notes}</p>
                        )}
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </div>

          {/* ORDER HISTORY */}
          <div className="bg-white border border-gray-200 rounded-xl overflow-x-auto">
            <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
              <h2 className="text-sm font-semibold text-gray-900">Order History</h2>
            </div>
            <table className="w-full">
              <thead>
                <tr className="border-b border-gray-100 bg-gray-50/50">
                  {['Invoice', 'Date', 'Quantity', 'Status'].map(h => (
                    <th key={h} className="px-5 py-3 text-left text-[10px] font-semibold text-gray-400 uppercase tracking-wider whitespace-nowrap">
                      {h}
                    </th>
                  ))}
                  <th className="px-5 py-3 text-right text-[10px] font-semibold text-gray-400 uppercase tracking-wider whitespace-nowrap" aria-label="Actions" />
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {orders.map(o => {
                  const meta = ORDER_STATUS_META[o.status]
                  return (
                    <tr key={o.id} className="hover:bg-gray-50/70 transition-colors group">
                      <td className="px-5 py-3.5">
                        <span className="text-sm font-medium text-gray-700">{o.invoiceRef}</span>
                      </td>
                      <td className="px-5 py-3.5">
                        <span className="text-sm text-gray-500">{fmtShort(o.placedAt)}</span>
                      </td>
                      <td className="px-5 py-3.5">
                        <span className="text-sm text-gray-900 font-medium">{o.quantity}</span>
                        <span className="text-xs text-gray-400 ml-1">bottles</span>
                      </td>
                      <td className="px-5 py-3.5">
                        <span className={clsx('inline-flex items-center gap-1.5 text-xs font-medium px-2 py-0.5 rounded-full', meta.bg, meta.color)}>
                          <span className={clsx('w-1.5 h-1.5 rounded-full', meta.dot)} />
                          {meta.label}
                        </span>
                      </td>
                      <td className="px-5 py-3.5 text-right whitespace-nowrap">
                        {deleteOrderId === o.id ? (
                          <span className="inline-flex items-center gap-1.5">
                            <button
                              onClick={() => { deleteOrder.mutate(o.id); setDeleteOrderId(null) }}
                              className="px-2 py-0.5 text-[10px] font-semibold text-white bg-red-500 hover:bg-red-600 rounded transition-colors"
                            >
                              Confirm
                            </button>
                            <button
                              onClick={() => setDeleteOrderId(null)}
                              className="px-2 py-0.5 text-[10px] font-medium text-gray-400 hover:text-gray-700 hover:bg-gray-100 rounded transition-colors"
                            >
                              Cancel
                            </button>
                          </span>
                        ) : (
                          <button
                            onClick={() => setDeleteOrderId(o.id)}
                            className="text-[11px] text-red-300 hover:text-red-500 transition-colors opacity-0 group-hover:opacity-100 focus:opacity-100"
                          >
                            Delete
                          </button>
                        )}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>

        </div>

        {/* RIGHT COLUMN */}
        <div className="space-y-4 lg:space-y-5">

          {/* STORE INFO */}
          <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
            <div className="px-5 py-4 border-b border-gray-100">
              <h2 className="text-sm font-semibold text-gray-900">Store Info</h2>
            </div>
            <div className="px-5 py-4 space-y-3">
              <InfoRow label="Display Name" value={store.displayName} />
              <InfoRow label="Chain"      value={store.chainName} />
              <InfoRow label="Region"     value={store.regionName} />
              <InfoRow label="Address"    value={store.address} />
              <InfoRow label="Rep"        value={store.rep} />
              <InfoRow label="Last Visit" value={lastVisit ? fmt(lastVisit) : 'Never'} />
              <InfoRow
                label="Depletion"
                value={store.depletionRate != null ? `${store.depletionRate} btl/day` : '—'}
              />
              {apiStoreDetail?.lastStockSync && (
                <div className="flex items-center gap-1.5 pt-0.5 text-[10px] text-gray-400">
                  <svg width="10" height="10" viewBox="0 0 12 12" fill="none" className="flex-shrink-0">
                    <path d="M10.5 5A4.5 4.5 0 102 3.5M1.5 7A4.5 4.5 0 0010 8.5" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round"/>
                    <path d="M10.5 1.5V4H8M1.5 10.5V8H4" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round"/>
                  </svg>
                  <span>
                    Stock synced from {store.chainName ?? 'retailer'} · {timeAgo(apiStoreDetail.lastStockSync.syncedAt)}
                  </span>
                </div>
              )}
              <div className="pt-1">
                <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider mb-1.5">
                  Supply health
                </p>
                <div className="w-full bg-gray-100 rounded-full h-1.5 overflow-hidden">
                  <div
                    className={clsx('h-full rounded-full transition-all', statusBarColor[variant])}
                    style={{ width: `${Math.min(100, ((store.daysOfSupply ?? 0) / 30) * 100)}%` }}
                  />
                </div>
                <p className="text-[10px] text-gray-400 mt-1">
                  {store.daysOfSupply !== null ? `${store.daysOfSupply} of 30 days target` : 'Unknown'}
                </p>
              </div>
            </div>
          </div>

          {/* STORE QR CODE — admin only, renders nothing for reps */}
          {id && (
            <StorePortalCard
              storeId={id}
              storeName={store.displayName || store.name}
              chainName={store.chainName ?? null}
              isAdmin={isAdmin}
            />
          )}

          {/* STORE STATUS — deactivate instead of delete, to keep the history */}
          {id && isAdmin && (
            <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
              <div className="px-5 py-4 border-b border-gray-100">
                <h2 className="text-sm font-semibold text-gray-900">Store Status</h2>
                <p className="text-xs text-gray-400 mt-0.5">
                  {store.status === 'inactive'
                    ? 'Kept on record, hidden from active lists'
                    : 'Currently serviced and counted in reports'}
                </p>
              </div>
              <div className="px-5 py-4">
                {store.status === 'inactive' ? (
                  <>
                    {store.deactivatedAt && (
                      <p className="text-[11px] text-gray-400 mb-3">
                        Deactivated {new Date(store.deactivatedAt).toLocaleDateString('en-US', {
                          month: 'short', day: 'numeric', year: 'numeric',
                        })}
                      </p>
                    )}
                    <Button
                      variant="primary" size="sm"
                      disabled={setStoreStatus.isPending}
                      onClick={() => setStoreStatus.mutate({ id, status: 'active' }, {
                        onSuccess: () => toast('Store reactivated', 'success'),
                      })}
                    >
                      {setStoreStatus.isPending ? 'Reactivating…' : 'Reactivate store'}
                    </Button>
                  </>
                ) : !confirmDeactivate ? (
                  <button
                    onClick={() => setConfirmDeactivate(true)}
                    className="text-[11px] text-gray-400 hover:text-red-600"
                  >
                    Mark inactive
                  </button>
                ) : (
                  <div className="rounded-lg bg-amber-50 border border-amber-100 p-3">
                    <p className="text-[11px] text-amber-800 mb-2">
                      All history stays on record. The store drops out of store lists,
                      dashboard metrics, the public locator, the Goody Goody sync and the
                      alert scan, and its QR code stops working. Reversible at any time.
                    </p>
                    <div className="flex items-center gap-2">
                      <Button
                        variant="danger" size="sm"
                        disabled={setStoreStatus.isPending}
                        onClick={() => setStoreStatus.mutate({ id, status: 'inactive' }, {
                          onSuccess: () => {
                            setConfirmDeactivate(false)
                            toast('Store marked inactive', 'success')
                          },
                        })}
                      >
                        {setStoreStatus.isPending ? 'Updating…' : 'Mark inactive'}
                      </Button>
                      <Button variant="ghost" size="sm" onClick={() => setConfirmDeactivate(false)}>
                        Cancel
                      </Button>
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* CONTACTS */}
          <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
            <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
              <h2 className="text-sm font-semibold text-gray-900">
                Contacts
                {contacts.length > 0 && (
                  <span className="ml-2 text-xs font-normal text-gray-400">({contacts.length})</span>
                )}
              </h2>
              <button
                onClick={() => setShowAddContact(true)}
                className="text-xs font-medium text-accent hover:underline"
              >
                Add
              </button>
            </div>
            {contacts.length === 0 ? (
              <div className="py-6 text-center">
                <p className="text-xs text-gray-400">No contacts yet</p>
                <button
                  onClick={() => setShowAddContact(true)}
                  className="mt-1 text-xs text-accent hover:underline"
                >
                  Add a contact
                </button>
              </div>
            ) : (
              <div className="divide-y divide-gray-50">
                {contacts.map(c => (
                  <Link
                    key={c.id}
                    to={`/contacts/${c.id}`}
                    className="flex items-center gap-3 px-5 py-3 hover:bg-gray-50/70 transition-colors group"
                  >
                    <div className="w-7 h-7 rounded-full bg-accent-light flex items-center justify-center flex-shrink-0">
                      <span className="text-[9px] font-bold text-accent">
                        {c.name.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase()}
                      </span>
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-semibold text-gray-700 group-hover:text-accent transition-colors truncate">{c.name}</p>
                      <p className="text-[10px] text-gray-400 truncate">{c.role}</p>
                    </div>
                    {c.phone && (
                      <div className="flex items-center gap-1 flex-shrink-0">
                        <a
                          href={`tel:${c.phone}`}
                          onClick={e => e.stopPropagation()}
                          className="text-gray-300 hover:text-accent transition-colors p-0.5"
                          title={`Call ${c.phone}`}
                        >
                          <svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
                            <path d="M2 3a1 1 0 011-1h2.5a1 1 0 011 1l.5 2.5a1 1 0 01-.3.9L5.4 7.1c.9 1.8 2.7 3.6 4.5 4.5l.7-1.3a1 1 0 01.9-.3l2.5.5a1 1 0 011 1V14a1 1 0 01-1 1h-1C6.4 15 1 9.6 1 3V2a1 1 0 011-1h.5"/>
                          </svg>
                        </a>
                        <a
                          href={`sms:${c.phone}`}
                          onClick={e => e.stopPropagation()}
                          className="text-gray-300 hover:text-accent transition-colors p-0.5"
                          title={`Text ${c.phone}`}
                        >
                          <svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
                            <path d="M2 2h12a1 1 0 011 1v7a1 1 0 01-1 1H5l-3 3V3a1 1 0 011-1z"/>
                          </svg>
                        </a>
                      </div>
                    )}
                  </Link>
                ))}
              </div>
            )}
          </div>

          {/* ALERTS */}
          <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
            <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
              <h2 className="text-sm font-semibold text-gray-900">
                Alerts
                {storeAlerts.length > 0 && (
                  <span className="ml-2 bg-red-50 text-red-500 text-[10px] font-bold px-1.5 py-0.5 rounded-full">
                    {storeAlerts.length}
                  </span>
                )}
              </h2>
              {storeAlerts.length > 0 && (
                <button className="text-xs font-medium text-accent hover:underline">Resolve all</button>
              )}
            </div>
            {storeAlerts.length === 0 ? (
              <div className="py-8 text-center">
                <div className="w-7 h-7 bg-green-50 rounded-full flex items-center justify-center mx-auto mb-2">
                  <svg width="13" height="13" viewBox="0 0 14 14" fill="none">
                    <path d="M2.5 7.5l3 3 6-6" stroke="#10b981" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                  </svg>
                </div>
                <p className="text-xs text-gray-400">No active alerts</p>
              </div>
            ) : (
              <div className="divide-y divide-gray-50">
                {storeAlerts.map(alert => (
                  <div key={alert.id} className="px-5 py-3.5">
                    <div className="flex items-center gap-1.5 mb-1">
                      <span className={clsx('w-1.5 h-1.5 rounded-full', alertMeta(alert.type).dot)} />
                      <span className="text-[10px] font-medium text-gray-400">
                        {alertMeta(alert.type).label}
                      </span>
                    </div>
                    <p className="text-xs text-gray-700 mb-0.5">{alert.message}</p>
                    <p className="text-[10px] text-gray-400">
                      {fmt(alert.triggeredAt, { month: 'short', day: 'numeric' })}
                    </p>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* LOCATION */}
          {store.latitude && store.longitude && (
            <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
              <div className="px-5 py-4 border-b border-gray-100">
                <h2 className="text-sm font-semibold text-gray-900">Location</h2>
                {store.address && (
                  <p className="text-xs text-gray-400 mt-0.5">{store.address}</p>
                )}
              </div>
              <div style={{ height: 200 }}>
                <MapGL
                  mapboxAccessToken={MAPBOX_TOKEN}
                  initialViewState={{
                    longitude: store.longitude,
                    latitude: store.latitude,
                    zoom: 13,
                  }}
                  style={{ width: '100%', height: '100%' }}
                  mapStyle="mapbox://styles/mapbox/light-v11"
                  interactive={false}
                >
                  <Marker longitude={store.longitude} latitude={store.latitude} anchor="center">
                    <div className="w-5 h-5 rounded-full border-2 border-accent bg-accent-light flex items-center justify-center shadow-sm">
                      <div className="w-2 h-2 rounded-full bg-accent" />
                    </div>
                  </Marker>
                </MapGL>
              </div>
            </div>
          )}

        </div>
      </div>

      <EditStoreModal
        open={showEditStore}
        onClose={() => setShowEditStore(false)}
        store={store}
        onSave={(id, updates) => {
          updateStore.mutate({ id, ...updates }, {
            onSuccess: () => { toast('Store updated'); setShowEditStore(false) },
            onError:   (err: Error) => toast(err.message, 'error'),
          })
        }}
      />
      <LogVisitModal
        open={showLogVisit}
        onClose={() => setShowLogVisit(false)}
        store={store}
        onSave={handleSaveVisit}
      />
      <LogVisitModal
        open={!!editingVisit}
        onClose={() => setEditingVisit(null)}
        store={store}
        editVisit={editingVisit ?? undefined}
        onSave={() => {}}
        onUpdate={(id, body) => {
          updateVisit.mutate({ id, body: body as Parameters<typeof updateVisit.mutate>[0]['body'] }, {
            onSuccess: () => {
              // Clear optimistic overrides so the refetched store state (synced
              // server-side when the latest visit is edited) shows through.
              setOnShelfOverride(null)
              setLastVisitOverride(undefined)
              toast('Log updated')
              setEditingVisit(null)
            },
            onError:   (err: Error) => toast(err.message, 'error'),
          })
        }}
      />
      <AllVisitsModal
        open={showAllVisits}
        onClose={() => setShowAllVisits(false)}
        storeName={store.name}
        visits={visits}
        editableIds={new Set((apiVisits ?? []).map(a => a.id))}
        onSelect={(visitId) => {
          const av = apiVisits?.find(a => a.id === visitId)
          if (av) { setShowAllVisits(false); setEditingVisit(av) }
        }}
        onDelete={handleDeleteVisit}
      />
      <AddContactModal
        open={showAddContact}
        onClose={() => setShowAddContact(false)}
        onSave={handleSaveContact}
        defaultChainId={store.chainId}
        defaultStoreId={store.id}
      />
      <EventModal
        open={showScheduleEvent}
        onClose={() => setShowScheduleEvent(false)}
        preselectedStoreId={store.id}
        onSave={ev => {
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
                toast(`Event scheduled at ${store.name}`)
                setShowScheduleEvent(false)
              },
            },
          )
        }}
      />
      <EventModal
        open={!!editingEvent}
        onClose={() => setEditingEvent(null)}
        initialValues={editingEvent ?? undefined}
        onSave={e => {
          if (!editingEvent) return
          const evId = editingEvent.id
          setEditingEvent(null)
          updateEvent.mutate(
            {
              id:          evId,
              type:        e.type,
              title:       e.title       ?? undefined,
              address:     e.address     ?? undefined,
              bottlesSold: e.bottlesSold ?? undefined,
              scheduledAt: e.scheduledAt,
              endTime:     e.endTime     ?? undefined,
              repIds:      e.reps.map(r => r.id),
              notes:       e.notes       ?? undefined,
              contactId:   e.contactId   ?? undefined,
            },
            { onSuccess: () => toast('Event updated') },
          )
        }}
      />
    </div>
  )
}

// ─── small sub-components ───────────────────────────────────────────────────

function StatCard({
  label, value, sub, valueClass = 'text-gray-900',
}: {
  label: string
  value: string | number
  sub?: React.ReactNode
  valueClass?: string
}) {
  return (
    <div className="bg-white border border-gray-200 rounded-xl px-5 py-4">
      <p className="text-xs font-medium text-gray-400 uppercase tracking-wider mb-2">{label}</p>
      <p className={clsx('text-2xl font-bold tabular-nums mb-1.5', valueClass)}>{value}</p>
      {typeof sub === 'string'
        ? <p className="text-xs text-gray-400">{sub}</p>
        : sub
      }
    </div>
  )
}

function InfoRow({ label, value }: { label: string; value: string | null | undefined }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="text-xs text-gray-400 flex-shrink-0">{label}</span>
      <span className={clsx('text-xs font-medium text-right', value ? 'text-gray-700' : 'text-gray-300')}>
        {value ?? '—'}
      </span>
    </div>
  )
}

function LegendDot({ color, label }: { color: string; label: string }) {
  return (
    <div className="flex items-center gap-1.5 text-xs text-gray-500">
      <div className="w-2.5 h-2.5 rounded-sm flex-shrink-0" style={{ background: color }} />
      {label}
    </div>
  )
}
