import { Router } from 'express'
import { prisma } from '../prisma.js'

const router = Router()

const repSelect = {
  id:          true,
  name:        true,
  email:       true,
  phone:       true,
  allRegions:  true,
  clerkUserId: true,
  marketSlug:  true,
  status:      true,
  market:      { select: { name: true } },
  repMarkets:  { select: { marketSlug: true } },
} as const

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function fmt(r: any) {
  return {
    id:          r.id,
    name:        r.name,
    email:       r.email,
    phone:       (r.phone as string | null) ?? null,
    allRegions:  r.allRegions,
    clerkUserId: r.clerkUserId,
    region:      r.marketSlug,
    regionName:  r.market.name,
    markets:     (r.repMarkets as { marketSlug: string }[]).map(rm => rm.marketSlug),
    status:      r.status,
  }
}

router.get('/', async (req, res) => {
  try {
    const region = req.query['region'] as string | undefined
    const reps = await prisma.rep.findMany({
      where:   region ? { marketSlug: region } : undefined,
      select:  repSelect,
      orderBy: { name: 'asc' },
    })
    res.json(reps.map(fmt))
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: 'Internal server error' })
  }
})

router.post('/', async (req, res) => {
  try {
    const { name, email, phone, regionSlug, status, clerkUserId, allRegions, markets } = req.body
    const rep = await prisma.rep.create({
      data: {
        name,
        email,
        phone:       phone || null,
        allRegions:  allRegions ?? false,
        marketSlug:  regionSlug,
        status:      status ?? 'active',
        clerkUserId: clerkUserId ?? null,
        repMarkets:  markets?.length
          ? { create: (markets as string[]).map((s: string) => ({ marketSlug: s })) }
          : undefined,
      },
      select: repSelect,
    })
    res.status(201).json(fmt(rep))
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: 'Internal server error' })
  }
})

router.patch('/:id', async (req, res) => {
  try {
    const id = req.params['id']!
    const { name, email, phone, regionSlug, status, clerkUserId, allRegions, markets } = req.body

    const updateData: Parameters<typeof prisma.rep.update>[0]['data'] = {
      name,
      email,
      phone:       phone !== undefined ? (phone || null) : undefined,
      allRegions:  allRegions !== undefined ? allRegions : undefined,
      marketSlug:  regionSlug,
      status,
      clerkUserId: clerkUserId === '' ? null : clerkUserId,
    }

    if (markets !== undefined) {
      await prisma.repMarket.deleteMany({ where: { repId: id } })
      if ((markets as string[]).length > 0) {
        await prisma.repMarket.createMany({
          data: (markets as string[]).map((s: string) => ({ repId: id, marketSlug: s })),
          skipDuplicates: true,
        })
      }
    }

    const rep = await prisma.rep.update({
      where:  { id },
      data:   updateData,
      select: repSelect,
    })
    res.json(fmt(rep))
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: 'Internal server error' })
  }
})

router.delete('/:id', async (req, res) => {
  try {
    const id = req.params['id']
    const storeCount = await prisma.store.count({ where: { repId: id } })
    if (storeCount > 0) {
      return res.status(409).json({ error: `Rep is assigned to ${storeCount} store(s). Reassign them first.` })
    }
    const visitCount = await prisma.storeVisit.count({ where: { repId: id } })
    if (visitCount > 0) {
      return res.status(409).json({ error: `Rep has ${visitCount} logged visit(s). Mark them inactive instead to preserve history.` })
    }
    await prisma.$transaction([
      prisma.repMarket.deleteMany({ where: { repId: id } }),
      prisma.eventRep.deleteMany({ where: { repId: id } }),
      prisma.rep.delete({ where: { id } }),
    ])
    res.json({ ok: true })
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: 'Internal server error' })
  }
})

export default router
