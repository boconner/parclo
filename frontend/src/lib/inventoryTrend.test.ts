import { describe, it, expect } from 'vitest'
import { buildInventoryTrend, weekStart, type Observation } from './inventoryTrend'

// 2026-03-01 is a Sunday, so each W(n) is already a week start in local time.
// Built by real date arithmetic — a naive `1 + n*7` day-of-month overflows the
// month, and this range deliberately crosses the 2026-03-08 DST transition.
const BASE = new Date('2026-03-01T12:00:00')
function W(n: number): string {
  const d = new Date(BASE)
  d.setDate(d.getDate() + n * 7)
  const pad = (x: number) => String(x).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T12:00:00`
}

function obs(date: string, onShelf: number): Observation {
  return { date, onShelf }
}

describe('buildInventoryTrend', () => {
  it('returns nothing for no observations', () => {
    expect(buildInventoryTrend([])).toEqual([])
  })

  it('ignores unparseable dates', () => {
    const out = buildInventoryTrend([obs('not-a-date', 5), obs(W(0), 6)])
    expect(out).toHaveLength(1)
    expect(out[0]!.onShelf).toBe(6)
  })

  it('merges observations from both sources into one series', () => {
    // A visit and a sync in different weeks both become points — the bug that
    // made synced stores show only stale visit data.
    const out = buildInventoryTrend([obs(W(0), 10), obs(W(1), 8)])
    expect(out.map(p => p.onShelf)).toEqual([10, 8])
  })

  it('keeps the latest reading when a week has several observations', () => {
    const out = buildInventoryTrend([
      obs('2026-03-01T09:00:00', 10),
      obs('2026-03-04T09:00:00', 7),
    ])
    expect(out).toHaveLength(1)
    expect(out[0]!.onShelf).toBe(7)
  })

  it('does not merge the same week label from different years', () => {
    // "Mar 1" exists in both years; keying on the label collapsed them.
    const out = buildInventoryTrend([obs('2025-03-02T12:00:00', 9), obs('2026-03-01T12:00:00', 4)], 200)
    const observed = out.filter(p => p.onShelf !== null)
    expect(observed).toHaveLength(2)
    expect(observed.map(p => p.onShelf)).toEqual([9, 4])
  })

  it('fills unobserved weeks so spacing reflects real time', () => {
    // Two observations four weeks apart must not render as adjacent points.
    const out = buildInventoryTrend([obs(W(0), 12), obs(W(4), 4)])
    expect(out).toHaveLength(5)
    expect(out.map(p => p.onShelf)).toEqual([12, null, null, null, 4])
  })

  it('averages sold across the gap rather than attributing it to one week', () => {
    // 12 → 4 over four weeks is 2/week, not 8 in a single week.
    const out = buildInventoryTrend([obs(W(0), 12), obs(W(4), 4)])
    expect(out[4]!.sold).toBe(2)
  })

  it('reports sold for consecutive weeks directly', () => {
    const out = buildInventoryTrend([obs(W(0), 10), obs(W(1), 6)])
    expect(out[1]!.sold).toBe(4)
  })

  it('has no sold figure for the first observation', () => {
    const out = buildInventoryTrend([obs(W(0), 10), obs(W(1), 6)])
    expect(out[0]!.sold).toBeNull()
  })

  it('reports null rather than zero when stock went up', () => {
    // A restock hides real depletion; the old code showed a misleading 0.
    const out = buildInventoryTrend([obs(W(0), 4), obs(W(1), 12)])
    expect(out[1]!.sold).toBeNull()
  })

  it('reports null, not zero, for weeks with no observation', () => {
    const out = buildInventoryTrend([obs(W(0), 12), obs(W(2), 8)])
    expect(out[1]!.sold).toBeNull()
    expect(out[1]!.onShelf).toBeNull()
  })

  it('clamps to the most recent maxWeeks', () => {
    const many = Array.from({ length: 30 }, (_, i) => obs(W(i), 30 - i))
    const out  = buildInventoryTrend(many, 12)
    expect(out).toHaveLength(12)
    // Window ends on the newest observation.
    expect(out[out.length - 1]!.onShelf).toBe(1)
  })

  it('does not pad before the earliest observation', () => {
    // One data point should be one point, not 12 weeks of leading nulls.
    const out = buildInventoryTrend([obs(W(0), 5)], 12)
    expect(out).toHaveLength(1)
  })

  it('flat stock reports zero-ish movement, not a fabricated drop', () => {
    const out = buildInventoryTrend([obs(W(0), 6), obs(W(1), 6)])
    expect(out[1]!.sold).toBeNull()
  })
})

describe('weekStart', () => {
  it('snaps to the preceding Sunday at midnight', () => {
    const ws = weekStart(new Date('2026-03-04T15:30:00'))
    expect(ws.getDay()).toBe(0)
    expect(ws.getHours()).toBe(0)
    expect(ws.getMinutes()).toBe(0)
  })

  it('leaves a Sunday on its own day', () => {
    const ws = weekStart(new Date('2026-03-01T23:00:00'))
    expect(ws.getDate()).toBe(1)
  })
})
