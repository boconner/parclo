import { useState, useId } from 'react'
import { clsx } from 'clsx'
import { Modal } from '@/components/ui/Modal'
import { Button } from '@/components/ui/Button'
import type { Event } from '@/types'

// ─── types ────────────────────────────────────────────────────────────────────

export interface SupplyRequestBody {
  eventId?:    string
  eventType?:  string
  eventDate?:  string
  eventTitle?: string
  storeName?:  string
  needByDate?: string
  items:       { label: string; quantity?: number; details?: string }[]
  urgency:     'normal' | 'urgent'
  notes?:      string
}

interface Props {
  open:    boolean
  onClose: () => void
  onSave:  (body: SupplyRequestBody) => void
  event:   Event
  saving?: boolean
}

// ─── component ────────────────────────────────────────────────────────────────

export function SupplyRequestModal({ open, onClose, onSave, event, saving }: Props) {
  const uid = useId()

  const [verticals, setVerticals]     = useState('')
  const [cases, setCases]             = useState('')
  const [otherItems, setOtherItems]   = useState('')
  const [urgency, setUrgency]         = useState<'normal' | 'urgent'>('normal')
  const [needByDate, setNeedByDate]   = useState('')
  const [notes, setNotes]             = useState('')

  function handleClose() {
    setVerticals(''); setCases(''); setOtherItems('')
    setUrgency('normal'); setNeedByDate(''); setNotes('')
    onClose()
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()

    const items: SupplyRequestBody['items'] = []
    if (verticals && Number(verticals) > 0)
      items.push({ label: 'Verticals', quantity: Number(verticals) })
    if (cases && Number(cases) > 0)
      items.push({ label: 'Cases', quantity: Number(cases) })
    if (otherItems.trim())
      items.push({ label: 'Other', details: otherItems.trim() })

    onSave({
      eventId:    event.id,
      eventType:  event.type,
      eventDate:  event.scheduledAt,
      eventTitle: event.title ?? undefined,
      storeName:  event.storeName ?? undefined,
      needByDate: needByDate || undefined,
      items,
      urgency,
      notes: notes.trim() || undefined,
    })
  }

  const typeLabel = event.type === 'tasting' ? 'Tasting'
    : event.type === 'private_event' ? 'Private Event'
    : 'Event'

  const dt = new Date(event.scheduledAt)
  const dateStr = dt.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })
  const timeStr = dt.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true })

  const inputCls = clsx(
    'w-full px-3 py-2 text-sm bg-white border border-gray-200 rounded-lg outline-none transition-all',
    'focus:border-accent focus:ring-2 focus:ring-accent/10 placeholder:text-gray-400',
  )

  const isEmpty = !verticals && !cases && !otherItems.trim()

  return (
    <Modal
      open={open}
      onClose={handleClose}
      title="Request Supplies"
      subtitle={`${typeLabel}${event.storeName ? ` · ${event.storeName}` : ''}`}
      width="sm"
    >
      <form onSubmit={handleSubmit} noValidate>
        <div className="px-6 py-5 space-y-5">

          {/* Event info */}
          <div className="flex items-center gap-3 px-3 py-2.5 rounded-lg bg-gray-50 border border-gray-200">
            <div className="w-7 h-7 rounded-lg bg-accent-light flex items-center justify-center flex-shrink-0">
              <svg width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" className="text-accent">
                <rect x="1" y="2" width="14" height="13" rx="2"/><path d="M5 1v2M11 1v2M1 6h14" strokeLinecap="round"/>
              </svg>
            </div>
            <div>
              <p className="text-xs font-semibold text-gray-700">{dateStr} · {timeStr}</p>
              <p className="text-[11px] text-gray-400">{typeLabel}{event.storeName ? ` at ${event.storeName}` : ''}</p>
            </div>
          </div>

          {/* Urgency */}
          <div>
            <p className="text-xs font-medium text-gray-600 mb-2">Urgency</p>
            <div className="flex gap-2">
              {(['normal', 'urgent'] as const).map(u => (
                <button
                  key={u}
                  type="button"
                  onClick={() => setUrgency(u)}
                  className={clsx(
                    'flex-1 py-2 text-sm font-medium rounded-lg border transition-all capitalize',
                    urgency === u
                      ? u === 'urgent'
                        ? 'bg-red-500 border-red-500 text-white'
                        : 'bg-accent border-accent text-white'
                      : 'border-gray-200 text-gray-500 hover:border-gray-300 hover:text-gray-700',
                  )}
                >
                  {u === 'urgent' ? '⚡ Urgent' : 'Normal'}
                </button>
              ))}
            </div>
          </div>

          {/* Need by date */}
          <div>
            <label htmlFor={`${uid}-nb`} className="block text-xs font-medium text-gray-600 mb-1.5">
              Need By <span className="text-gray-400 font-normal">(optional)</span>
            </label>
            <input
              id={`${uid}-nb`}
              type="date"
              value={needByDate}
              onChange={e => setNeedByDate(e.target.value)}
              className={inputCls}
            />
          </div>

          {/* Items */}
          <div>
            <p className="text-xs font-medium text-gray-600 mb-3">Items Needed</p>
            <div className="space-y-3">

              <div className="flex items-center gap-3">
                <label htmlFor={`${uid}-v`} className="text-sm text-gray-700 w-24 flex-shrink-0">Verticals</label>
                <input
                  id={`${uid}-v`}
                  type="number"
                  min="0"
                  placeholder="Qty"
                  value={verticals}
                  onChange={e => setVerticals(e.target.value)}
                  className={clsx(inputCls, 'flex-1')}
                />
              </div>

              <div className="flex items-center gap-3">
                <label htmlFor={`${uid}-c`} className="text-sm text-gray-700 w-24 flex-shrink-0">Cases</label>
                <input
                  id={`${uid}-c`}
                  type="number"
                  min="0"
                  placeholder="Qty"
                  value={cases}
                  onChange={e => setCases(e.target.value)}
                  className={clsx(inputCls, 'flex-1')}
                />
              </div>

              <div className="flex items-start gap-3">
                <label htmlFor={`${uid}-o`} className="text-sm text-gray-700 w-24 flex-shrink-0 pt-2">Other</label>
                <textarea
                  id={`${uid}-o`}
                  rows={2}
                  placeholder="Pour spouts, tasting cups, table…"
                  value={otherItems}
                  onChange={e => setOtherItems(e.target.value)}
                  className={clsx(inputCls, 'flex-1 resize-none')}
                />
              </div>
            </div>
            {isEmpty && (
              <p className="mt-2 text-xs text-gray-400">Add at least one item to submit.</p>
            )}
          </div>

          {/* Notes */}
          <div>
            <label htmlFor={`${uid}-n`} className="block text-xs font-medium text-gray-600 mb-1.5">
              Additional Notes <span className="text-gray-400 font-normal">(optional)</span>
            </label>
            <textarea
              id={`${uid}-n`}
              rows={2}
              placeholder="Delivery instructions, special requests…"
              value={notes}
              onChange={e => setNotes(e.target.value)}
              className={clsx(inputCls, 'resize-none')}
            />
          </div>
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-gray-100 flex items-center justify-end gap-2 bg-gray-50/50 rounded-b-2xl">
          <Button type="button" variant="ghost" size="sm" onClick={handleClose}>Cancel</Button>
          <Button
            type="submit"
            variant="primary"
            size="sm"
            disabled={isEmpty || saving}
          >
            {saving ? 'Sending…' : 'Send Request'}
          </Button>
        </div>
      </form>
    </Modal>
  )
}
