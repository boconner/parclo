import { Router } from 'express'
import { prisma } from '../prisma.js'
import { getRepContext, regionFilter } from '../repContext.js'

const router = Router()

router.get('/', async (req, res) => {
  try {
    const region = req.query['region'] as string | undefined
    const ctx = await getRepContext(req)
    const rf  = regionFilter(ctx)

    const stores = await prisma.store.findMany({
      // Dashboard metrics describe the stores we currently service. Including
      // deactivated ones would drag every average and count off.
      where: { status: 'active', ...rf, ...(region ? { marketSlug: region } : {}) },
      include: {
        market:  { select: { name: true } },
        chain:   { select: { name: true } },
        rep:     { select: { name: true } },
        alerts:  {
          where:   { status: 'OPEN' },
          select:  { type: true },
          orderBy: { triggeredAt: 'desc' },
          take:    1,
        },
      },
      orderBy: { name: 'asc' },
    })

    const result = stores.map(s => ({
      id:            s.id,
      name:          s.name,
      region:        s.marketSlug,
      regionName:    s.market.name,
      chainId:       s.chainId ?? null,
      chainName:     s.chain?.name ?? null,
      rep:           s.rep?.name ?? null,
      latitude:      s.latitude,
      longitude:     s.longitude,
      onShelf:       s.onShelf,
      inProcess:     s.inProcess,
      daysOfSupply:  s.daysOfSupply,
      depletionRate: s.depletionRate,
      lastVisit:     s.lastVisit?.toISOString() ?? null,
      hasAlert:      s.alerts.length > 0,
      alertType:     s.alerts[0]?.type ?? null,
    }))

    res.json(result)
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: 'Internal server error' })
  }
})

// GET /api/dashboard/depletion?region=&weeks=8
//
// Backs the Weekly Depletion chart, which previously rendered a hardcoded row
// of zeros labelled W1–W8.
//
//   sold    — bottles reps recorded on visits (StoreVisit.bottlesSold)
//   ordered — quantity on orders placed that week (StoreOrder.quantity)
//
// Deliberately NOT blending in stock-sync shelf drops: a week containing both a
// logged visit and a sync drop would double-count the same bottles.
router.get('/depletion', async (req, res) => {
  try {
    const region = req.query['region'] as string | undefined
    const weeksParam = Number(req.query['weeks'])
    const weeks = Number.isFinite(weeksParam) && weeksParam > 0
      ? Math.min(Math.floor(weeksParam), 26)
      : 8

    const ctx = await getRepContext(req)
    const rf  = regionFilter(ctx)

    const storeWhere = {
      status: 'active' as const,
      ...rf,
      ...(region && region !== 'all' ? { marketSlug: region } : {}),
    }

    // Week buckets, oldest first, ending with the current week. Stepped by
    // calendar date so a DST change can't shift a boundary by an hour.
    const startOfWeek = (d: Date) => {
      const ws = new Date(d)
      ws.setDate(d.getDate() - d.getDay())
      ws.setHours(0, 0, 0, 0)
      return ws
    }

    const buckets: { start: Date; end: Date; label: string }[] = []
    const cursor = startOfWeek(new Date())
    cursor.setDate(cursor.getDate() - (weeks - 1) * 7)
    for (let i = 0; i < weeks; i++) {
      const start = new Date(cursor)
      const end   = new Date(cursor)
      end.setDate(end.getDate() + 7)
      buckets.push({
        start, end,
        label: start.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
      })
      cursor.setDate(cursor.getDate() + 7)
      cursor.setHours(0, 0, 0, 0)
    }

    const windowStart = buckets[0]!.start
    const windowEnd   = buckets[buckets.length - 1]!.end

    const [visits, orders] = await Promise.all([
      prisma.storeVisit.findMany({
        where: {
          store:       storeWhere,
          bottlesSold: { not: null },
          // Must match the field we bucket on below. Filtering on createdAt
          // alone would drop a visit backfilled inside the window but typed in
          // outside it — and legacy rows have no visitedAt at all.
          OR: [
            { visitedAt: { gte: windowStart, lt: windowEnd } },
            { visitedAt: null, createdAt: { gte: windowStart, lt: windowEnd } },
          ],
        },
        select: { bottlesSold: true, visitedAt: true, createdAt: true },
      }),
      prisma.storeOrder.findMany({
        where: {
          store:    storeWhere,
          placedAt: { gte: windowStart, lt: windowEnd },
        },
        select: { quantity: true, placedAt: true },
      }),
    ])

    const rows = buckets.map(b => ({
      week:      b.label,
      weekStart: b.start.toISOString(),
      sold:      0,
      ordered:   0,
    }))

    function bucketIndexFor(date: Date): number {
      return buckets.findIndex(b => date >= b.start && date < b.end)
    }

    for (const v of visits) {
      // visitedAt is the real-world date; createdAt is when it was typed in.
      // A backfilled visit belongs to the week it happened, not the week it
      // was logged — otherwise last month's sales land on this week's bar.
      const when = v.visitedAt ?? v.createdAt
      const i = bucketIndexFor(when)
      if (i >= 0) rows[i]!.sold += v.bottlesSold ?? 0
    }

    for (const o of orders) {
      const i = bucketIndexFor(o.placedAt)
      if (i >= 0) rows[i]!.ordered += o.quantity
    }

    res.json(rows)
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: 'Internal server error' })
  }
})

export default router
