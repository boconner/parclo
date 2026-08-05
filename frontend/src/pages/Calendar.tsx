import { useState, useMemo } from 'react'
import { Calendar, dateFnsLocalizer, Views } from 'react-big-calendar'
import type { View, ToolbarProps } from 'react-big-calendar'
import { format, parse, startOfWeek, getDay } from 'date-fns'
import { enUS } from 'date-fns/locale'
import 'react-big-calendar/lib/css/react-big-calendar.css'
import { clsx } from 'clsx'
import { Link } from 'react-router-dom'
import { Button } from '@/components/ui/Button'
import { Modal } from '@/components/ui/Modal'
import { useEvents, useCreateEvent, useUpdateEvent, useDeleteEvent, useStores, useCreateVisit, useCreateSupplyRequest } from '@/hooks/useQueries'
import { EventModal, EVENT_TYPE_META } from '@/components/events/EventModal'
import { LogVisitModal } from '@/components/stores/LogVisitModal'
import { SupplyRequestModal } from '@/components/events/SupplyRequestModal'
import { toast } from '@/components/ui/Toast'
import type { Event, EventType } from '@/types'

const localizer = dateFnsLocalizer({
  format,
  parse,
  startOfWeek,
  getDay,
  locales: { 'en-US': enUS },
})

// ─── types ───────────────────────────────────────────────────────────────────

type CalEvent = {
  id:       string
  title:    string
  start:    Date
  end:      Date
  resource: Event
}

// ─── constants ────────────────────────────────────────────────────────────────

const STATUS_META: Record<Event['status'], { label: string; bg: string; text: string; dot: string }> = {
  scheduled: { label: 'Scheduled', bg: 'bg-accent-light',  text: 'text-accent',    dot: 'bg-accent'    },
  completed: { label: 'Completed', bg: 'bg-green-50',      text: 'text-green-700', dot: 'bg-green-500' },
  cancelled: { label: 'Cancelled', bg: 'bg-gray-100',      text: 'text-gray-500',  dot: 'bg-gray-400'  },
}

const EVENT_COLOR: Record<Event['status'], Record<EventType, string>> = {
  scheduled: { tasting: 'var(--accent)', tasking: '#2563eb', private_event: '#9333ea' },
  completed: { tasting: '#15803d', tasking: '#15803d', private_event: '#15803d' },
  cancelled: { tasting: '#9ca3af', tasking: '#9ca3af', private_event: '#9ca3af' },
}

// ─── page ────────────────────────────────────────────────────────────────────

export default function CalendarPage() {
  const [view, setView]               = useState<View>(Views.MONTH)
  const [date, setDate]               = useState(new Date())
  const [selected, setSelected]                   = useState<Event | null>(null)
  const [showCreate, setShowCreate]               = useState(false)
  const [editingEvent, setEditingEvent]           = useState<Event | null>(null)
  const [logVisitEvent, setLogVisitEvent]         = useState<Event | null>(null)
  const [supplyRequestEvent, setSupplyRequestEvent] = useState<Event | null>(null)
  const [repFilter, setRepFilter]                 = useState<string>('all')
  const [search, setSearch]                       = useState('')

  const { data: apiEvents = [] } = useEvents()
  const { data: allStores = [] } = useStores()
  const createEvent         = useCreateEvent()
  const updateEvent         = useUpdateEvent()
  const deleteEvent         = useDeleteEvent()
  const createVisit         = useCreateVisit()
  const createSupplyRequest = useCreateSupplyRequest()

  const eventReps = useMemo(() => {
    const map: Map<string, { id: string; name: string }> = new Map()
    apiEvents.forEach(e => e.reps.forEach(r => map.set(r.id, r)))
    return [...map.values()]
  }, [apiEvents])

  const calEvents = useMemo((): CalEvent[] => {
    const q = search.trim().toLowerCase()
    return apiEvents
      .filter(e => repFilter === 'all' || e.reps.some(r => r.id === repFilter))
      .filter(e => {
        if (!q) return true
        const haystack = [
          e.title,
          e.storeName,
          e.chainName,
          e.regionName,
          e.notes,
          e.contactName,
          e.completionNotes,
          ...e.reps.map(r => r.name),
          EVENT_TYPE_META[e.type]?.label,
        ].filter(Boolean).join(' ').toLowerCase()
        return haystack.includes(q)
      })
      .map(e => ({
        id:       e.id,
        title:    e.title || (e.storeName ? `${EVENT_TYPE_META[e.type]?.label ?? e.type} · ${e.storeName}` : (EVENT_TYPE_META[e.type]?.label ?? e.type)),
        start:    new Date(e.scheduledAt),
        end:      e.endTime
          ? new Date(e.endTime)
          : new Date(new Date(e.scheduledAt).getTime() + 2 * 60 * 60 * 1000),
        resource: e,
      }))
  }, [apiEvents, repFilter, search])

  const scheduledCount = calEvents.filter(e => e.resource.status === 'scheduled').length

  function handleEdit(event: Event) {
    setSelected(null)
    setEditingEvent(event)
  }

  function handleLogVisit(event: Event) {
    setSelected(null)
    setLogVisitEvent(event)
  }

  function handleRequestSupplies(event: Event) {
    setSelected(null)
    setSupplyRequestEvent(event)
  }

  function handleCancel(event: Event) {
    updateEvent.mutate({ id: event.id, status: 'cancelled' })
    toast(event.storeName ? `Event at ${event.storeName} cancelled` : 'Event cancelled')
    setSelected(null)
  }

  function handleDelete(event: Event) {
    deleteEvent.mutate(event.id)
    toast(event.storeName ? `Event at ${event.storeName} deleted` : 'Event deleted')
    setSelected(null)
  }

  return (
    <div className="p-4 lg:p-8 flex flex-col gap-4" style={{ minHeight: 'calc(100vh - 56px)' }}>

      {/* HEADER */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-gray-900 tracking-tight">Calendar</h1>
          <p className="text-sm text-gray-400 mt-0.5">
            {scheduledCount} upcoming ·{' '}
            {(search.trim() || repFilter !== 'all')
              ? <>{calEvents.length} of {apiEvents.length} shown</>
              : <>{apiEvents.length} total</>
            }
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2 sm:gap-3">

          {/* Legend */}
          <div className="hidden sm:flex items-center gap-3">
            {(Object.keys(STATUS_META) as Event['status'][]).map(s => (
              <div key={s} className="flex items-center gap-1.5">
                <div className={clsx('w-2 h-2 rounded-full', STATUS_META[s].dot)} />
                <span className="text-xs text-gray-400">{STATUS_META[s].label}</span>
              </div>
            ))}
          </div>

          {/* Search */}
          <div className="relative">
            <svg
              width="13" height="13" viewBox="0 0 13 13" fill="none"
              className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none"
            >
              <circle cx="5.5" cy="5.5" r="4" stroke="currentColor" strokeWidth="1.4"/>
              <path d="M9 9l2.5 2.5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/>
            </svg>
            <input
              type="text"
              placeholder="Search events…"
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="pl-8 pr-3 py-1.5 text-sm bg-white border border-gray-200 rounded-lg outline-none focus:border-accent focus:ring-2 focus:ring-accent/10 text-gray-600 transition-all w-44"
            />
          </div>

          {/* Rep filter */}
          <select
            value={repFilter}
            onChange={e => setRepFilter(e.target.value)}
            className="text-sm bg-white border border-gray-200 rounded-lg px-3 py-1.5 outline-none focus:border-accent focus:ring-2 focus:ring-accent/10 text-gray-600 transition-all"
          >
            <option value="all">All Reps</option>
            {eventReps.map(r => (
              <option key={r.id} value={r.id}>{r.name}</option>
            ))}
          </select>

          <Button variant="primary" size="sm" onClick={() => setShowCreate(true)}>
            + Schedule
          </Button>
        </div>
      </div>

      {/* CALENDAR */}
      <div className="flex-1 bg-white rounded-xl border border-gray-200 p-4 overflow-hidden min-w-0">
        <Calendar
          localizer={localizer}
          events={calEvents}
          view={view}
          date={date}
          onView={setView}
          onNavigate={setDate}
          onSelectEvent={(e: CalEvent) => setSelected(e.resource)}
          longPressThreshold={10}
          eventPropGetter={(e: CalEvent) => ({
            style: {
              backgroundColor: EVENT_COLOR[e.resource.status][e.resource.type],
              borderColor:     EVENT_COLOR[e.resource.status][e.resource.type],
              borderRadius:    '6px',
              color:           'white',
              fontSize:        '12px',
              fontWeight:      500,
              padding:         '2px 6px',
              border:          'none',
            },
          })}
          components={{ toolbar: CustomToolbar }}
          style={{ height: 540 }}
        />
      </div>

      {/* Event detail modal */}
      {selected && (
        <Modal
          open={!!selected}
          onClose={() => setSelected(null)}
          title={selected.title || (selected.storeName ? `${EVENT_TYPE_META[selected.type]?.label ?? selected.type} · ${selected.storeName}` : (EVENT_TYPE_META[selected.type]?.label ?? selected.type))}
          subtitle={selected.storeName ? `${selected.storeName}${selected.chainName ? ` · ${selected.chainName}` : ''} · ${selected.regionName}` : undefined}
          width="sm"
        >
          <EventDetailBody
            event={selected}
            onEdit={() => handleEdit(selected)}
            onCancel={() => handleCancel(selected)}
            onDelete={() => handleDelete(selected)}
            onLogVisit={() => handleLogVisit(selected)}
            onRequestSupplies={() => handleRequestSupplies(selected)}
          />
        </Modal>
      )}

      {/* Create modal */}
      <EventModal
        open={showCreate}
        onClose={() => setShowCreate(false)}
        onSave={e => {
          createEvent.mutate(
            {
              storeId:     e.storeId     ?? undefined,
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
            {
              onSuccess: () => {
                toast(e.storeName ? `Event scheduled at ${e.storeName}` : 'Private event scheduled')
                setShowCreate(false)
              },
            },
          )
        }}
      />

      {/* Edit modal */}
      <EventModal
        open={!!editingEvent}
        onClose={() => setEditingEvent(null)}
        initialValues={editingEvent ?? undefined}
        onSave={e => {
          if (!editingEvent) return
          const id = editingEvent.id
          setEditingEvent(null)
          updateEvent.mutate(
            {
              id,
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
            { onSuccess: () => toast(`Event updated`) },
          )
        }}
      />

      {/* Log Visit from event */}
      {logVisitEvent && (
        <LogVisitModal
          open={!!logVisitEvent}
          onClose={() => setLogVisitEvent(null)}
          store={logVisitEvent.storeId ? allStores.find(s => s.id === logVisitEvent.storeId) : undefined}
          stores={logVisitEvent.storeId ? undefined : allStores}
          linkedEvent={logVisitEvent}
          onSave={data => {
            createVisit.mutate(data, {
              onSuccess: () => {
                toast(logVisitEvent.storeName
                  ? `Visit logged at ${logVisitEvent.storeName}`
                  : 'Private event logged')
                setLogVisitEvent(null)
              },
              onError: (err: Error) => toast(err.message, 'error'),
            })
          }}
          onCloseEvent={(eventId, closeData) => {
            updateEvent.mutate(
              {
                id:              eventId,
                status:          'completed',
                completionNotes: closeData.notes,
                takeaways:       closeData.takeaways,
                accomplishments: closeData.accomplishments,
                hoursWorked:     closeData.hoursWorked,
                bottlesSold:     closeData.bottlesSold ?? null,
              },
              {
                onSuccess: () => {
                  toast('Private event logged')
                  setLogVisitEvent(null)
                },
                onError: (err: Error) => toast(err.message, 'error'),
              },
            )
          }}
        />
      )}

      {/* Supply request modal */}
      {supplyRequestEvent && (
        <SupplyRequestModal
          open={!!supplyRequestEvent}
          onClose={() => setSupplyRequestEvent(null)}
          event={supplyRequestEvent}
          saving={createSupplyRequest.isPending}
          onSave={body => {
            createSupplyRequest.mutate(body, {
              onSuccess: () => {
                toast('Supply request sent')
                setSupplyRequestEvent(null)
              },
            })
          }}
        />
      )}

    </div>
  )
}

// ─── custom toolbar ──────────────────────────────────────────────────────────

function CustomToolbar({ label, onNavigate, onView, view }: ToolbarProps) {
  const views: { key: View; label: string }[] = [
    { key: 'month',  label: 'Month'  },
    { key: 'week',   label: 'Week'   },
    { key: 'agenda', label: 'Agenda' },
  ]

  return (
    <div className="flex items-center justify-between mb-4">
      <div className="flex items-center gap-1">
        <button
          onClick={() => onNavigate('TODAY')}
          className="text-xs font-medium text-gray-600 border border-gray-200 rounded-lg px-3 py-1.5 hover:bg-gray-50 transition-colors"
        >
          Today
        </button>
        <button
          onClick={() => onNavigate('PREV')}
          className="p-1.5 rounded-lg text-gray-400 hover:text-gray-700 hover:bg-gray-50 transition-colors"
          aria-label="Previous"
        >
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
            <path d="M9 11L5 7l4-4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
        </button>
        <button
          onClick={() => onNavigate('NEXT')}
          className="p-1.5 rounded-lg text-gray-400 hover:text-gray-700 hover:bg-gray-50 transition-colors"
          aria-label="Next"
        >
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
            <path d="M5 3l4 4-4 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
        </button>
        <span className="text-sm font-semibold text-gray-900 ml-1">{label}</span>
      </div>

      <div className="flex items-center gap-0.5 bg-gray-50 border border-gray-200 rounded-lg p-0.5">
        {views.map(v => (
          <button
            key={v.key}
            onClick={() => onView(v.key)}
            className={clsx(
              'px-3 py-1 rounded-[6px] text-xs font-medium transition-all',
              view === v.key
                ? 'bg-white text-gray-900 shadow-sm border border-gray-200'
                : 'text-gray-500 hover:text-gray-800',
            )}
          >
            {v.label}
          </button>
        ))}
      </div>
    </div>
  )
}

// ─── event detail body (inside modal) ────────────────────────────────────────

function EventDetailBody({
  event,
  onEdit,
  onCancel,
  onDelete,
  onLogVisit,
  onRequestSupplies,
}: {
  event:              Event
  onEdit:             () => void
  onCancel:           () => void
  onDelete:           () => void
  onLogVisit?:        () => void
  onRequestSupplies?: () => void
}) {
  const [confirmDelete, setConfirmDelete] = useState(false)
  const statusMeta = STATUS_META[event.status]
  const typeMeta   = EVENT_TYPE_META[event.type]
  const dt         = new Date(event.scheduledAt)
  const endDt      = event.endTime ? new Date(event.endTime) : null

  return (
    <>
      <div className="px-6 py-5 space-y-4">

        {/* Type + Status row */}
        <div className="flex items-center gap-2 flex-wrap">
          {typeMeta && (
            <span className={clsx('inline-flex items-center text-[10px] font-semibold px-2 py-0.5 rounded-full', typeMeta.bg, typeMeta.color)}>
              {typeMeta.label}
            </span>
          )}
          <span className={clsx('inline-flex items-center gap-1.5 text-xs font-semibold px-2.5 py-1 rounded-full', statusMeta.bg, statusMeta.text)}>
            <span className={clsx('w-1.5 h-1.5 rounded-full', statusMeta.dot)} />
            {statusMeta.label}
          </span>
        </div>

        {/* Store link */}
        {event.storeId && (
          <div>
            <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider mb-1">Store</p>
            <Link to={`/stores/${event.storeId}`} className="text-sm font-medium text-accent hover:underline">
              {event.storeName}
            </Link>
          </div>
        )}

        {/* Address (private events) */}
        {event.type === 'private_event' && event.address && (
          <div>
            <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider mb-1">Address</p>
            <p className="text-sm text-gray-700">{event.address}</p>
          </div>
        )}

        {/* Date & time */}
        <div>
          <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider mb-1.5">Date & Time</p>
          <p className="text-sm text-gray-800 font-medium">
            {dt.toLocaleDateString('en-US', { weekday: 'short', month: 'long', day: 'numeric', year: 'numeric' })}
          </p>
          <p className="text-xs text-gray-400 mt-0.5">
            {dt.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true })}
            {endDt && (
              <> &ndash; {endDt.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true })}</>
            )}
          </p>
        </div>

        {/* Reps */}
        <div>
          <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider mb-1.5">
            Reps ({event.reps.length})
          </p>
          <div className="space-y-1.5">
            {event.reps.map(r => (
              <div key={r.id} className="flex items-center gap-2">
                <div className="w-6 h-6 rounded-full bg-accent-light flex items-center justify-center flex-shrink-0">
                  <span className="text-[9px] font-bold text-accent">
                    {r.name.split(' ').map(n => n[0]).join('').slice(0, 2)}
                  </span>
                </div>
                <span className="text-sm text-gray-700">{r.name}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Contact */}
        {event.contactName && (
          <div>
            <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider mb-1.5">Store Contact</p>
            <p className="text-sm text-gray-700">{event.contactName}</p>
          </div>
        )}

        {/* Notes */}
        {event.notes && (
          <div>
            <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider mb-1.5">Notes</p>
            <p className="text-xs text-gray-500 leading-relaxed">{event.notes}</p>
          </div>
        )}

        {/* Completion details */}
        {event.status === 'completed' && (
          <div className="rounded-lg border border-green-100 bg-green-50/50 p-3.5 space-y-2.5">
            <p className="text-[10px] font-semibold text-green-700 uppercase tracking-wider">Completion Details</p>
            {event.closedByName && (
              <div className="flex items-center gap-2">
                <div className="w-5 h-5 rounded-full bg-green-100 flex items-center justify-center flex-shrink-0">
                  <span className="text-[8px] font-bold text-green-700">
                    {event.closedByName.split(' ').map(n => n[0]).join('').slice(0, 2)}
                  </span>
                </div>
                <span className="text-xs text-gray-700">Closed by <span className="font-medium">{event.closedByName}</span></span>
              </div>
            )}
            {event.hoursWorked != null && (
              <p className="text-xs text-gray-600">
                <span className="font-medium">{event.hoursWorked}</span> {event.hoursWorked === 1 ? 'hour' : 'hours'} worked
              </p>
            )}
            {event.completionNotes && (
              <div>
                <p className="text-[10px] font-semibold text-green-600 uppercase tracking-wider mb-0.5">Notes</p>
                <p className="text-xs text-gray-500 leading-relaxed">{event.completionNotes}</p>
              </div>
            )}
            {event.takeaways && (
              <div>
                <p className="text-[10px] font-semibold text-green-600 uppercase tracking-wider mb-0.5">Takeaways</p>
                <p className="text-xs text-gray-500 leading-relaxed">{event.takeaways}</p>
              </div>
            )}
            {event.accomplishments && (
              <div>
                <p className="text-[10px] font-semibold text-green-600 uppercase tracking-wider mb-0.5">Accomplishments</p>
                <p className="text-xs text-gray-500 leading-relaxed">{event.accomplishments}</p>
              </div>
            )}
          </div>
        )}

        {event.status === 'completed' && event.visitId && (
          <div>
            <Link to="/visits" className="text-xs text-accent hover:underline font-medium">
              View in Visit Log →
            </Link>
          </div>
        )}
      </div>

      <div className="px-6 pb-5 pt-3 border-t border-gray-100 space-y-2">
        {event.status === 'scheduled' && (
          <>
            {/* Primary action */}
            {onLogVisit && (
              <Button variant="primary" size="sm" className="w-full justify-center" onClick={onLogVisit}>
                Log Visit
              </Button>
            )}

            {/* Secondary action — tastings and private events only */}
            {onRequestSupplies && (event.type === 'tasting' || event.type === 'private_event') && (
              <Button variant="secondary" size="sm" className="w-full justify-center" onClick={onRequestSupplies}>
                Request Supplies
              </Button>
            )}

            {/* Management row */}
            <div className="grid grid-cols-2 gap-2">
              <Button variant="ghost" size="sm" className="w-full justify-center" onClick={onEdit}>
                Edit
              </Button>
              <Button variant="ghost" size="sm" className="w-full justify-center text-amber-600 hover:text-amber-700 hover:bg-amber-50" onClick={onCancel}>
                Cancel
              </Button>
            </div>
          </>
        )}

        {event.status === 'cancelled' && (
          <Button variant="ghost" size="sm" className="w-full justify-center" onClick={onEdit}>
            Edit Event
          </Button>
        )}

        {/* Destructive — confirm before deleting */}
        {confirmDelete ? (
          <div className="flex items-center justify-between gap-2 rounded-lg bg-red-50 border border-red-100 px-3 py-2">
            <div>
              <p className="text-xs text-red-600 font-medium">Are you sure?</p>
              <p className="text-[11px] text-red-400">This cannot be undone.</p>
            </div>
            <div className="flex gap-1.5 flex-shrink-0">
              <button
                onClick={() => setConfirmDelete(false)}
                className="px-2.5 py-1 text-xs font-medium text-gray-500 hover:text-gray-800 hover:bg-white rounded-md transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={onDelete}
                className="px-2.5 py-1 text-xs font-semibold text-white bg-red-500 hover:bg-red-600 rounded-md transition-colors"
              >
                Delete
              </button>
            </div>
          </div>
        ) : (
          <button
            onClick={() => setConfirmDelete(true)}
            className="w-full text-center text-xs text-red-500 hover:text-red-700 transition-colors py-1"
          >
            Delete Event
          </button>
        )}
      </div>
    </>
  )
}
