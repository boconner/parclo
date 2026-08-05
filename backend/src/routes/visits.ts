import { Router } from 'express'
import { getAuth } from '@clerk/express'
import { prisma } from '../prisma.js'
import { syncSingleProductLevel } from '../storeProducts.js'
import { getRepContext, regionFilter } from '../repContext.js'
import { computeStoreUpdate, isLatestVisit, visitTime } from '../visitState.js'

const router = Router()

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function fmt(v: any) {
  return {
    id:              v.id,
    storeId:         v.storeId,
    storeName:       v.store.name,
    region:          v.store.marketSlug,
    date:            (v.visitedAt ?? v.createdAt).toISOString(),
    repId:           v.repId,
    rep:             v.rep.name,
    onShelf:         v.onShelf,
    action:          v.action          ?? null,
    logType:         v.logType         ?? null,
    bottlesSold:     v.bottlesSold     ?? null,
    notes:           v.notes           ?? null,
    takeaways:       v.takeaways       ?? null,
    accomplishments: v.accomplishments ?? null,
    hoursWorked:     v.hoursWorked     ?? null,
    contactId:       v.contactId       ?? null,
    contactName:     v.contact?.name   ?? null,
  }
}

const include = {
  store:   { select: { name: true, marketSlug: true } },
  rep:     { select: { name: true } },
  contact: { select: { id: true, name: true } },
}

// The page view only needs the most recent slice, but the CSV export needs the
// complete filtered history — a silent 100-row cap would hand the user a
// truncated file that looks complete. Bounded so a bad value can't dump the table.
const DEFAULT_LIMIT = 100
const MAX_LIMIT     = 5000

router.get('/', async (req, res) => {
  try {
    const { storeId, repId, contactId, limit } = req.query as Record<string, string>
    const ctx = await getRepContext(req)
    const rf  = regionFilter(ctx)
    const storeFilter = Object.keys(rf).length > 0 ? { store: rf } : {}

    const parsedLimit = Number(limit)
    const take = Number.isFinite(parsedLimit) && parsedLimit > 0
      ? Math.min(Math.floor(parsedLimit), MAX_LIMIT)
      : DEFAULT_LIMIT

    const visits = await prisma.storeVisit.findMany({
      where: {
        ...storeFilter,
        ...(storeId   ? { storeId }   : {}),
        ...(repId     ? { repId }     : {}),
        ...(contactId ? { contactId } : {}),
      },
      include,
      orderBy: { createdAt: 'desc' },
      take,
    })
    res.json(visits.map(fmt))
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: 'Internal server error' })
  }
})

router.post('/', async (req, res) => {
  try {
    const {
      storeId,
      onShelf,
      logType     = 'visit',
      action,
      visitedAt,
      bottlesSold,
      notes,
      takeaways,
      accomplishments,
      hoursWorked,
      contactId,
      linkedEventId,
      casesDelivered,
    } = req.body

    let { repId } = req.body

    const { userId } = getAuth(req)

    // Resolve repId and closedBy info from Clerk in one lookup
    let closedByRepId: string | null = null
    let closedByName:  string | null = null

    if (userId) {
      const myRep = await prisma.rep.findFirst({
        where:  { clerkUserId: userId },
        select: { id: true, name: true },
      })
      if (myRep) {
        if (!repId) repId = myRep.id
        closedByRepId = myRep.id
        closedByName  = myRep.name
      }
    }

    if (!repId) {
      return res.status(400).json({ error: 'No rep specified and your account is not linked to a rep profile.' })
    }

    const visitTimestamp = visitedAt ? new Date(visitedAt) : new Date()

    const toNum = (v: unknown) => (v !== undefined && v !== null && v !== '') ? Number(v) : null

    // Find the most recent prior visit BY DATE (not insertion order) — the true
    // predecessor of this one. Ordering by visitedAt (nulls last, createdAt as a
    // tiebreaker for legacy rows) lets us tell whether this visit is the newest
    // on record or a back-dated backfill.
    const [existingStore, lastVisit] = await Promise.all([
      prisma.store.findUnique({ where: { id: storeId }, select: { depletionRate: true, chainId: true, marketSlug: true } }),
      prisma.storeVisit.findFirst({
        where:   { storeId },
        orderBy: [{ visitedAt: { sort: 'desc', nulls: 'last' } }, { createdAt: 'desc' }],
        select:  { onShelf: true, createdAt: true, visitedAt: true },
      }),
    ])

    // Decide how this visit affects the store's current state. Returns null when
    // it's a back-dated backfill, in which case current state is left untouched.
    const update = computeStoreUpdate({
      onShelf:              Number(onShelf),
      visitTime:            visitTimestamp.getTime(),
      previous:             lastVisit ? { onShelf: lastVisit.onShelf, time: visitTime(lastVisit) } : null,
      currentDepletionRate: existingStore?.depletionRate ?? null,
    })
    const isLatest = update !== null

    const storeUpdate = update && {
      onShelf:   update.onShelf,
      lastVisit: new Date(update.lastVisitTime),
      ...(update.depletionRate !== undefined ? { depletionRate: update.depletionRate } : {}),
      ...(update.daysOfSupply  !== undefined ? { daysOfSupply:  update.daysOfSupply } : {}),
    }

    const visitData = {
      storeId, repId,
      logType,
      action:         action         || null,
      visitedAt:      visitTimestamp,
      onShelf:        Number(onShelf),
      bottlesSold:    toNum(bottlesSold),
      notes:          notes          || null,
      takeaways:      takeaways      || null,
      accomplishments: accomplishments || null,
      hoursWorked:    toNum(hoursWorked),
      contactId:      contactId      || null,
    }

    if (linkedEventId) {
      // Link to an existing scheduled event → patch it to completed
      const existingEvent = await prisma.event.findUnique({
        where:  { id: linkedEventId },
        select: { hoursWorked: true },
      })
      const finalHours = toNum(hoursWorked) ?? existingEvent?.hoursWorked ?? null

      const visit = await prisma.storeVisit.create({
        data:    { ...visitData, eventId: linkedEventId },
        include,
      })

      await prisma.event.update({
        where: { id: linkedEventId },
        data: {
          status:          'completed',
          completionNotes: notes          || null,
          takeaways:       takeaways      || null,
          accomplishments: accomplishments || null,
          hoursWorked:     finalHours,
          closedByRepId,
          closedByName,
        },
      })

      if (storeUpdate) {
      await prisma.store.update({ where: { id: storeId }, data: storeUpdate })
      await syncSingleProductLevel(storeId, { onShelf: storeUpdate.onShelf })
    }

      // Auto-resolve LOW_STOCK_REP alert if shelf is now healthy (latest visit only)
      if (isLatest && Number(onShelf) > 4) {
        await prisma.alert.updateMany({
          where: { storeId, type: 'LOW_STOCK_REP', status: 'OPEN' },
          data:  { status: 'RESOLVED', resolvedAt: visitTimestamp },
        })
      }

      // Auto-create a field deployment if the rep dropped off cases
      const deliveredQty = Number(casesDelivered)
      if (deliveredQty > 0) {
        await prisma.fieldDeployment.create({
          data: {
            quantity:   deliveredQty,
            storeId,
            repId,
            chainId:    existingStore?.chainId    ?? null,
            marketSlug: existingStore?.marketSlug ?? null,
            deployedAt: visitTimestamp,
            notes:      'Delivered via visit log',
          },
        })
      }

      return res.status(201).json(fmt(visit))
    }

    // No linked event → create a new completed event then link the visit
    const eventType = logType === 'tasting' ? 'tasting' : 'tasking'
    const newEvent = await prisma.event.create({
      data: {
        storeId,
        type:            eventType,
        scheduledAt:     visitTimestamp,
        status:          'completed',
        completionNotes: notes          || null,
        takeaways:       takeaways      || null,
        accomplishments: accomplishments || null,
        hoursWorked:     toNum(hoursWorked),
        closedByRepId,
        closedByName,
        contactId:       contactId || null,
        reps: { create: [{ repId }] },
      },
    })

    const visit = await prisma.storeVisit.create({
      data:    { ...visitData, eventId: newEvent.id },
      include,
    })

    if (storeUpdate) {
      await prisma.store.update({ where: { id: storeId }, data: storeUpdate })
      await syncSingleProductLevel(storeId, { onShelf: storeUpdate.onShelf })
    }

    // Auto-resolve LOW_STOCK_REP alert if shelf is now healthy (latest visit only)
    if (isLatest && Number(onShelf) > 4) {
      await prisma.alert.updateMany({
        where: { storeId, type: 'LOW_STOCK_REP', status: 'OPEN' },
        data:  { status: 'RESOLVED', resolvedAt: visitTimestamp },
      })
    }

    // A visit is exactly what a VISIT_OVERDUE alert was asking for, so clear it
    // now rather than leaving it up until the nightly scan catches up.
    await prisma.alert.updateMany({
      where: { storeId, type: 'VISIT_OVERDUE', status: 'OPEN' },
      data:  { status: 'RESOLVED', resolvedAt: visitTimestamp },
    })

    // Auto-create a field deployment if the rep dropped off cases
    const deliveredQty = Number(casesDelivered)
    if (deliveredQty > 0) {
      await prisma.fieldDeployment.create({
        data: {
          quantity:   deliveredQty,
          storeId,
          repId,
          chainId:    existingStore?.chainId    ?? null,
          marketSlug: existingStore?.marketSlug ?? null,
          deployedAt: visitTimestamp,
          notes:      'Delivered via visit log',
        },
      })
    }

    return res.status(201).json(fmt(visit))
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: 'Internal server error' })
  }
})

router.patch('/:id', async (req, res) => {
  try {
    const { id }  = req.params
    const { onShelf, action, notes, contactId, bottlesSold, takeaways, accomplishments, hoursWorked } = req.body

    const toNum = (v: unknown) => (v !== undefined && v !== null && v !== '') ? Number(v) : null

    const visit = await prisma.storeVisit.update({
      where: { id },
      data: {
        ...(onShelf          !== undefined ? { onShelf: Number(onShelf) }                            : {}),
        ...(action           !== undefined ? { action: action || null }                              : {}),
        ...(notes            !== undefined ? { notes: notes || null }                                : {}),
        ...(bottlesSold      !== undefined ? { bottlesSold: toNum(bottlesSold) }                     : {}),
        ...(takeaways        !== undefined ? { takeaways: takeaways || null }                        : {}),
        ...(accomplishments  !== undefined ? { accomplishments: accomplishments || null }             : {}),
        ...(hoursWorked      !== undefined ? { hoursWorked: toNum(hoursWorked) }                     : {}),
        ...(contactId        !== undefined ? { contactId: contactId || null }                        : {}),
      },
      include,
    })

    // Sync store.onShelf only when editing the latest visit BY DATE — editing a
    // historical backfill must not change the store's current shelf count.
    if (onShelf !== undefined) {
      const latest = await prisma.storeVisit.findFirst({
        where:   { storeId: visit.storeId },
        orderBy: [{ visitedAt: { sort: 'desc', nulls: 'last' } }, { createdAt: 'desc' }],
        select:  { id: true },
      })
      if (latest?.id === id) {
        await prisma.store.update({ where: { id: visit.storeId }, data: { onShelf: Number(onShelf) } })
        await syncSingleProductLevel(visit.storeId, { onShelf: Number(onShelf) })
      }
    }

    res.json(fmt(visit))
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: 'Internal server error' })
  }
})

router.delete('/:id', async (req, res) => {
  try {
    const visit = await prisma.storeVisit.findUnique({
      where:  { id: req.params['id'] },
      select: { id: true, storeId: true, eventId: true, createdAt: true, visitedAt: true },
    })
    if (!visit) return res.status(404).json({ error: 'Visit not found' })

    await prisma.storeVisit.delete({ where: { id: visit.id } })

    // Find the latest remaining visit BY DATE.
    const prev = await prisma.storeVisit.findFirst({
      where:   { storeId: visit.storeId },
      orderBy: [{ visitedAt: { sort: 'desc', nulls: 'last' } }, { createdAt: 'desc' }],
      select:  { onShelf: true, visitedAt: true, createdAt: true },
    })

    // Only roll the store's current state back if the deleted visit was the
    // latest one (i.e. it defined current state). Deleting a historical backfill
    // leaves the store untouched.
    const wasLatest = isLatestVisit(visitTime(visit), prev ? visitTime(prev) : null)

    if (wasLatest) {
      await prisma.store.update({
        where: { id: visit.storeId },
        data: prev
          ? { onShelf: prev.onShelf, lastVisit: prev.visitedAt ?? prev.createdAt, depletionRate: null, daysOfSupply: null }
          : { onShelf: 0, lastVisit: null, depletionRate: null, daysOfSupply: null },
      })
      await syncSingleProductLevel(visit.storeId, { onShelf: prev ? prev.onShelf : 0 })
    }

    // Clean up linked event
    if (visit.eventId) {
      const linkedEvent = await prisma.event.findUnique({
        where:  { id: visit.eventId },
        select: { id: true, createdAt: true },
      })
      const otherVisit = await prisma.storeVisit.findFirst({ where: { eventId: visit.eventId } })

      if (!otherVisit && linkedEvent) {
        const visitCreatedAt = new Date(visit.createdAt ?? Date.now()).getTime()
        const eventCreatedAt = new Date(linkedEvent.createdAt).getTime()
        const wasAutoCreated = (visitCreatedAt - eventCreatedAt) < 60_000

        if (wasAutoCreated) {
          // Event was created alongside this visit — delete it entirely
          await prisma.eventRep.deleteMany({ where: { eventId: visit.eventId } })
          await prisma.event.delete({ where: { id: visit.eventId } })
        } else {
          // Event pre-existed (was scheduled) — revert it back to scheduled
          await prisma.event.update({
            where: { id: visit.eventId },
            data: {
              status:          'scheduled',
              completionNotes: null,
              takeaways:       null,
              accomplishments: null,
              hoursWorked:     null,
              closedByRepId:   null,
              closedByName:    null,
            },
          })
        }
      }
    }

    res.json({ ok: true })
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: 'Internal server error' })
  }
})

export default router
