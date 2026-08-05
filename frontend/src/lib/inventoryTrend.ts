// Builds the Inventory Trend series for the store detail page.
//
// An "observation" is any point in time where we learned the shelf count. There
// are two sources and they are equally valid:
//   · rep visits        — sparse, whenever someone walks in
//   · stock syncs       — dense, frequent readings for chains with a retail sync
//
// The chart previously used visits only, so a synced store drew a handful of
// stale points while a far richer series sat unused in the Stock Sync Log panel
// directly beneath it.

export interface Observation {
  /** ISO timestamp. */
  date:    string
  onShelf: number
}

export interface TrendPoint {
  week: string
  /** Null in a week with no observation — the line breaks rather than inventing data. */
  onShelf: number | null
  /**
   * Bottles sold per week, averaged across the gap since the previous
   * observation. Null when unknowable: no prior observation, an unobserved
   * week, or a week where stock went up (a restock hides the true depletion).
   */
  sold: number | null
  /** Week start, for sorting and tests. */
  ms: number
}

/** Sunday 00:00 local of the week containing `d`. */
export function weekStart(d: Date): Date {
  const ws = new Date(d)
  ws.setDate(d.getDate() - d.getDay())
  ws.setHours(0, 0, 0, 0)
  return ws
}

/**
 * Every week start from `first` to `last` inclusive.
 *
 * Steps by calendar date rather than adding 7×24h: a fixed-millisecond week
 * drifts by an hour across a DST boundary, after which the accumulated
 * timestamps no longer equal any weekStart() value and bucket lookups miss.
 */
function weeksBetween(first: number, last: number): number[] {
  const out: number[] = []
  const cursor = new Date(first)
  while (cursor.getTime() <= last) {
    out.push(cursor.getTime())
    cursor.setDate(cursor.getDate() + 7)
    cursor.setHours(0, 0, 0, 0)
  }
  return out
}

/** "Jul 27" for display. Never used as a bucket key — it collides across years. */
function weekLabel(ws: Date): string {
  return ws.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

/**
 * Merges every shelf-count observation into a continuous weekly series.
 *
 * @param observations any mix of visits and stock syncs, any order
 * @param maxWeeks     how many weeks back to render, so the card stays readable
 */
export function buildInventoryTrend(
  observations: Observation[],
  maxWeeks = 12,
): TrendPoint[] {
  const valid = observations
    .filter(o => o.date && !Number.isNaN(new Date(o.date).getTime()))
    .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())

  if (valid.length === 0) return []

  // Bucket by week-start timestamp, NOT by the display label: "Jul 27" repeats
  // every year and would silently merge weeks 12 months apart.
  const buckets = new Map<number, number>()
  for (const o of valid) {
    // Last observation in a week wins — it's the most current reading.
    buckets.set(weekStart(new Date(o.date)).getTime(), o.onShelf)
  }

  const observedWeeks = [...buckets.keys()].sort((a, b) => a - b)

  // Every week in range, including unobserved ones, so the x-axis is
  // proportional to time. A categorical axis over observed weeks only makes a
  // three-month gap look identical to a one-week gap.
  const allWeeks = weeksBetween(observedWeeks[0]!, observedWeeks[observedWeeks.length - 1]!)

  // Clamp to the most recent window, but never pad before the earliest data.
  const window = allWeeks.slice(Math.max(0, allWeeks.length - maxWeeks))

  const points: TrendPoint[] = []
  let prevObserved: { index: number; onShelf: number } | null = null

  window.forEach((ms, index) => {
    const onShelf = buckets.get(ms)

    if (onShelf === undefined) {
      points.push({ week: weekLabel(new Date(ms)), onShelf: null, sold: null, ms })
      return
    }

    let sold: number | null = null
    if (prevObserved) {
      const drop       = prevObserved.onShelf - onShelf
      // Index distance, not a millisecond division — immune to DST drift.
      const weeksApart = Math.max(1, index - prevObserved.index)
      // A rise means a restock happened; real depletion is hidden, so report
      // nothing rather than the old code's misleading 0.
      sold = drop > 0 ? Math.round((drop / weeksApart) * 10) / 10 : null
    }

    points.push({ week: weekLabel(new Date(ms)), onShelf, sold, ms })
    prevObserved = { index, onShelf }
  })

  return points
}
