import { useState, useId, useMemo, useEffect } from 'react'
import { clsx } from 'clsx'
import { useUser } from '@clerk/clerk-react'
import { Modal, useModalClose } from '@/components/ui/Modal'
import { Button } from '@/components/ui/Button'
import { TimePicker12 } from '@/components/ui/TimePicker12'
import type { DashboardStore, Event as CalEvent } from '@/types'
import type { ApiVisit, CreateVisitBody, UpdateVisitBody } from '@/lib/api'
import { useContacts, useReps, useEvents } from '@/hooks/useQueries'
import { pad2, nowTime, calcHours, addHoursToTime, defaultTimeOut } from '@/lib/timeUtils'

// ─── props ───────────────────────────────────────────────────────────────────

export interface CloseEventData {
  notes?:           string
  hoursWorked?:     number
  takeaways?:       string
  accomplishments?: string
  bottlesSold?:     number
}

interface LogVisitModalProps {
  open:           boolean
  onClose:        () => void
  onSave:         (data: CreateVisitBody) => void
  onUpdate?:      (id: string, body: UpdateVisitBody) => void
  onCloseEvent?:  (eventId: string, data: CloseEventData) => void
  store?:         DashboardStore
  stores?:        DashboardStore[]
  defaultDate?:   string
  editVisit?:     ApiVisit
  linkedEvent?:   CalEvent
}

// ─── types ───────────────────────────────────────────────────────────────────

type LogType = 'visit' | 'tasting' | 'private_event'

// map logType → matching calendar EventType
const LOG_TO_EVENT_TYPE: Record<LogType, string> = {
  visit:         'tasking',
  tasting:       'tasting',
  private_event: 'private_event',
}

// ─── helpers ─────────────────────────────────────────────────────────────────

const TODAY = new Date().toISOString().slice(0, 10)


// ─── form ─────────────────────────────────────────────────────────────────────

const ACTION_OPTIONS = [
  { value: 'stocked',        label: 'Stocked shelf'  },
  { value: 'checked',        label: 'Checked in'     },
  { value: 'issue-reported', label: 'Issue reported' },
  { value: 'order-placed',   label: 'Order placed'   },
] as const

interface FormValues {
  logType:         LogType
  storeId:         string
  repId:           string
  date:            string
  timeIn:          string
  timeOut:         string
  linkedEventId:   string
  onShelf:         string
  casesDelivered:  string
  contactId:       string
  action:          string
  notes:           string
  takeaways:       string
  accomplishments: string
  bottlesSold:     string
}

function makeEmpty(initDate = TODAY): FormValues {
  const timeIn = nowTime()
  return {
    logType:         'visit',
    storeId:         '',
    repId:           '',
    date:            initDate,
    timeIn,
    timeOut:         defaultTimeOut(timeIn),
    linkedEventId:   '',
    onShelf:         '',
    casesDelivered:  '',
    contactId:       '',
    action:          '',
    notes:           '',
    takeaways:       '',
    accomplishments: '',
    bottlesSold:     '',
  }
}

type Errors = Partial<Record<keyof FormValues, string>>

function validate(v: FormValues, mode: 'locked' | 'pick', isAdmin: boolean): Errors {
  const e: Errors = {}
  const isPrivate = v.logType === 'private_event'
  if (isPrivate) {
    if (!v.linkedEventId) e.linkedEventId = 'Select a calendar event to close out'
  } else {
    if (mode === 'pick' && !v.storeId) e.storeId = 'Select a store'
    if (isAdmin && !v.repId)           e.repId   = 'Select a rep'
    if (!v.date)                       e.date    = 'Date is required'
    if (v.onShelf === '' || isNaN(Number(v.onShelf)) || Number(v.onShelf) < 0)
      e.onShelf = 'Enter a valid bottle count'
  }
  if (!v.notes.trim()) e.notes = 'Notes are required'
  if (!v.timeIn || !v.timeOut) {
    e.timeOut = 'Time in and time out are required'
  } else if (calcHours(v.timeIn, v.timeOut) === null) {
    e.timeOut = 'Time out must be after time in'
  }
  return e
}

// ─── component ───────────────────────────────────────────────────────────────

export function LogVisitModal({
  open, onClose, onSave, onUpdate, onCloseEvent,
  store, stores, defaultDate, editVisit, linkedEvent,
}: LogVisitModalProps) {
  const uid  = useId()
  const mode = (store || editVisit) ? 'locked' : 'pick'

  const { user } = useUser()
  const isAdmin    = (user?.publicMetadata as { role?: string })?.role === 'admin'
  const { data: allReps = [] } = useReps()
  const activeReps = allReps.filter(r => r.status === 'active')
  const myRep      = allReps.find(r => r.clerkUserId === user?.id)
  const defaultRepId = myRep?.id ?? store?.repId ?? ''

  const [values, setValues]   = useState<FormValues>(() => ({ ...makeEmpty(defaultDate), repId: defaultRepId }))
  const [errors, setErrors]   = useState<Errors>({})
  const [touched, setTouched] = useState<Partial<Record<keyof FormValues, boolean>>>({})

  useEffect(() => {
    if (!open) return
    if (editVisit) {
      const dt    = new Date(editVisit.date)
      const tIn   = `${pad2(dt.getHours())}:${pad2(dt.getMinutes())}`
      const tOut  = editVisit.hoursWorked != null ? addHoursToTime(tIn, editVisit.hoursWorked) : ''
      setValues({
        logType:         (editVisit.logType as LogType) ?? 'visit',
        storeId:         editVisit.storeId,
        repId:           editVisit.repId,
        date:            editVisit.date.slice(0, 10),
        timeIn:          tIn,
        timeOut:         tOut,
        linkedEventId:   '',
        onShelf:         editVisit.onShelf.toString(),
        casesDelivered:  '',
        contactId:       editVisit.contactId      ?? '',
        action:          editVisit.action          ?? '',
        notes:           editVisit.notes           ?? '',
        takeaways:       editVisit.takeaways       ?? '',
        accomplishments: editVisit.accomplishments ?? '',
        bottlesSold:     editVisit.bottlesSold != null ? editVisit.bottlesSold.toString() : '',
      })
    } else {
      const init: FormValues = { ...makeEmpty(defaultDate), repId: defaultRepId }
      if (linkedEvent) {
        const dt = new Date(linkedEvent.scheduledAt)
        init.linkedEventId = linkedEvent.id
        init.logType       = linkedEvent.type === 'tasting' ? 'tasting'
          : linkedEvent.type === 'private_event' ? 'private_event'
          : 'visit'
        init.date          = linkedEvent.scheduledAt.slice(0, 10)
        init.timeIn        = `${pad2(dt.getHours())}:${pad2(dt.getMinutes())}`
        init.timeOut       = defaultTimeOut(init.timeIn)
        if (linkedEvent.contactId) init.contactId = linkedEvent.contactId
      }
      setValues(init)
    }
    setErrors({})
    setTouched({})
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, editVisit])

  const isPrivate = values.logType === 'private_event'

  const activeStore: DashboardStore | undefined = mode === 'locked'
    ? (store ?? stores?.find(s => s.id === editVisit?.storeId))
    : stores?.find(s => s.id === values.storeId)

  const storeGroups = useMemo(() => {
    if (mode === 'locked' || !stores) return []
    const map = new Map<string, { name: string; slug: string; stores: DashboardStore[] }>()
    for (const s of stores) {
      if (!map.has(s.region)) map.set(s.region, { name: s.regionName, slug: s.region, stores: [] })
      map.get(s.region)!.stores.push(s)
    }
    return Array.from(map.values())
  }, [mode, stores])

  const { data: contactsData } = useContacts(activeStore?.id ? { storeId: activeStore.id } : undefined)
  const storeContacts = activeStore?.id ? (contactsData ?? []) : []

  const { data: scheduledEvents = [] } = useEvents(
    { ...(mode === 'locked' && activeStore?.id ? { storeId: activeStore.id } : {}), status: 'scheduled' },
    { enabled: !editVisit && (mode === 'pick' || !!activeStore?.id) },
  )

  // filter to only show events matching the current log type
  const linkedEvents = scheduledEvents.filter(ev => ev.type === LOG_TO_EVENT_TYPE[values.logType])

  function set<K extends keyof FormValues>(key: K, val: FormValues[K]) {
    setValues(v => ({ ...v, [key]: val }))
  }

  function handleLinkedEventChange(eventId: string) {
    if (!eventId) { set('linkedEventId', ''); return }
    const ev = scheduledEvents.find(e => e.id === eventId)
    if (!ev) { set('linkedEventId', eventId); return }
    const dt = new Date(ev.scheduledAt)
    const newLogType: LogType = ev.type === 'tasting' ? 'tasting'
      : ev.type === 'private_event' ? 'private_event'
      : 'visit'
    setValues(v => ({
      ...v,
      linkedEventId: eventId,
      // only populate store for non-private events that have one
      ...(mode === 'pick' && ev.storeId ? { storeId: ev.storeId } : {}),
      date:      ev.scheduledAt.slice(0, 10),
      timeIn:    `${pad2(dt.getHours())}:${pad2(dt.getMinutes())}`,
      timeOut:   defaultTimeOut(`${pad2(dt.getHours())}:${pad2(dt.getMinutes())}`),
      contactId: ev.contactId ?? v.contactId,
      logType:   newLogType,
    }))
  }

  function blur(key: keyof FormValues) {
    setTouched(t => ({ ...t, [key]: true }))
    setErrors(validate(values, mode, isAdmin))
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setTouched(Object.fromEntries(Object.keys(makeEmpty()).map(k => [k, true])))
    const errs = validate(values, mode, isAdmin)
    setErrors(errs)
    if (Object.keys(errs).length) return

    const hoursWorked = calcHours(values.timeIn, values.timeOut)

    // edit existing visit
    if (editVisit && onUpdate) {
      onUpdate(editVisit.id, {
        onShelf:         Number(values.onShelf),
        action:          values.action || null,
        notes:           values.notes.trim()          || undefined,
        contactId:       values.contactId              || null,
        takeaways:       values.takeaways.trim()       || null,
        accomplishments: values.accomplishments.trim() || null,
        hoursWorked:     hoursWorked,
        bottlesSold:     values.bottlesSold !== '' ? Number(values.bottlesSold) : null,
      })
      reset(); onClose()
      return
    }

    // close out a private calendar event — no StoreVisit created
    if (isPrivate && onCloseEvent) {
      onCloseEvent(values.linkedEventId, {
        notes:           values.notes.trim()          || undefined,
        hoursWorked:     hoursWorked ?? undefined,
        takeaways:       values.takeaways.trim()       || undefined,
        accomplishments: values.accomplishments.trim() || undefined,
        bottlesSold:     values.bottlesSold !== '' ? Number(values.bottlesSold) : undefined,
      })
      reset(); onClose()
      return
    }

    const visitedAt = new Date(`${values.date}T${values.timeIn}:00`).toISOString()
    onSave({
      storeId:         activeStore!.id,
      repId:           values.repId || undefined,
      logType:         values.logType,
      action:          values.action || undefined,
      visitedAt,
      onShelf:         Number(values.onShelf),
      casesDelivered:  values.casesDelivered && Number(values.casesDelivered) > 0
                         ? Number(values.casesDelivered) : undefined,
      notes:           values.notes.trim(),
      takeaways:       values.takeaways.trim()       || undefined,
      accomplishments: values.accomplishments.trim() || undefined,
      hoursWorked:     hoursWorked ?? undefined,
      bottlesSold:     values.bottlesSold !== '' ? Number(values.bottlesSold) : undefined,
      contactId:       values.contactId || undefined,
      linkedEventId:   values.linkedEventId || undefined,
    })
    reset(); onClose()
  }

  const isDirty = editVisit
    ? (
      values.onShelf      !== editVisit.onShelf.toString() ||
      values.notes        !== (editVisit.notes           ?? '') ||
      (values.contactId || null) !== editVisit.contactId  ||
      values.takeaways    !== (editVisit.takeaways       ?? '') ||
      values.accomplishments !== (editVisit.accomplishments ?? '') ||
      values.timeOut      !== '' ||
      values.bottlesSold  !== (editVisit.bottlesSold  != null ? editVisit.bottlesSold.toString()  : '')
    )
    : (values.onShelf !== '' || values.notes !== '' || values.linkedEventId !== '' ||
       values.logType !== 'visit' || values.action !== '' || values.takeaways !== '' ||
       values.accomplishments !== '' || values.bottlesSold !== '')

  function reset() { setValues({ ...makeEmpty(defaultDate), repId: defaultRepId }); setErrors({}); setTouched({}) }
  function handleClose() { reset(); onClose() }
  function err(key: keyof FormValues) { return touched[key] ? errors[key] : undefined }

  const modalTitle = editVisit ? 'Edit Log'
    : isPrivate ? 'Log Private Event'
    : values.logType === 'tasting' ? 'Log Tasting'
    : 'Log Visit'

  const inputCls = (hasErr?: string) => clsx(
    'w-full px-3 py-2 text-sm bg-white border rounded-lg outline-none transition-all',
    'focus:border-accent focus:ring-2 focus:ring-accent/10 placeholder:text-gray-400',
    hasErr ? 'border-red-300' : 'border-gray-200',
  )

  // available log types — hide private_event in locked (store-specific) mode
  const logTypes: { value: LogType; label: string }[] = mode === 'locked'
    ? [{ value: 'visit', label: 'Visit' }, { value: 'tasting', label: 'Tasting' }]
    : [{ value: 'visit', label: 'Visit' }, { value: 'tasting', label: 'Tasting' }, { value: 'private_event', label: 'Private Event' }]

  return (
    <Modal
      open={open}
      onClose={handleClose}
      title={modalTitle}
      subtitle={
        isPrivate
          ? 'Link and close out a private calendar event'
          : mode === 'locked'
          ? (activeStore?.name ?? '')
          : 'Select a store to log a visit'
      }
      width="sm"
      confirmDiscard={isDirty}
    >
      <form onSubmit={handleSubmit} noValidate>
        <div className="px-6 py-5 space-y-5">

          {/* ── Type toggle ── */}
          {!editVisit && (
            <div>
              <p className="text-xs font-medium text-gray-600 mb-2">Type</p>
              <div className="flex gap-2">
                {logTypes.map(({ value: t, label }) => (
                  <button
                    key={t}
                    type="button"
                    onClick={() => setValues(v => ({ ...v, logType: t, linkedEventId: '' }))}
                    className={clsx(
                      'flex-1 py-2 text-sm font-medium rounded-lg border transition-all',
                      values.logType === t
                        ? 'border-accent bg-accent-light text-accent'
                        : 'border-gray-200 text-gray-500 hover:border-gray-300 hover:text-gray-700',
                    )}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* ── Action ── */}
          {!isPrivate && (
            <div>
              <p className="text-xs font-medium text-gray-600 mb-2">
                What happened? <span className="text-gray-400 font-normal">(optional)</span>
              </p>
              <div className="grid grid-cols-2 gap-2">
                {ACTION_OPTIONS.map(({ value, label }) => (
                  <button
                    key={value}
                    type="button"
                    onClick={() => set('action', values.action === value ? '' : value)}
                    className={clsx(
                      'py-2 px-3 text-xs font-medium rounded-lg border transition-all text-left',
                      values.action === value
                        ? 'border-accent bg-accent-light text-accent'
                        : 'border-gray-200 text-gray-500 hover:border-gray-300 hover:text-gray-700',
                    )}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* ── Locked linked event (from calendar) ── */}
          {!editVisit && linkedEvent && (
            <div>
              <p className="text-xs font-medium text-gray-600 mb-1.5">Closing out</p>
              <div className="flex items-center gap-2.5 px-3 py-2 rounded-lg border border-green-200 bg-green-50/50">
                <div className="w-6 h-6 rounded-full bg-green-100 flex items-center justify-center flex-shrink-0">
                  <svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" className="text-green-600">
                    <rect x="1" y="2" width="14" height="13" rx="2"/><path d="M5 1v2M11 1v2M1 6h14" strokeLinecap="round"/>
                  </svg>
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-gray-700 truncate">
                    {linkedEvent.title || linkedEvent.storeName || 'Scheduled event'}
                  </p>
                  <p className="text-[10px] text-green-600">Will be marked complete on save</p>
                </div>
              </div>
            </div>
          )}

          {/* ── Link to calendar event (freeform) ── */}
          {!editVisit && !linkedEvent && linkedEvents.length > 0 && (
            <div>
              <label htmlFor={`${uid}-event`} className="block text-xs font-medium text-gray-600 mb-1.5">
                Link to Event{' '}
                <span className="text-gray-400 font-normal">
                  {isPrivate ? '(required — closes it out)' : '(optional — closes it out)'}
                </span>
              </label>
              <select
                id={`${uid}-event`}
                value={values.linkedEventId}
                onChange={e => handleLinkedEventChange(e.target.value)}
                className={clsx(inputCls(err('linkedEventId')), !values.linkedEventId && 'text-gray-400')}
              >
                <option value="">{isPrivate ? 'Select an event…' : 'No linked event'}</option>
                {linkedEvents.map(ev => {
                  const dt = new Date(ev.scheduledAt)
                  const typeLabel = ev.type === 'tasting' ? 'Tasting' : ev.type === 'private_event' ? 'Private Event' : 'Visit'
                  const dateStr = dt.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
                  const timeStr = dt.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true })
                  const prefix = ev.storeName ? `${ev.storeName} · ` : ''
                  return (
                    <option key={ev.id} value={ev.id} className="text-gray-900">
                      {`${prefix}${typeLabel} · ${dateStr} ${timeStr}`}
                    </option>
                  )
                })}
              </select>
              {err('linkedEventId') && <p className="mt-1 text-xs text-red-500">{err('linkedEventId')}</p>}
              {values.linkedEventId && (
                <p className="mt-1 text-xs text-green-600">Event details auto-populated · will be marked complete on save</p>
              )}
            </div>
          )}

          {/* ── no matching events notice (private_event only) ── */}
          {!editVisit && !linkedEvent && isPrivate && linkedEvents.length === 0 && (
            <p className="text-xs text-gray-400 bg-gray-50 rounded-lg px-3 py-2">
              No scheduled private events found. Schedule one on the Calendar first.
            </p>
          )}

          {/* ── Store (non-private only) ── */}
          {!isPrivate && (
            mode === 'locked' ? (
              <div>
                <p className="text-xs font-medium text-gray-600 mb-1.5">Store</p>
                <div className="flex items-center gap-2.5 px-3 py-2 rounded-lg border border-gray-200 bg-gray-50">
                  <div className="w-6 h-6 rounded-md bg-gray-200 flex items-center justify-center flex-shrink-0">
                    <span className="text-[9px] font-bold text-gray-400">
                      {(activeStore?.name ?? editVisit?.storeName ?? '').charAt(0)}
                    </span>
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-gray-400 truncate">{activeStore?.name ?? editVisit?.storeName}</p>
                    <p className="text-[10px] text-gray-300">{activeStore?.chainName} · {activeStore?.regionName}</p>
                  </div>
                  <svg width="12" height="12" viewBox="0 0 16 16" fill="none" className="text-gray-300 flex-shrink-0">
                    <rect x="3" y="7" width="10" height="8" rx="1.5" stroke="currentColor" strokeWidth="1.5"/>
                    <path d="M5 7V5a3 3 0 016 0v2" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
                  </svg>
                </div>
              </div>
            ) : (
              <div>
                <label htmlFor={`${uid}-store`} className="block text-xs font-medium text-gray-600 mb-1.5">
                  Store <span className="text-red-400">*</span>
                </label>
                <select
                  id={`${uid}-store`}
                  value={values.storeId}
                  onChange={e => { set('storeId', e.target.value); set('linkedEventId', ''); set('contactId', '') }}
                  onBlur={() => blur('storeId')}
                  className={clsx(inputCls(err('storeId')), !values.storeId && 'text-gray-400')}
                >
                  <option value="" disabled>Select a store…</option>
                  {storeGroups.map(({ slug, name, stores: ms }) => (
                    <optgroup key={slug} label={name}>
                      {ms.map(s => (
                        <option key={s.id} value={s.id} className="text-gray-900">{s.name}</option>
                      ))}
                    </optgroup>
                  ))}
                </select>
                {err('storeId') && <p className="mt-1 text-xs text-red-500">{err('storeId')}</p>}
              </div>
            )
          )}

          {/* ── Rep ── */}
          {!isPrivate && (
            <div>
              <p className="text-xs font-medium text-gray-600 mb-1.5">
                Rep {isAdmin && <span className="text-red-400">*</span>}
              </p>
              {isAdmin ? (
                <>
                  <select
                    value={values.repId}
                    onChange={e => set('repId', e.target.value)}
                    onBlur={() => blur('repId')}
                    className={clsx(inputCls(err('repId')), !values.repId && 'text-gray-400')}
                  >
                    <option value="" disabled>Select rep…</option>
                    {activeReps.map(r => (
                      <option key={r.id} value={r.id} className="text-gray-900">
                        {r.name}{r.clerkUserId === user?.id ? ' (you)' : ''}
                      </option>
                    ))}
                  </select>
                  {err('repId') && <p className="mt-1 text-xs text-red-500">{err('repId')}</p>}
                </>
              ) : (
                <div className="flex items-center gap-2 px-3 py-2 rounded-lg border bg-gray-50 border-gray-200">
                  {myRep ? (
                    <>
                      <div className="w-5 h-5 rounded-full bg-accent-light flex items-center justify-center flex-shrink-0">
                        <span className="text-[9px] font-bold text-accent">
                          {myRep.name.split(' ').map((n: string) => n[0]).join('').slice(0, 2)}
                        </span>
                      </div>
                      <span className="text-sm text-gray-600">{myRep.name}</span>
                    </>
                  ) : (
                    <span className="text-sm text-gray-400">No rep linked to your account</span>
                  )}
                </div>
              )}
            </div>
          )}

          {/* ── Date + Time In / Time Out (non-private only) ── */}
          {!isPrivate && (
            <>
              <div>
                <label htmlFor={`${uid}-date`} className="block text-xs font-medium text-gray-600 mb-1.5">
                  Date <span className="text-red-400">*</span>
                </label>
                <input
                  id={`${uid}-date`}
                  type="date"
                  value={values.date}
                  onChange={e => set('date', e.target.value)}
                  onBlur={() => blur('date')}
                  className={inputCls(err('date'))}
                />
                {err('date') && <p className="mt-1 text-xs text-red-500">{err('date')}</p>}
              </div>
              <div>
                <p className="text-xs font-medium text-gray-600 mb-1.5">
                  Time In / Time Out <span className="text-red-400">*</span>
                </p>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label htmlFor={`${uid}-timein`} className="block text-[11px] text-gray-500 mb-1">Time In</label>
                    <TimePicker12
                      id={`${uid}-timein`}
                      value={values.timeIn}
                      onChange={v => set('timeIn', v)}
                      onBlur={() => blur('timeOut')}
                      hasError={!!err('timeOut')}
                    />
                  </div>
                  <div>
                    <label htmlFor={`${uid}-timeout`} className="block text-[11px] text-gray-500 mb-1">Time Out</label>
                    <TimePicker12
                      id={`${uid}-timeout`}
                      value={values.timeOut}
                      onChange={v => set('timeOut', v)}
                      onBlur={() => blur('timeOut')}
                      hasError={!!err('timeOut')}
                    />
                  </div>
                </div>
                {err('timeOut')
                  ? <p className="mt-1.5 text-xs text-red-500">{err('timeOut')}</p>
                  : calcHours(values.timeIn, values.timeOut) !== null && (
                    <p className="mt-1.5 text-xs text-gray-500">
                      Total: <span className="font-semibold text-gray-700">{calcHours(values.timeIn, values.timeOut)!.toFixed(2)} hrs</span>
                    </p>
                  )
                }
              </div>
            </>
          )}

          {/* ── Time In / Time Out (private events only) ── */}
          {isPrivate && (
            <div>
              <p className="text-xs font-medium text-gray-600 mb-1.5">
                Time In / Time Out <span className="text-red-400">*</span>
              </p>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label htmlFor={`${uid}-timein-p`} className="block text-[11px] text-gray-500 mb-1">Time In</label>
                  <TimePicker12
                    id={`${uid}-timein-p`}
                    value={values.timeIn}
                    onChange={v => set('timeIn', v)}
                    onBlur={() => blur('timeOut')}
                    hasError={!!err('timeOut')}
                  />
                </div>
                <div>
                  <label htmlFor={`${uid}-timeout-p`} className="block text-[11px] text-gray-500 mb-1">Time Out</label>
                  <TimePicker12
                    id={`${uid}-timeout-p`}
                    value={values.timeOut}
                    onChange={v => set('timeOut', v)}
                    onBlur={() => blur('timeOut')}
                    hasError={!!err('timeOut')}
                  />
                </div>
              </div>
              {err('timeOut')
                ? <p className="mt-1.5 text-xs text-red-500">{err('timeOut')}</p>
                : calcHours(values.timeIn, values.timeOut) !== null && (
                  <p className="mt-1.5 text-xs text-gray-500">
                    Total: <span className="font-semibold text-gray-700">{calcHours(values.timeIn, values.timeOut)!.toFixed(2)} hrs</span>
                  </p>
                )
              }
            </div>
          )}

          {/* ── Bottles on shelf (non-private only) ── */}
          {!isPrivate && (
            <div>
              <label htmlFor={`${uid}-onShelf`} className="block text-xs font-medium text-gray-600 mb-1.5">
                Bottles on Shelf <span className="text-red-400">*</span>
              </label>
              <input
                id={`${uid}-onShelf`}
                type="number"
                min="0"
                placeholder="0"
                value={values.onShelf}
                onChange={e => set('onShelf', e.target.value)}
                onBlur={() => blur('onShelf')}
                className={inputCls(err('onShelf'))}
              />
              {err('onShelf')
                ? <p className="mt-1 text-xs text-red-500">{err('onShelf')}</p>
                : <p className="mt-1 text-xs text-gray-400">Physical count at time of visit</p>
              }
            </div>
          )}

          {/* ── Cases delivered (non-private only) ── */}
          {!isPrivate && (
            <div>
              <label htmlFor={`${uid}-casesDelivered`} className="block text-xs font-medium text-gray-600 mb-1.5">
                Cases Dropped Off <span className="text-gray-400 font-normal">(optional)</span>
              </label>
              <input
                id={`${uid}-casesDelivered`}
                type="number"
                min="0"
                placeholder="0"
                value={values.casesDelivered}
                onChange={e => set('casesDelivered', e.target.value)}
                className={inputCls()}
              />
              <p className="mt-1 text-xs text-gray-400">Cases physically delivered at this visit — tracked in inventory</p>
            </div>
          )}

          {/* ── Contact (non-private only) ── */}
          {!isPrivate && storeContacts.length > 0 && (
            <div>
              <label htmlFor={`${uid}-contact`} className="block text-xs font-medium text-gray-600 mb-1.5">
                Contact <span className="text-gray-400 font-normal">(optional)</span>
              </label>
              <select
                id={`${uid}-contact`}
                value={values.contactId}
                onChange={e => set('contactId', e.target.value)}
                className={clsx(inputCls(), !values.contactId && 'text-gray-400')}
              >
                <option value="">No contact associated</option>
                {storeContacts.map(c => (
                  <option key={c.id} value={c.id} className="text-gray-900">
                    {c.name}{c.role ? ` — ${c.role}` : ''}
                  </option>
                ))}
              </select>
            </div>
          )}

          {/* ── Notes (required) ── */}
          <div>
            <label htmlFor={`${uid}-notes`} className="block text-xs font-medium text-gray-600 mb-1.5">
              Notes <span className="text-red-400">*</span>
            </label>
            <textarea
              id={`${uid}-notes`}
              rows={3}
              placeholder="What happened? Describe the outcome and any follow-ups…"
              value={values.notes}
              onChange={e => set('notes', e.target.value)}
              onBlur={() => blur('notes')}
              className={clsx(inputCls(err('notes')), 'resize-none')}
            />
            {err('notes') && <p className="mt-1 text-xs text-red-500">{err('notes')}</p>}
          </div>

          {/* ── Takeaways ── */}
          <div>
            <label htmlFor={`${uid}-takeaways`} className="block text-xs font-medium text-gray-600 mb-1.5">
              Takeaways <span className="text-gray-400 font-normal">(optional)</span>
            </label>
            <textarea
              id={`${uid}-takeaways`}
              rows={2}
              placeholder="What did you learn? Any insights or lessons…"
              value={values.takeaways}
              onChange={e => set('takeaways', e.target.value)}
              className={clsx(inputCls(), 'resize-none')}
            />
          </div>

          {/* ── Accomplishments ── */}
          <div>
            <label htmlFor={`${uid}-accomplishments`} className="block text-xs font-medium text-gray-600 mb-1.5">
              Accomplishments <span className="text-gray-400 font-normal">(optional)</span>
            </label>
            <textarea
              id={`${uid}-accomplishments`}
              rows={2}
              placeholder="What went well? Highlight wins and successes…"
              value={values.accomplishments}
              onChange={e => set('accomplishments', e.target.value)}
              className={clsx(inputCls(), 'resize-none')}
            />
          </div>

          {/* ── Bottles sold ── */}
          {(isPrivate || values.logType === 'tasting' || !!editVisit) && (
            <div>
              <label htmlFor={`${uid}-bottles`} className="block text-xs font-medium text-gray-600 mb-1.5">
                Bottles Sold <span className="text-gray-400 font-normal">(optional)</span>
              </label>
              <input
                id={`${uid}-bottles`}
                type="number"
                min="0"
                placeholder="0"
                value={values.bottlesSold}
                onChange={e => set('bottlesSold', e.target.value)}
                className={inputCls()}
              />
            </div>
          )}

        </div>

        <VisitModalFooter isEdit={!!editVisit} />
      </form>
    </Modal>
  )
}

// ─── footer ───────────────────────────────────────────────────────────────────

function VisitModalFooter({ isEdit }: { isEdit?: boolean }) {
  const requestClose = useModalClose()
  return (
    <div className="px-6 py-4 border-t border-gray-100 flex items-center justify-between bg-gray-50/50 rounded-b-2xl">
      <div>
        {!isEdit && <p className="text-xs text-gray-400"><span className="text-red-400">*</span> Required</p>}
      </div>
      <div className="flex gap-2">
        <Button type="button" variant="ghost" size="sm" onClick={requestClose}>Cancel</Button>
        <Button type="submit" variant="primary" size="sm">{isEdit ? 'Save Changes' : 'Save Log'}</Button>
      </div>
    </div>
  )
}
