import { Router } from 'express'
import { prisma } from '../prisma.js'

const router = Router()

function normStatus(s: string): 'pending' | 'in-transit' | 'delivered' {
  return (s === 'in_transit' ? 'in-transit' : s) as 'pending' | 'in-transit' | 'delivered'
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function formatOrder(o: any) {
  return {
    id:         o.id,
    poNumber:   o.poNumber,
    product:    o.product,
    supplier:   o.supplier,
    quantity:   o.quantity,
    notes:      o.notes ?? undefined,
    status:     normStatus(o.status),
    orderedAt:  o.orderedAt.toISOString(),
    expectedAt: o.expectedAt.toISOString(),
  }
}

router.get('/', async (req, res) => {
  try {
    const { status } = req.query as Record<string, string>
    const orders = await prisma.supplierOrder.findMany({
      where:   status ? { status: status.replace('-', '_') as any } : undefined,
      orderBy: { orderedAt: 'desc' },
    })
    res.json(orders.map(formatOrder))
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: 'Internal server error' })
  }
})

router.post('/', async (req, res) => {
  try {
    const { poNumber, product, quantity, supplier = '', notes, expectedAt } = req.body
    const order = await prisma.supplierOrder.create({
      data: { poNumber, product, supplier, quantity, notes, expectedAt: new Date(expectedAt) },
    })
    res.status(201).json(formatOrder(order))
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: 'Internal server error' })
  }
})

router.patch('/:id', async (req, res) => {
  try {
    const { status } = req.body
    const order = await prisma.supplierOrder.update({
      where: { id: req.params['id'] },
      data:  { status: status.replace('-', '_') as any },
    })
    res.json(formatOrder(order))
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: 'Internal server error' })
  }
})

export default router
