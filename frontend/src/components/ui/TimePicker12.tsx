import { useState, useEffect, useRef } from 'react'
import { clsx } from 'clsx'

interface Props {
  id?:       string
  value:     string  // HH:MM 24-hour, or ''
  onChange:  (val: string) => void
  onBlur?:   () => void
  hasError?: boolean
}

function parse(val: string): { h: string; m: string; ap: 'AM' | 'PM' } {
  if (!val) return { h: '', m: '', ap: 'AM' }
  const [hh, mm] = val.split(':').map(Number)
  return {
    h:  String(hh === 0 ? 12 : hh > 12 ? hh - 12 : hh),
    m:  String(mm).padStart(2, '0'),
    ap: hh < 12 ? 'AM' : 'PM',
  }
}

function to24(h: string, m: string, ap: 'AM' | 'PM'): string {
  const hNum = parseInt(h, 10)
  const mNum = parseInt(m, 10)
  if (!h || isNaN(hNum) || hNum < 1 || hNum > 12) return ''
  if (m === '' || isNaN(mNum) || mNum < 0 || mNum > 59) return ''
  const h24 = ap === 'AM' ? (hNum === 12 ? 0 : hNum) : (hNum === 12 ? 12 : hNum + 12)
  return `${String(h24).padStart(2, '0')}:${String(mNum).padStart(2, '0')}`
}

export function TimePicker12({ id, value, onChange, onBlur, hasError }: Props) {
  const init = parse(value)
  const [hour,   setHour]   = useState(init.h)
  const [minute, setMinute] = useState(init.m)
  const [ap,     setAp]     = useState<'AM' | 'PM'>(init.ap)
  const lastEmitted = useRef(value)

  // sync when value changes externally (modal reset, linked-event selection, etc.)
  useEffect(() => {
    if (value !== lastEmitted.current) {
      const p = parse(value)
      setHour(p.h)
      setMinute(p.m)
      setAp(p.ap)
      lastEmitted.current = value
    }
  }, [value])

  function emit(h: string, m: string, a: 'AM' | 'PM') {
    const result = to24(h, m, a)
    lastEmitted.current = result
    onChange(result)
  }

  function handleHour(raw: string) {
    const d = raw.replace(/\D/g, '').slice(0, 2)
    setHour(d)
    emit(d, minute, ap)
  }

  function handleMinute(raw: string) {
    const d = raw.replace(/\D/g, '').slice(0, 2)
    setMinute(d)
    emit(hour, d, ap)
  }

  function handleHourBlur() {
    const n = parseInt(hour, 10)
    if (!isNaN(n) && n >= 1 && n <= 12) {
      setHour(String(n))
      if (minute === '') { setMinute('00'); emit(String(n), '00', ap) }
    } else {
      setHour('')
    }
    onBlur?.()
  }

  function handleMinuteBlur() {
    const n = parseInt(minute, 10)
    if (!isNaN(n) && n >= 0 && n <= 59) setMinute(String(n).padStart(2, '0'))
    else setMinute('')
    onBlur?.()
  }

  function handleApClick(a: 'AM' | 'PM') {
    setAp(a)
    emit(hour, minute, a)
  }

  return (
    <div className={clsx(
      'flex items-center w-full px-2.5 py-2 bg-white border rounded-lg transition-all',
      'focus-within:border-accent focus-within:ring-2 focus-within:ring-accent/10',
      hasError ? 'border-red-300' : 'border-gray-200',
    )}>
      <input
        id={id}
        type="text"
        inputMode="numeric"
        value={hour}
        onChange={e => handleHour(e.target.value)}
        onBlur={handleHourBlur}
        placeholder="12"
        maxLength={2}
        className="w-7 text-center text-sm text-gray-800 outline-none bg-transparent tabular-nums"
      />
      <span className="text-gray-300 select-none">:</span>
      <input
        type="text"
        inputMode="numeric"
        value={minute}
        onChange={e => handleMinute(e.target.value)}
        onBlur={handleMinuteBlur}
        placeholder="00"
        maxLength={2}
        className="w-7 text-center text-sm text-gray-800 outline-none bg-transparent tabular-nums"
      />
      <div className="flex ml-auto gap-0.5 pl-1">
        {(['AM', 'PM'] as const).map(a => (
          <button
            key={a}
            type="button"
            onClick={() => handleApClick(a)}
            className={clsx(
              'px-1.5 py-0.5 text-[11px] font-semibold rounded transition-colors',
              ap === a ? 'bg-accent text-white' : 'text-gray-400 hover:text-gray-600',
            )}
          >
            {a}
          </button>
        ))}
      </div>
    </div>
  )
}
