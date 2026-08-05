import { test } from 'node:test'
import assert from 'node:assert/strict'
import { computeStoreUpdate, isLatestVisit, visitTime } from './visitState.js'

const DAY = 86_400_000
const T0  = Date.UTC(2026, 0, 1) // fixed anchor

// ─── visitTime ─────────────────────────────────────────────────────────────

test('visitTime prefers visitedAt over createdAt', () => {
  const visitedAt = new Date(T0)
  const createdAt = new Date(T0 + 5 * DAY)
  assert.equal(visitTime({ visitedAt, createdAt }), T0)
})

test('visitTime falls back to createdAt when visitedAt is null (legacy rows)', () => {
  const createdAt = new Date(T0 + 5 * DAY)
  assert.equal(visitTime({ visitedAt: null, createdAt }), T0 + 5 * DAY)
})

// ─── isLatestVisit ───────────────────────────────────────────────────────────

test('isLatestVisit: first/only visit (no other) is latest', () => {
  assert.equal(isLatestVisit(T0, null), true)
})

test('isLatestVisit: newer than the other visit is latest', () => {
  assert.equal(isLatestVisit(T0 + DAY, T0), true)
})

test('isLatestVisit: a tie counts as latest', () => {
  assert.equal(isLatestVisit(T0, T0), true)
})

test('isLatestVisit: older than the other visit is NOT latest (backfill)', () => {
  assert.equal(isLatestVisit(T0 - DAY, T0), false)
})

// Delete semantics ride on the same helper:
test('delete: removing the latest visit rolls back (wasLatest = true)', () => {
  // deleted visit dated after the remaining one
  assert.equal(isLatestVisit(T0 + 7 * DAY, T0), true)
})

test('delete: removing a historical backfill leaves state alone (wasLatest = false)', () => {
  assert.equal(isLatestVisit(T0, T0 + 7 * DAY), false)
})

test('delete: removing the only visit clears state (wasLatest = true)', () => {
  assert.equal(isLatestVisit(T0, null), true)
})

// ─── computeStoreUpdate: backfill guard ───────────────────────────────────────

test('backfill (older than the latest visit) returns null — current state untouched', () => {
  const result = computeStoreUpdate({
    onShelf:              4,
    visitTime:            T0 - 3 * DAY,
    previous:             { onShelf: 20, time: T0 },
    currentDepletionRate: 2,
  })
  assert.equal(result, null)
})

test('a tie with the latest visit is NOT a backfill — returns an update', () => {
  const result = computeStoreUpdate({
    onShelf:              15,
    visitTime:            T0,
    previous:             { onShelf: 20, time: T0 },
    currentDepletionRate: null,
  })
  assert.notEqual(result, null)
  assert.equal(result!.onShelf, 15)
  assert.equal(result!.lastVisitTime, T0)
})

// ─── computeStoreUpdate: first visit ───────────────────────────────────────────

test('first visit ever (no previous) sets state with no depletion rate', () => {
  const result = computeStoreUpdate({
    onShelf:              30,
    visitTime:            T0,
    previous:             null,
    currentDepletionRate: null,
  })
  assert.deepEqual(result, { onShelf: 30, lastVisitTime: T0 })
})

// ─── computeStoreUpdate: depletion math ────────────────────────────────────────

test('latest visit with stock drop over a week computes depletion rate and days of supply', () => {
  const result = computeStoreUpdate({
    onShelf:              13,
    visitTime:            T0 + 7 * DAY,
    previous:             { onShelf: 20, time: T0 }, // dropped 7 bottles over 7 days
    currentDepletionRate: null,
  })
  // (20-13)/7 = 1 bottle/day; 13 / 1 = 13 days of supply
  assert.equal(result!.depletionRate, 1)
  assert.equal(result!.daysOfSupply, 13)
})

test('same-day follow-up does not recompute depletion; uses existing rate for days of supply', () => {
  const result = computeStoreUpdate({
    onShelf:              18,
    visitTime:            T0 + DAY / 2, // < 1 day since previous
    previous:             { onShelf: 20, time: T0 },
    currentDepletionRate: 2,
  })
  assert.equal(result!.depletionRate, undefined) // not enough elapsed time
  assert.equal(result!.daysOfSupply, 9)          // 18 / 2 (existing rate)
})

test('a restock (stock went up) yields no new depletion rate', () => {
  const result = computeStoreUpdate({
    onShelf:              30,
    visitTime:            T0 + 2 * DAY,
    previous:             { onShelf: 5, time: T0 }, // went UP, not depleted
    currentDepletionRate: 1.5,
  })
  assert.equal(result!.depletionRate, undefined)
  assert.equal(result!.daysOfSupply, 20) // 30 / 1.5 (existing rate)
})

test('empty shelf reports zero days of supply (and still computes the rate)', () => {
  const result = computeStoreUpdate({
    onShelf:              0,
    visitTime:            T0 + 5 * DAY,
    previous:             { onShelf: 10, time: T0 },
    currentDepletionRate: null,
  })
  assert.equal(result!.depletionRate, 2) // (10-0)/5
  assert.equal(result!.daysOfSupply, 0)
})

test('no usable rate leaves days of supply undefined', () => {
  const result = computeStoreUpdate({
    onShelf:              12,
    visitTime:            T0 + DAY / 2,
    previous:             { onShelf: 20, time: T0 },
    currentDepletionRate: null, // no prior rate, none computed (sub-day)
  })
  assert.equal(result!.depletionRate, undefined)
  assert.equal(result!.daysOfSupply, undefined)
})
