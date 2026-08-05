import { test } from 'node:test'
import assert from 'node:assert/strict'
import { isVisitOverdue, isNotMoving, type SyncPoint } from './staleAlerts.js'

const NOW = new Date('2026-07-31T12:00:00Z')

function daysBefore(days: number): Date {
  return new Date(NOW.getTime() - days * 24 * 60 * 60 * 1000)
}

/** Sync readings every 2 days (a typical retailer sync cadence), oldest first. */
function series(levels: number[], spanDays: number): SyncPoint[] {
  const step = spanDays / Math.max(1, levels.length - 1)
  return levels.map((onShelf, i) => ({
    onShelf,
    syncedAt: daysBefore(spanDays - i * step),
  }))
}

// ─── isVisitOverdue ───────────────────────────────────────────────────────────

test('a store never visited is overdue', () => {
  assert.equal(isVisitOverdue(null, NOW, 21), true)
})

test('a visit inside the window is not overdue', () => {
  assert.equal(isVisitOverdue(daysBefore(20), NOW, 21), false)
})

test('a visit beyond the window is overdue', () => {
  assert.equal(isVisitOverdue(daysBefore(22), NOW, 21), true)
})

test('a visit exactly at the threshold is not yet overdue', () => {
  // Guards against an off-by-one that would flag stores a day early.
  assert.equal(isVisitOverdue(daysBefore(21), NOW, 21), false)
})

// ─── isNotMoving ──────────────────────────────────────────────────────────────

test('flat non-zero stock across a full window is not moving', () => {
  assert.equal(isNotMoving(series([6, 6, 6, 6, 6, 6, 6], 14), NOW, 14), true)
})

test('stock that changed at any point is moving', () => {
  assert.equal(isNotMoving(series([6, 6, 6, 5, 5, 5, 5], 14), NOW, 14), false)
})

test('a store flat at zero is out of stock, not stalled', () => {
  // Zero is a different problem with its own alert — flagging it here would
  // double-report every out-of-stock store.
  assert.equal(isNotMoving(series([0, 0, 0, 0, 0, 0, 0], 14), NOW, 14), false)
})

test('a single reading is never enough to conclude anything', () => {
  assert.equal(isNotMoving([{ onShelf: 6, syncedAt: daysBefore(14) }], NOW, 14), false)
})

test('no readings at all is not a stall', () => {
  assert.equal(isNotMoving([], NOW, 14), false)
})

test('a newly tracked store is not flagged for lack of history', () => {
  // Two flat readings, but only spanning 4 days — nowhere near the window.
  assert.equal(isNotMoving(series([6, 6, 6], 4), NOW, 14), false)
})

test('stock that dipped and returned to the same level still counts as moving', () => {
  assert.equal(isNotMoving(series([6, 6, 4, 6, 6, 6, 6], 14), NOW, 14), false)
})
