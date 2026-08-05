import { Router } from 'express'
import { prisma } from '../prisma.js'
import { getRepContext } from '../repContext.js'

const router = Router()

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function formatProduct(p: any) {
  return {
    id:           p.id,
    name:         p.name,
    sku:          p.sku ?? null,
    sizeLabel:    p.sizeLabel ?? null,
    unitsPerCase: p.unitsPerCase ?? null,
    status:       p.status,
    sortOrder:    p.sortOrder,
  }
}

// Active products, for pickers. Pass ?includeArchived=1 for admin lists.
router.get('/', async (req, res) => {
  try {
    const includeArchived = req.query['includeArchived'] === '1'
    const products = await prisma.product.findMany({
      where:   includeArchived ? {} : { status: 'active' },
      orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
    })
    res.json(products.map(formatProduct))
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: 'Internal server error' })
  }
})

router.post('/', async (req, res) => {
  try {
    const ctx = await getRepContext(req)
    if (!ctx.isAdmin && !ctx.allRegions) return res.status(403).json({ error: 'Forbidden' })

    const { name, sku, sizeLabel, unitsPerCase, sortOrder } = req.body
    if (!name || typeof name !== 'string' || !name.trim()) {
      return res.status(400).json({ error: 'Name is required' })
    }
    const product = await prisma.product.create({
      data: {
        name:         name.trim(),
        sku:          sku?.trim() || null,
        sizeLabel:    sizeLabel?.trim() || null,
        unitsPerCase: unitsPerCase !== undefined && unitsPerCase !== null && unitsPerCase !== '' ? Math.max(1, Number(unitsPerCase)) : null,
        sortOrder:    sortOrder !== undefined ? Number(sortOrder) : 0,
      },
    })
    res.status(201).json(formatProduct(product))
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: 'Internal server error' })
  }
})

router.patch('/:id', async (req, res) => {
  try {
    const ctx = await getRepContext(req)
    if (!ctx.isAdmin && !ctx.allRegions) return res.status(403).json({ error: 'Forbidden' })

    const { name, sku, sizeLabel, unitsPerCase, sortOrder, status } = req.body
    if (status !== undefined && status !== 'active' && status !== 'archived') {
      return res.status(400).json({ error: 'Invalid status' })
    }
    const product = await prisma.product.update({
      where: { id: req.params['id'] },
      data:  {
        ...(name         !== undefined ? { name: String(name).trim() }                : {}),
        ...(sku          !== undefined ? { sku: sku?.trim() || null }                 : {}),
        ...(sizeLabel    !== undefined ? { sizeLabel: sizeLabel?.trim() || null }     : {}),
        ...(unitsPerCase !== undefined ? { unitsPerCase: unitsPerCase === null || unitsPerCase === '' ? null : Math.max(1, Number(unitsPerCase)) } : {}),
        ...(sortOrder    !== undefined ? { sortOrder: Number(sortOrder) }             : {}),
        ...(status       !== undefined ? { status }                                   : {}),
      },
    })
    res.json(formatProduct(product))
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: 'Internal server error' })
  }
})

// Hard delete is only allowed while the product has no stock recorded anywhere;
// otherwise archive it (PATCH status) so history stays intact.
router.delete('/:id', async (req, res) => {
  try {
    const ctx = await getRepContext(req)
    if (!ctx.isAdmin && !ctx.allRegions) return res.status(403).json({ error: 'Forbidden' })

    const id = req.params['id']
    const withStock = await prisma.storeProduct.count({
      where: { productId: id, OR: [{ onShelf: { gt: 0 } }, { inProcess: { gt: 0 } }] },
    })
    if (withStock > 0) {
      return res.status(409).json({ error: `Product has stock recorded at ${withStock} store(s). Archive it instead.` })
    }
    await prisma.$transaction([
      prisma.storeProduct.deleteMany({ where: { productId: id } }),
      prisma.product.delete({ where: { id } }),
    ])
    res.json({ ok: true })
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: 'Internal server error' })
  }
})

export default router
