import { prisma } from '../prisma.js'
import { resolveDisplayName } from '../storeDisplayName.js'

// Detects stores where the product isn't moving, and raises Alert rows for them.
//
// Two independent signals:
//
//   VISIT_OVERDUE — no rep visit within `visitOverdueDays`. Applies to every
//   store, since it's about rep coverage rather than product data.
//
//   NO_MOVEMENT — the synced on-shelf count hasn't changed within
//   `noMovementDays` while stock is actually present. Only meaningful for stores
//   with a retail stock sync, because it needs a series of observations.
//   Deliberately requires onShelf > 0: a store sitting flat at zero is out of
//   stock, which is a different problem and already has its own alert.
//
// Both are idempotent — re-running never duplicates an open alert — and both
// auto-resolve when the underlying condition clears, so the job fully owns the
// lifecycle of the alerts it creates.

export interface StaleAlertsReport {
  dryRun:            boolean
  ranAt:             string
  visitOverdueDays:  number
  noMovementDays:    number
  storesConsidered:  number
  visitOverdueRaised:   number
  visitOverdueResolved: number
  noMovementRaised:     number
  noMovementResolved:   number
  details: {
    storeId:   string
    storeName: string
    type:      'VISIT_OVERDUE' | 'NO_MOVEMENT'
    action:    'raised' | 'resolved'
    reason:    string
  }[]
}

const DEFAULT_VISIT_OVERDUE_DAYS = 21
const DEFAULT_NO_MOVEMENT_DAYS   = 14

function daysAgo(days: number, from: Date = new Date()): Date {
  return new Date(from.getTime() - days * 24 * 60 * 60 * 1000)
}

export function daysBetween(from: Date, to: Date): number {
  return Math.floor((to.getTime() - from.getTime()) / (24 * 60 * 60 * 1000))
}

export interface SyncPoint { onShelf: number; syncedAt: Date }

/** A store is overdue when it has never been visited, or not within the window. */
export function isVisitOverdue(lastVisit: Date | null, now: Date, thresholdDays: number): boolean {
  if (!lastVisit) return true
  return lastVisit < daysAgo(thresholdDays, now)
}

/**
 * True when the synced shelf count has not changed across a full threshold
 * window while stock was actually present.
 *
 * `syncs` must be ascending by syncedAt and already limited to the window.
 *
 * Three conditions, all necessary:
 *   - at least two observations, so "unchanged" means something
 *   - the earliest observation is old enough to span the window, so a
 *     newly-tracked store isn't flagged purely for lack of history
 *   - the level is above zero, since a store flat at 0 is out of stock —
 *     a different problem with its own alert
 */
export function isNotMoving(syncs: SyncPoint[], now: Date, thresholdDays: number): boolean {
  if (syncs.length < 2) return false
  const first = syncs[0]!
  if (first.onShelf <= 0) return false
  if (daysBetween(first.syncedAt, now) < thresholdDays - 1) return false
  return syncs.every(s => s.onShelf === first.onShelf)
}

export async function runStaleAlerts(opts: { dryRun?: boolean } = {}): Promise<StaleAlertsReport> {
  const dryRun = opts.dryRun ?? false
  const now    = new Date()

  const settings = await prisma.inventorySettings.findUnique({ where: { id: 'default' } })
  const visitOverdueDays = settings?.visitOverdueDays ?? DEFAULT_VISIT_OVERDUE_DAYS
  const noMovementDays   = settings?.noMovementDays   ?? DEFAULT_NO_MOVEMENT_DAYS

  const report: StaleAlertsReport = {
    dryRun,
    ranAt: now.toISOString(),
    visitOverdueDays,
    noMovementDays,
    storesConsidered:     0,
    visitOverdueRaised:   0,
    visitOverdueResolved: 0,
    noMovementRaised:     0,
    noMovementResolved:   0,
    details: [],
  }

  const stores = await prisma.store.findMany({
    // Inactive stores are no longer serviced, so they must not generate alerts.
    // Without this every deactivated store would raise a VISIT_OVERDUE that can
    // never be cleared, since nobody is ever going to visit it again.
    where: { status: 'active' },
    select: {
      id: true, name: true, displayName: true, address: true, onShelf: true,
      lastVisit: true,
      chain: { select: { name: true } },
    },
  })
  report.storesConsidered = stores.length

  // Existing open alerts of the two types this job owns, so we neither duplicate
  // nor leave stale ones behind.
  const openAlerts = await prisma.alert.findMany({
    where:  { status: 'OPEN', type: { in: ['VISIT_OVERDUE', 'NO_MOVEMENT'] } },
    select: { id: true, storeId: true, type: true },
  })
  const openByStore = new Map<string, Map<string, string>>()
  for (const a of openAlerts) {
    if (!a.storeId) continue
    if (!openByStore.has(a.storeId)) openByStore.set(a.storeId, new Map())
    openByStore.get(a.storeId)!.set(a.type, a.id)
  }

  // Latest two syncs per store are enough to know whether the count has moved,
  // but we need the whole window to be sure it hasn't moved *at any point*.
  const movementCutoff = daysAgo(noMovementDays)
  const recentSyncs = await prisma.stockSync.findMany({
    where:   { syncedAt: { gte: movementCutoff } },
    select:  { storeId: true, onShelf: true, syncedAt: true },
    orderBy: { syncedAt: 'asc' },
  })
  const syncsByStore = new Map<string, { onShelf: number; syncedAt: Date }[]>()
  for (const s of recentSyncs) {
    if (!syncsByStore.has(s.storeId)) syncsByStore.set(s.storeId, [])
    syncsByStore.get(s.storeId)!.push({ onShelf: s.onShelf, syncedAt: s.syncedAt })
  }

  const toCreate: { type: 'VISIT_OVERDUE' | 'NO_MOVEMENT'; storeId: string; message: string }[] = []
  const toResolve: string[] = []

  for (const store of stores) {
    const label = resolveDisplayName({
      displayName: store.displayName,
      chainName:   store.chain?.name ?? null,
      name:        store.name,
      address:     store.address,
    })
    const fullLabel = store.chain?.name ? `${store.chain.name} — ${label}` : label
    const openForStore = openByStore.get(store.id) ?? new Map<string, string>()

    // ── VISIT_OVERDUE ────────────────────────────────────────────────────────
    const overdue = isVisitOverdue(store.lastVisit, now, visitOverdueDays)
    const openVisitAlert = openForStore.get('VISIT_OVERDUE')

    if (overdue && !openVisitAlert) {
      const since = store.lastVisit
        ? `${daysBetween(store.lastVisit, now)} days since the last visit`
        : 'never visited'
      toCreate.push({
        type:    'VISIT_OVERDUE',
        storeId: store.id,
        message: `${fullLabel} needs a visit — ${since}.`,
      })
      report.visitOverdueRaised++
      report.details.push({ storeId: store.id, storeName: fullLabel, type: 'VISIT_OVERDUE', action: 'raised', reason: since })
    } else if (!overdue && openVisitAlert) {
      toResolve.push(openVisitAlert)
      report.visitOverdueResolved++
      report.details.push({ storeId: store.id, storeName: fullLabel, type: 'VISIT_OVERDUE', action: 'resolved', reason: 'visited recently' })
    }

    // ── NO_MOVEMENT ──────────────────────────────────────────────────────────
    const syncs = syncsByStore.get(store.id) ?? []
    const openMovementAlert = openForStore.get('NO_MOVEMENT')

    const flat = isNotMoving(syncs, now, noMovementDays)

    if (flat && !openMovementAlert) {
      const level = syncs[0]!.onShelf
      toCreate.push({
        type:    'NO_MOVEMENT',
        storeId: store.id,
        message: `${fullLabel} isn't moving — on-shelf has sat at ${level} bottle(s) for ${noMovementDays}+ days.`,
      })
      report.noMovementRaised++
      report.details.push({
        storeId: store.id, storeName: fullLabel, type: 'NO_MOVEMENT', action: 'raised',
        reason: `flat at ${level} across ${syncs.length} syncs`,
      })
    } else if (!flat && openMovementAlert) {
      toResolve.push(openMovementAlert)
      report.noMovementResolved++
      report.details.push({ storeId: store.id, storeName: fullLabel, type: 'NO_MOVEMENT', action: 'resolved', reason: 'stock moved' })
    }
  }

  if (!dryRun) {
    if (toCreate.length > 0) {
      await prisma.alert.createMany({
        data: toCreate.map(a => ({
          type:    a.type,
          status:  'OPEN' as const,
          storeId: a.storeId,
          message: a.message,
        })),
      })
    }
    if (toResolve.length > 0) {
      await prisma.alert.updateMany({
        where: { id: { in: toResolve } },
        data:  { status: 'RESOLVED', resolvedAt: now },
      })
    }
  }

  return report
}
