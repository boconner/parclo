export function pad2(n: number): string {
  return String(n).padStart(2, '0')
}

export function nowTime(): string {
  const n = new Date()
  return `${pad2(n.getHours())}:${pad2(n.getMinutes())}`
}

export function calcHours(timeIn: string, timeOut: string): number | null {
  if (!timeIn || !timeOut) return null
  const [inH, inM]   = timeIn.split(':').map(Number)
  const [outH, outM] = timeOut.split(':').map(Number)
  const mins = (outH * 60 + outM) - (inH * 60 + inM)
  return mins > 0 ? Math.round(mins / 60 * 100) / 100 : null
}

export function addHoursToTime(timeStr: string, hours: number): string {
  const [h, m] = timeStr.split(':').map(Number)
  const totalMins = h * 60 + m + Math.round(hours * 60)
  return `${pad2(Math.floor(totalMins / 60) % 24)}:${pad2(totalMins % 60)}`
}

// Sensible default time-out: one hour after time-in, clamped to 23:59 so it
// never wraps past midnight (which would read as "before" the time-in).
export function defaultTimeOut(timeIn: string): string {
  if (!timeIn) return ''
  const [h, m] = timeIn.split(':').map(Number)
  const capped = Math.min(h * 60 + m + 60, 23 * 60 + 59)
  return `${pad2(Math.floor(capped / 60))}:${pad2(capped % 60)}`
}
