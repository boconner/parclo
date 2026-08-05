import { Router } from 'express'
import { prisma } from '../prisma.js'
import { getRepContext, regionFilter } from '../repContext.js'

const router = Router()

function formatAlert(a: any) {
  return {
    id:          a.id,
    type:        a.type,
    status:      a.status,
    message:     a.message,
    triggeredAt: a.triggeredAt.toISOString(),
    resolvedAt:  a.resolvedAt?.toISOString() ?? undefined,
    store:       a.store
      ? { id: a.store.id, name: a.store.name, region: { name: a.store.market.name, slug: a.store.marketSlug } }
      : undefined,
  }
}

router.get('/', async (req, res) => {
  try {
    const { region, status, storeId } = req.query as Record<string, string>
    const ctx = await getRepContext(req)
    const rf  = regionFilter(ctx)
    const hasStoreFilter = Object.keys(rf).length > 0 || !!region
    const alerts = await prisma.alert.findMany({
      where: {
        ...(status  ? { status: status as any } : { status: 'OPEN' }),
        ...(hasStoreFilter ? {
          store: {
            ...rf,
            ...(region ? { marketSlug: region } : {}),
          },
        } : {}),
        ...(storeId ? { storeId } : {}),
      },
      include: { store: { select: { id: true, name: true, marketSlug: true, market: { select: { name: true } } } } },
      orderBy: { triggeredAt: 'desc' },
    })
    res.json(alerts.map(formatAlert))
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: 'Internal server error' })
  }
})

router.patch('/:id/resolve', async (req, res) => {
  try {
    const alert = await prisma.alert.update({
      where:   { id: req.params['id'] },
      data:    { status: 'RESOLVED', resolvedAt: new Date() },
      include: { store: { select: { id: true, name: true, marketSlug: true, market: { select: { name: true } } } } },
    })
    res.json(formatAlert(alert))
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: 'Internal server error' })
  }
})

router.patch('/resolve-all', async (req, res) => {
  try {
    const { region } = req.query as Record<string, string>
    await prisma.alert.updateMany({
      where: {
        status: 'OPEN',
        ...(region ? { store: { marketSlug: region } } : {}),
      },
      data: { status: 'RESOLVED', resolvedAt: new Date() },
    })
    res.json({ ok: true })
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: 'Internal server error' })
  }
})

export default router
