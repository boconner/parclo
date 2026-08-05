import { useState, useId } from 'react'
import { clsx } from 'clsx'
import { Modal, useModalClose } from '@/components/ui/Modal'
import { Button } from '@/components/ui/Button'
import { TimePicker12 } from '@/components/ui/TimePicker12'
import type { Event } from '@/types'
import { EVENT_TYPE_META } from './EventModal'
import { calcHours } from '@/lib/timeUtils'

interface CloseEventModalProps {
  open:    boolean
  event:   Event | null
  onClose: () => void
  onSave:  (eventId: string, data: {
    completionNotes: string
    takeaways:       string
    accomplishments: string
    hoursWorked:     number
  }) => void
}

interface FormValues {
  notes:           string
  takeaways:       string
  accomplishments: string
  timeIn:          string
  timeOut:         string
}

const EMPTY: FormValues = { notes: '', takeaways: '', accomplishments: '', timeIn: '', timeOut: '' }


export function CloseEventModal({ open, event, onClose, onSave }: CloseEventModalProps) {
  const uid = useId()
  const [values, setValues]   = useState<FormValues>(EMPTY)
  const [touched, setTouched] = useState(false)

  function set(key: keyof FormValues, val: string) {
    setValues(v => ({ ...v, [key]: val }))
  }

  const hoursNum   = calcHours(values.timeIn, values.timeOut)
  const hoursValid = hoursNum !== null

  const notesError  = touched && !values.notes.trim() ? 'Notes are required' : undefined
  const hoursError  = touched && !hoursValid
    ? (!values.timeIn || !values.timeOut ? 'Time in and time out are required' : 'Time out must be after time in')
    : undefined

  function handleClose() {
    setValues(EMPTY)
    setTouched(false)
    onClose()
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setTouched(true)
    if (!values.notes.trim() || !hoursValid || hoursNum === null || !event) return
    onSave(event.id, {
      completionNotes: values.notes.trim(),
      takeaways:       values.takeaways.trim(),
      accomplishments: values.accomplishments.trim(),
      hoursWorked:     hoursNum,
    })
    setValues(EMPTY)
    setTouched(false)
  }

  if (!event) return null

  const typeMeta  = EVENT_TYPE_META[event.type]
  const dt        = new Date(event.scheduledAt)
  const dateLabel = dt.toLocaleDateString('en-US', { weekday: 'short', month: 'long', day: 'numeric' })
  const timeLabel = dt.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true })

  return (
    <Modal
      open={open}
      onClose={handleClose}
      title="Close Out Event"
      subtitle="Record completion details before closing this event"
      width="sm"
    >
      <form onSubmit={handleSubmit} noValidate>
        <div className="px-6 py-5 space-y-4">

          {/* Event summary */}
          <div className="rounded-lg border border-gray-100 bg-gray-50 p-3.5 space-y-1.5">
            <div className="flex items-center gap-2">
              <span className={clsx('text-[10px] font-semibold px-2 py-0.5 rounded-full', typeMeta.bg, typeMeta.color)}>
                {typeMeta.label}
              </span>
              <span className="text-sm font-semibold text-gray-800">
                {event.title || event.storeName}
              </span>
            </div>
            <p className="text-xs text-gray-400">{dateLabel} · {timeLabel}</p>
            {event.reps.length > 0 && (
              <p className="text-xs text-gray-400">{event.reps.map(r => r.name).join(', ')}</p>
            )}
          </div>

          {/* Time in / Time out */}
          <div>
            <p className="text-xs font-medium text-gray-700 mb-1.5">
              Hours Worked <span className="text-red-400">*</span>
            </p>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label htmlFor={`${uid}-timein`} className="block text-[11px] text-gray-500 mb-1">Time In</label>
                <TimePicker12
                  id={`${uid}-timein`}
                  value={values.timeIn}
                  onChange={v => set('timeIn', v)}
                  onBlur={() => setTouched(true)}
                  hasError={!!hoursError}
                />
              </div>
              <div>
                <label htmlFor={`${uid}-timeout`} className="block text-[11px] text-gray-500 mb-1">Time Out</label>
                <TimePicker12
                  id={`${uid}-timeout`}
                  value={values.timeOut}
                  onChange={v => set('timeOut', v)}
                  onBlur={() => setTouched(true)}
                  hasError={!!hoursError}
                />
              </div>
            </div>
            {hoursError
              ? <p className="mt-1.5 text-xs text-red-500">{hoursError}</p>
              : hoursNum !== null && (
                <p className="mt-1.5 text-xs text-gray-500">
                  Total: <span className="font-semibold text-gray-700">{hoursNum.toFixed(2)} hrs</span>
                </p>
              )
            }
          </div>

          {/* Completion notes */}
          <div>
            <label htmlFor={`${uid}-notes`} className="block text-xs font-medium text-gray-700 mb-1.5">
              Notes <span className="text-red-400">*</span>
            </label>
            <textarea
              id={`${uid}-notes`}
              rows={3}
              placeholder="What happened? Describe the outcome and any follow-ups needed…"
              value={values.notes}
              onChange={e => set('notes', e.target.value)}
              onBlur={() => setTouched(true)}
              className={clsx(
                'w-full px-3 py-2 text-sm bg-white border rounded-lg outline-none transition-all',
                'focus:border-accent focus:ring-2 focus:ring-accent/10 placeholder:text-gray-400 resize-none',
                notesError ? 'border-red-300' : 'border-gray-200',
              )}
            />
            {notesError && <p className="mt-1 text-xs text-red-500">{notesError}</p>}
          </div>

          {/* Takeaways */}
          <div>
            <label htmlFor={`${uid}-takeaways`} className="block text-xs font-medium text-gray-700 mb-1.5">
              Takeaways <span className="text-gray-400 font-normal">(optional)</span>
            </label>
            <textarea
              id={`${uid}-takeaways`}
              rows={3}
              placeholder="What did you learn? Any insights or lessons for future events…"
              value={values.takeaways}
              onChange={e => set('takeaways', e.target.value)}
              className="w-full px-3 py-2 text-sm bg-white border border-gray-200 rounded-lg outline-none transition-all focus:border-accent focus:ring-2 focus:ring-accent/10 placeholder:text-gray-400 resize-none"
            />
          </div>

          {/* Accomplishments */}
          <div>
            <label htmlFor={`${uid}-accomplishments`} className="block text-xs font-medium text-gray-700 mb-1.5">
              Accomplishments <span className="text-gray-400 font-normal">(optional)</span>
            </label>
            <textarea
              id={`${uid}-accomplishments`}
              rows={3}
              placeholder="What went well? Highlight wins and successes…"
              value={values.accomplishments}
              onChange={e => set('accomplishments', e.target.value)}
              className="w-full px-3 py-2 text-sm bg-white border border-gray-200 rounded-lg outline-none transition-all focus:border-accent focus:ring-2 focus:ring-accent/10 placeholder:text-gray-400 resize-none"
            />
          </div>

        </div>

        <Footer />
      </form>
    </Modal>
  )
}

function Footer() {
  const requestClose = useModalClose()
  return (
    <div className="px-6 py-4 border-t border-gray-100 flex items-center justify-between bg-gray-50/50 rounded-b-2xl">
      <p className="text-xs text-gray-400"><span className="text-red-400">*</span> Required</p>
      <div className="flex gap-2">
        <Button type="button" variant="ghost" size="sm" onClick={requestClose}>Cancel</Button>
        <Button type="submit" variant="primary" size="sm">Mark Complete</Button>
      </div>
    </div>
  )
}
