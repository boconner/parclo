import { useState, useId, useMemo, useEffect } from 'react'
import { clsx } from 'clsx'
import { Modal, useModalClose } from '@/components/ui/Modal'
import { Button } from '@/components/ui/Button'
import type { Event, EventType } from '@/types'
import { useStores, useReps, useContacts } from '@/hooks/useQueries'

// ─── constants ────────────────────────────────────────────────────────────────

export const EVENT_TYPE_META: Record<EventType, { label: string; color: string; bg: string }> = {
  tasting:       { label: 'Tasting',       color: 'text-accent',    bg: 'bg-accent-light' },
  tasking:       { label: 'Visit',         color: 'text-blue-600',  bg: 'bg-blue-50'      },
  private_event: { label: 'Private Event', color: 'text-purple-600', bg: 'bg-purple-50'   },
}

// ─── props ───────────────────────────────────────────────────────────────────

interface EventModalProps {
  open:               boolean
  onClose:            () => void
  onSave:             (data: Omit<Event, 'id' | 'status' | 'completionNotes' | 'visitId'>) => void
  preselectedStoreId?: string
  initialValues?:     Event
}

// ─── form ────────────────────────────────────────────────────────────────────

interface FormValues {
  storeId:     string
  type:        EventType
  title:       string
  address:     string
  bottlesSold: string
  date:        string
  time:        string
  endTime:     string
  repIds:      string[]
  notes:       string
  contactId:   string
}

const TODAY = new Date().toISOString().slice(0, 10)

const EMPTY: FormValues = {
  storeId:     '',
  type:        'tasting',
  title:       '',
  address:     '',
  bottlesSold: '',
  date:        TODAY,
  time:        '14:00',
  endTime:     '16:00',
  repIds:      [],
  notes:       '',
  contactId:   '',
}

type Errors = Partial<Record<keyof FormValues, string>>

function eventToForm(e: Event): FormValues {
  const dt  = new Date(e.scheduledAt)
  const end = e.endTime ? new Date(e.endTime) : null
  const pad = (n: number) => String(n).padStart(2, '0')
  return {
    storeId:     e.storeId     ?? '',
    type:        e.type,
    title:       e.title       ?? '',
    address:     e.address     ?? '',
    bottlesSold: e.bottlesSold != null ? String(e.bottlesSold) : '',
    date:        e.scheduledAt.slice(0, 10),
    time:        `${pad(dt.getHours())}:${pad(dt.getMinutes())}`,
    endTime:     end ? `${pad(end.getHours())}:${pad(end.getMinutes())}` : '16:00',
    repIds:      e.reps.map(r => r.id),
    notes:       e.notes       ?? '',
    contactId:   e.contactId   ?? '',
  }
}

function validate(v: FormValues, lockedStore: boolean): Errors {
  const e: Errors = {}
  const isPrivate = v.type === 'private_event'
  if (isPrivate && !v.title.trim()) e.title   = 'Title is required'
  if (!isPrivate && !lockedStore && !v.storeId) e.storeId = 'Select a store'
  if (!v.date)                      e.date    = 'Date is required'
  if (v.repIds.length === 0)        e.repIds  = 'Select at least one rep'
  return e
}

const inputCls = (hasErr?: string) => clsx(
  'w-full px-3 py-2 text-sm bg-white border rounded-lg outline-none transition-all',
  'focus:border-accent focus:ring-2 focus:ring-accent/10 placeholder:text-gray-400',
  hasErr ? 'border-red-300' : 'border-gray-200',
)

// ─── component ───────────────────────────────────────────────────────────────

export function EventModal({
  open,
  onClose,
  onSave,
  preselectedStoreId,
  initialValues,
}: EventModalProps) {
  const uid    = useId()
  const isEdit = !!initialValues
  const locked = !!preselectedStoreId && !isEdit

  const [values, setValues]   = useState<FormValues>(() => {
    if (initialValues) return eventToForm(initialValues)
    return preselectedStoreId ? { ...EMPTY, storeId: preselectedStoreId } : EMPTY
  })
  const [errors, setErrors]   = useState<Errors>({})
  const [touched, setTouched] = useState<Partial<Record<keyof FormValues, boolean>>>({})

  useEffect(() => {
    if (open) {
      if (initialValues) {
        setValues(eventToForm(initialValues))
      } else {
        setValues(preselectedStoreId ? { ...EMPTY, storeId: preselectedStoreId } : EMPTY)
      }
      setErrors({})
      setTouched({})
    }
  }, [open, initialValues, preselectedStoreId])

  const { data: apiStores } = useStores()
  const { data: apiReps   } = useReps()
  const allStores   = apiStores ?? []
  const activeStore = allStores.find(s => s.id === values.storeId)
  const activeReps  = (apiReps ?? []).filter(r => r.status === 'active')

  const isPrivate = values.type === 'private_event'

  const storeGroups = useMemo(() => {
    const map: Map<string, { name: string; slug: string; stores: typeof allStores }> = new Map()
    for (const s of allStores) {
      if (!map.has(s.region)) map.set(s.region, { name: s.regionName, slug: s.region, stores: [] })
      map.get(s.region)!.stores.push(s)
    }
    return Array.from(map.values())
  }, [allStores])

  const { data: contactsData } = useContacts(activeStore?.id ? { storeId: activeStore.id } : undefined)
  const storeContacts = activeStore?.id ? (contactsData ?? []) : []

  function set<K extends keyof FormValues>(key: K, val: FormValues[K]) {
    setValues(v => ({ ...v, [key]: val }))
  }

  function toggleRep(id: string) {
    setValues(v => ({
      ...v,
      repIds: v.repIds.includes(id) ? v.repIds.filter(r => r !== id) : [...v.repIds, id],
    }))
  }

  function blur(key: keyof FormValues) {
    setTouched(t => ({ ...t, [key]: true }))
    setErrors(validate({ ...values, [key]: values[key] }, locked))
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    const allTouched = Object.fromEntries(Object.keys(EMPTY).map(k => [k, true]))
    setTouched(allTouched)
    const errs = validate(values, locked)
    setErrors(errs)
    if (Object.keys(errs).length) return

    const store   = !isPrivate ? allStores.find(s => s.id === values.storeId) : undefined
    const reps    = activeReps.filter(r => values.repIds.includes(r.id))
    const contact = storeContacts.find(c => c.id === values.contactId)

    const startDt = new Date(`${values.date}T${values.time}:00`)
    const endDt   = new Date(`${values.date}T${values.endTime}:00`)
    onSave({
      type:        values.type,
      title:       values.title.trim()   || null,
      storeId:     store?.id             ?? null,
      storeName:   store?.name           ?? null,
      region:      store?.region         ?? null,
      regionName:  store?.regionName     ?? null,
      chainId:     store?.chainId        ?? null,
      chainName:   store?.chainName      ?? null,
      address:     isPrivate ? (values.address.trim() || null) : null,
      bottlesSold: isPrivate && values.bottlesSold !== '' ? Number(values.bottlesSold) : null,
      scheduledAt: startDt.toISOString(),
      endTime:     endDt > startDt ? endDt.toISOString() : null,
      notes:       values.notes.trim()   || null,
      contactId:   contact?.id           ?? null,
      contactName: contact?.name         ?? null,
      reps:        reps.map(r => ({ id: r.id, name: r.name })),
    })
  }

  function err(key: keyof FormValues) { return touched[key] ? errors[key] : undefined }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={isEdit ? 'Edit Event' : 'Schedule Event'}
      subtitle={
        isEdit
          ? 'Update the details for this event'
          : isPrivate
          ? 'Schedule a private off-site event'
          : 'Schedule an event at a store location'
      }
      width="md"
    >
      <form onSubmit={handleSubmit} noValidate>
        <div className="px-6 py-5 space-y-5">

          {/* Event type */}
          <div>
            <p className="text-xs font-medium text-gray-600 mb-2">
              Event Type <span className="text-red-400">*</span>
            </p>
            <div className="flex gap-2">
              {(Object.keys(EVENT_TYPE_META) as EventType[]).map(t => (
                <button
                  key={t}
                  type="button"
                  onClick={() => set('type', t)}
                  className={clsx(
                    'flex-1 py-2 text-sm font-medium rounded-lg border transition-all',
                    values.type === t
                      ? 'border-accent bg-accent-light text-accent'
                      : 'border-gray-200 text-gray-500 hover:border-gray-300 hover:text-gray-700',
                  )}
                >
                  {EVENT_TYPE_META[t].label}
                </button>
              ))}
            </div>
          </div>

          {/* Private Event: Title + Address */}
          {isPrivate && (
            <>
              <div>
                <label htmlFor={`${uid}-title`} className="block text-xs font-medium text-gray-600 mb-1.5">
                  Title <span className="text-red-400">*</span>
                </label>
                <input
                  id={`${uid}-title`}
                  type="text"
                  placeholder="Event name or description…"
                  value={values.title}
                  onChange={e => set('title', e.target.value)}
                  onBlur={() => blur('title')}
                  className={inputCls(err('title'))}
                />
                {err('title') && <p className="mt-1 text-xs text-red-500">{err('title')}</p>}
              </div>
              <div>
                <label htmlFor={`${uid}-address`} className="block text-xs font-medium text-gray-600 mb-1.5">
                  Address <span className="text-gray-400 font-normal">(optional)</span>
                </label>
                <input
                  id={`${uid}-address`}
                  type="text"
                  placeholder="Venue or location address…"
                  value={values.address}
                  onChange={e => set('address', e.target.value)}
                  className={inputCls()}
                />
              </div>
            </>
          )}

          {/* Store (non-private only) */}
          {!isPrivate && (
            locked ? (
              <div>
                <p className="text-xs font-medium text-gray-600 mb-1.5">Store</p>
                <div className="flex items-center gap-2.5 px-3 py-2 rounded-lg border border-gray-200 bg-gray-50">
                  <div className="w-6 h-6 rounded-md bg-gray-200 flex items-center justify-center flex-shrink-0">
                    <span className="text-[9px] font-bold text-gray-400">{activeStore?.name.charAt(0)}</span>
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-gray-400 truncate">{activeStore?.name}</p>
                    <p className="text-[10px] text-gray-300">{activeStore?.chainName} · {activeStore?.regionName}</p>
                  </div>
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
                  onChange={e => { set('storeId', e.target.value); set('contactId', '') }}
                  onBlur={() => blur('storeId')}
                  className={clsx(inputCls(err('storeId')), !values.storeId && 'text-gray-400')}
                >
                  <option value="" disabled>Select a store…</option>
                  {storeGroups.map(({ slug, name, stores }) => (
                    <optgroup key={slug} label={name}>
                      {stores.map(s => (
                        <option key={s.id} value={s.id} className="text-gray-900">{s.name}</option>
                      ))}
                    </optgroup>
                  ))}
                </select>
                {err('storeId') && <p className="mt-1 text-xs text-red-500">{err('storeId')}</p>}
              </div>
            )
          )}

          {/* Date + Start + End */}
          <div className="grid grid-cols-3 gap-3">
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
              <label htmlFor={`${uid}-time`} className="block text-xs font-medium text-gray-600 mb-1.5">
                Start <span className="text-red-400">*</span>
              </label>
              <input
                id={`${uid}-time`}
                type="time"
                value={values.time}
                onChange={e => set('time', e.target.value)}
                className={inputCls()}
              />
            </div>
            <div>
              <label htmlFor={`${uid}-endTime`} className="block text-xs font-medium text-gray-600 mb-1.5">
                End
              </label>
              <input
                id={`${uid}-endTime`}
                type="time"
                value={values.endTime}
                onChange={e => set('endTime', e.target.value)}
                className={inputCls()}
              />
            </div>
          </div>

          {/* Reps */}
          <div>
            <p className="text-xs font-medium text-gray-600 mb-1.5">
              Reps <span className="text-red-400">*</span>
              {values.repIds.length > 0 && (
                <span className="ml-2 text-accent font-normal">{values.repIds.length} selected</span>
              )}
            </p>
            <div className={clsx(
              'border rounded-lg divide-y divide-gray-50 max-h-44 overflow-y-auto',
              err('repIds') ? 'border-red-300' : 'border-gray-200',
            )}>
              {activeReps.map(rep => (
                <label
                  key={rep.id}
                  className="flex items-center gap-3 px-3 py-2 hover:bg-gray-50 cursor-pointer select-none"
                >
                  <input
                    type="checkbox"
                    checked={values.repIds.includes(rep.id)}
                    onChange={() => toggleRep(rep.id)}
                    className="w-3.5 h-3.5 accent-accent rounded"
                  />
                  <div className="w-5 h-5 rounded-full bg-accent-light flex items-center justify-center flex-shrink-0">
                    <span className="text-[9px] font-bold text-accent">
                      {rep.name.split(' ').map(n => n[0]).join('').slice(0, 2)}
                    </span>
                  </div>
                  <span className="text-sm text-gray-700 flex-1">{rep.name}</span>
                  <span className="text-xs text-gray-400">{rep.regionName}</span>
                </label>
              ))}
            </div>
            {err('repIds') && <p className="mt-1 text-xs text-red-500">{err('repIds')}</p>}
          </div>

          {/* Contact (store events only) */}
          {!isPrivate && storeContacts.length > 0 && (
            <div>
              <label htmlFor={`${uid}-contact`} className="block text-xs font-medium text-gray-600 mb-1.5">
                Store Contact <span className="text-gray-400 font-normal">(optional)</span>
              </label>
              <select
                id={`${uid}-contact`}
                value={values.contactId}
                onChange={e => set('contactId', e.target.value)}
                className={clsx(inputCls(), !values.contactId && 'text-gray-400')}
              >
                <option value="">No contact</option>
                {storeContacts.map(c => (
                  <option key={c.id} value={c.id} className="text-gray-900">
                    {c.name}{c.role ? ` — ${c.role}` : ''}
                  </option>
                ))}
              </select>
            </div>
          )}

          {/* Notes */}
          <div>
            <label htmlFor={`${uid}-notes`} className="block text-xs font-medium text-gray-600 mb-1.5">
              Notes <span className="text-gray-400 font-normal">(optional)</span>
            </label>
            <textarea
              id={`${uid}-notes`}
              rows={3}
              placeholder="Special instructions, setup details, goals…"
              value={values.notes}
              onChange={e => set('notes', e.target.value)}
              className={clsx(inputCls(), 'resize-none')}
            />
          </div>

        </div>

        <ModalFooter isEdit={isEdit} />
      </form>
    </Modal>
  )
}

function ModalFooter({ isEdit }: { isEdit: boolean }) {
  const requestClose = useModalClose()
  return (
    <div className="px-6 py-4 border-t border-gray-100 flex items-center justify-between bg-gray-50/50 rounded-b-2xl">
      <p className="text-xs text-gray-400"><span className="text-red-400">*</span> Required</p>
      <div className="flex gap-2">
        <Button type="button" variant="ghost" size="sm" onClick={requestClose}>Cancel</Button>
        <Button type="submit" variant="primary" size="sm">{isEdit ? 'Save Changes' : 'Schedule'}</Button>
      </div>
    </div>
  )
}
