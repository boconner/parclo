// Pure helpers for deciding how a visit affects a store's "current state".
//
// A store's current onShelf / lastVisit / depletionRate / daysOfSupply describe
// the chronologically *latest* visit. Reps sometimes backfill visits they forgot
// to log, so a visit logged "now" may carry an older date — those back-dated
// entries must be recorded without clobbering the store's current state.

const MS_PER_DAY = 86_400_000

/** Effective timestamp of a visit: its visit date, falling back to insert time. */
export function visitTime(v: { visitedAt: Date | null; createdAt: Date }): number {
  return (v.visitedAt ?? v.createdAt).getTime()
}

/**
 * Whether a visit at `time` is the latest on record, given the timestamp of the
 * most recent *other* visit (or null if there is none). A tie counts as latest.
 */
export function isLatestVisit(time: number, otherTime: number | null): boolean {
  return otherTime === null || time >= otherTime
}

export interface PreviousVisit { onShelf: number; time: number }

export interface StoreStateUpdate {
  onShelf:        number
  lastVisitTime:  number
  depletionRate?: number
  daysOfSupply?:  number
}

/**
 * Compute the store "current state" update for a newly-logged visit, or return
 * null when the visit is a historical backfill (older than an existing visit),
 * in which case the store's current state must be left untouched.
 */
export function computeStoreUpdate(args: {
  onShelf:              number
  visitTime:            number
  previous:             PreviousVisit | null
  currentDepletionRate: number | null
}): StoreStateUpdate | null {
  const { onShelf, visitTime: vt, previous, currentDepletionRate } = args

  if (previous && !isLatestVisit(vt, previous.time)) return null

  // Only a genuine drop in stock over a day or more yields a new depletion rate.
  let depletionRate: number | undefined
  if (previous && previous.onShelf > onShelf) {
    const days = (vt - previous.time) / MS_PER_DAY
    if (days >= 1) depletionRate = Math.round(((previous.onShelf - onShelf) / days) * 100) / 100
  }

  const rate = depletionRate ?? currentDepletionRate ?? null
  const daysOfSupply =
    onShelf === 0      ? 0
    : rate && rate > 0 ? Math.round((onShelf / rate) * 10) / 10
    : undefined

  return {
    onShelf,
    lastVisitTime: vt,
    ...(depletionRate !== undefined ? { depletionRate } : {}),
    ...(daysOfSupply  !== undefined ? { daysOfSupply } : {}),
  }
}
