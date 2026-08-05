import { Router } from 'express'
import { prisma } from '../prisma.js'
import { getRepContext } from '../repContext.js'

const router = Router()

router.get('/', async (req, res) => {
  try {
    const ctx = await getRepContext(req)
    const where = (!ctx.isAdmin && !ctx.allRegions && ctx.marketSlugs.length > 0)
      ? { slug: { in: ctx.marketSlugs } }
      : undefined
    const regions = await prisma.market.findMany({
      where,
      include: { _count: { select: { stores: true } } },
      orderBy: { name: 'asc' },
    })
    res.json(regions.map(m => ({
      slug:   m.slug,
      name:   m.name,
      _count: { stores: m._count.stores },
    })))
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: 'Internal server error' })
  }
})

// Region create/rename/delete are admin config, mirroring the chain routes.
router.post('/', async (req, res) => {
  try {
    const ctx = await getRepContext(req)
    if (!ctx.isAdmin && !ctx.allRegions) return res.status(403).json({ error: 'Forbidden' })

    const { name } = req.body
    const slug = name.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
    const region = await prisma.market.create({ data: { slug, name } })
    res.status(201).json({ slug: region.slug, name: region.name, _count: { stores: 0 } })
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: 'Internal server error' })
  }
})

router.patch('/:slug', async (req, res) => {
  try {
    const ctx = await getRepContext(req)
    if (!ctx.isAdmin && !ctx.allRegions) return res.status(403).json({ error: 'Forbidden' })

    const { name } = req.body
    const region = await prisma.market.update({
      where: { slug: req.params['slug'] },
      data:  { name },
    })
    res.json({ slug: region.slug, name: region.name })
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: 'Internal server error' })
  }
})

router.delete('/:slug', async (req, res) => {
  try {
    const ctx = await getRepContext(req)
    if (!ctx.isAdmin && !ctx.allRegions) return res.status(403).json({ error: 'Forbidden' })

    const slug = req.params['slug']
    const storeCount = await prisma.store.count({ where: { marketSlug: slug } })
    if (storeCount > 0) {
      return res.status(409).json({ error: `Region has ${storeCount} store(s). Reassign them before deleting.` })
    }
    const repCount = await prisma.rep.count({ where: { marketSlug: slug } })
    if (repCount > 0) {
      return res.status(409).json({ error: `Region has ${repCount} rep(s). Reassign them before deleting.` })
    }
    await prisma.market.delete({ where: { slug } })
    res.json({ ok: true })
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: 'Internal server error' })
  }
})

export default router
