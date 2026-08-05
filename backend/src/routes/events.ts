import { Router } from 'express'
import { prisma } from '../prisma.js'
import { getAuth } from '@clerk/express'
import { getRepContext, regionFilter } from '../repContext.js'

const router = Router()

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function fmt(e: any) {
  return {
    id:               e.id,
    type:             e.type,
    title:            e.title              ?? null,
    storeId:          e.storeId            ?? null,
    storeName:        e.store?.name        ?? null,
    region:           e.store?.marketSlug  ?? null,
    regionName:       e.store?.market?.name ?? null,
    chainId:          e.store?.chainId     ?? null,
    chainName:        e.store?.chain?.name ?? null,
    address:          e.address            ?? null,
    bottlesSold:      e.bottlesSold        ?? null,
    scheduledAt:      e.scheduledAt.toISOString(),
    endTime:          e.endTime ? e.endTime.toISOString() : null,
    status:           e.status,
    notes:            e.notes              ?? null,
    completionNotes:  e.completionNotes    ?? null,
    takeaways:        e.takeaways          ?? null,
    accomplishments:  e.accomplishments    ?? null,
    hoursWorked:      e.hoursWorked        ?? null,
    closedByRepId:    e.closedByRepId      ?? null,
    closedByName:     e.closedByName       ?? null,
    contactId:        e.contactId          ?? null,
    contactName:      e.contact?.name      ?? null,
    reps:             e.reps.map((er: { rep: { id: string; name: string } }) => ({ id: er.rep.id, name: er.rep.name })),
    visitId:          e.visit?.id          ?? null,
  }
}

const include = {
  store:   { select: { id: true, name: true, marketSlug: true, market: { select: { name: true } }, chainId: true, chain: { select: { name: true } } } },
  reps:    { include: { rep: { select: { id: true, name: true } } } },
  contact: { select: { id: true, name: true } },
  visit:   { select: { id: true } },
}

router.get('/', async (req, res) => {
  try {
    const { repId, status, storeId } = req.query as Record<string, string>
    const ctx = await getRepContext(req)
    const rf  = regionFilter(ctx)
    const hasRegionFilter = Object.keys(rf).length > 0

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const where: any = {}
    if (storeId) where.storeId = storeId
    if (status)  where.status  = status as 'scheduled' | 'completed' | 'cancelled'
    if (repId)   where.reps    = { some: { repId } }
    if (hasRegionFilter) {
      if (storeId) {
        where.store = rf
      } else {
        // include private events (no store) alongside region-scoped events
        where.OR = [{ store: rf }, { storeId: null }]
      }
    }

    const events = await prisma.event.findMany({ where, include, orderBy: { scheduledAt: 'asc' } })
    res.json(events.map(fmt))
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: 'Internal server error' })
  }
})

router.post('/', async (req, res) => {
  try {
    const { storeId, type, title, address, bottlesSold, scheduledAt, endTime, repIds, notes, contactId } = req.body
    const event = await prisma.event.create({
      data: {
        storeId:     storeId   || null,
        type:        type      || 'tasting',
        title:       title     || null,
        address:     address   || null,
        bottlesSold: bottlesSold != null ? Number(bottlesSold) : null,
        scheduledAt: new Date(scheduledAt),
        ...(endTime   ? { endTime: new Date(endTime) } : {}),
        notes:       notes     || null,
        contactId:   contactId || null,
        reps: { create: (repIds as string[]).map((repId: string) => ({ repId })) },
      },
      include,
    })
    res.status(201).json(fmt(event))
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: 'Internal server error' })
  }
})

router.patch('/:id', async (req, res) => {
  try {
    const { status, completionNotes, takeaways, accomplishments, hoursWorked, type, title, address, bottlesSold, scheduledAt, endTime, notes, contactId, repIds } = req.body

    if (repIds !== undefined) {
      await prisma.eventRep.deleteMany({ where: { eventId: req.params['id'] } })
    }

    let closedByRepId: string | null = null
    let closedByName: string | null = null
    if (status === 'completed') {
      const { userId } = getAuth(req)
      if (userId) {
        const rep = await prisma.rep.findFirst({
          where:  { clerkUserId: userId },
          select: { id: true, name: true },
        })
        if (rep) { closedByRepId = rep.id; closedByName = rep.name }
      }
    }

    const event = await prisma.event.update({
      where: { id: req.params['id'] },
      data: {
        ...(status          !== undefined ? { status }                                     : {}),
        ...(completionNotes !== undefined ? { completionNotes: completionNotes || null }   : {}),
        ...(takeaways       !== undefined ? { takeaways: takeaways || null }               : {}),
        ...(accomplishments !== undefined ? { accomplishments: accomplishments || null }   : {}),
        ...(hoursWorked     !== undefined ? { hoursWorked: hoursWorked != null ? Number(hoursWorked) : null } : {}),
        ...(status === 'completed'        ? { closedByRepId, closedByName }                : {}),
        ...(type            !== undefined ? { type }                                       : {}),
        ...(title           !== undefined ? { title: title || null }                       : {}),
        ...(address         !== undefined ? { address: address || null }                   : {}),
        ...(bottlesSold     !== undefined ? { bottlesSold: bottlesSold != null ? Number(bottlesSold) : null } : {}),
        ...(scheduledAt     !== undefined ? { scheduledAt: new Date(scheduledAt) }         : {}),
        ...(endTime         !== undefined ? { endTime: endTime ? new Date(endTime) : null }: {}),
        ...(notes           !== undefined ? { notes: notes || null }                       : {}),
        ...(contactId       !== undefined ? { contactId: contactId || null }               : {}),
        ...(repIds          !== undefined ? { reps: { create: (repIds as string[]).map((repId: string) => ({ repId })) } } : {}),
      },
      include,
    })
    res.json(fmt(event))
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: 'Internal server error' })
  }
})

router.delete('/:id', async (req, res) => {
  try {
    const id = req.params['id']
    await prisma.storeVisit.updateMany({ where: { eventId: id }, data: { eventId: null } })
    await prisma.eventRep.deleteMany({ where: { eventId: id } })
    await prisma.event.delete({ where: { id } })
    res.json({ id })
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: 'Internal server error' })
  }
})

export default router
