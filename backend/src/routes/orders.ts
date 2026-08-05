import { Router } from 'express'
import { prisma } from '../prisma.js'
import { getRepContext, regionFilter } from '../repContext.js'

const router = Router()

router.get('/', async (req, res) => {
  try {
    const { storeId, status } = req.query as Record<string, string>
    const ctx = await getRepContext(req)
    const rf  = regionFilter(ctx)
    const storeFilter = Object.keys(rf).length > 0 ? { store: rf } : {}
    const orders = await prisma.storeOrder.findMany({
      where: {
        ...storeFilter,
        ...(storeId ? { storeId }               : {}),
        ...(status  ? { status: status as any } : {}),
      },
      include: { store: { select: { id: true, name: true, marketSlug: true } } },
      orderBy: { placedAt: 'desc' },
      take:    100,
    })
    res.json(orders.map(o => ({
      id:         o.id,
      storeId:    o.storeId,
      storeName:  o.store.name,
      region:     o.store.marketSlug,
      placedAt:   o.placedAt.toISOString(),
      quantity:   o.quantity,
      status:     o.status,
      invoiceRef: o.invoiceRef,
    })))
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: 'Internal server error' })
  }
})

router.post('/', async (req, res) => {
  try {
    const { storeId, quantity, invoiceRef, status } = req.body
    const order = await prisma.storeOrder.create({
      data:    { storeId, quantity, invoiceRef, status: status ?? 'pending' },
      include: { store: { select: { name: true, marketSlug: true } } },
    })
    // Update store stats. A delivered order lands straight on the shelf;
    // pending / in-transit orders are still inbound (inProcess).
    if (order.status === 'delivered') {
      await prisma.store.update({
        where: { id: storeId },
        data:  { onShelf: { increment: quantity } },
      })
    } else if (order.status === 'in_transit' || order.status === 'pending') {
      await prisma.store.update({
        where: { id: storeId },
        data:  { inProcess: { increment: quantity } },
      })
    }
    res.status(201).json({
      id:         order.id,
      storeId:    order.storeId,
      storeName:  order.store.name,
      region:     order.store.marketSlug,
      placedAt:   order.placedAt.toISOString(),
      quantity:   order.quantity,
      status:     order.status,
      invoiceRef: order.invoiceRef,
    })
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: 'Internal server error' })
  }
})

router.patch('/:id', async (req, res) => {
  try {
    const { status } = req.body

    // Snapshot current state before updating so we can detect the transition
    const existing = await prisma.storeOrder.findUnique({
      where:  { id: req.params['id'] },
      select: { status: true, quantity: true, storeId: true },
    })
    if (!existing) return res.status(404).json({ error: 'Order not found' })

    const order = await prisma.storeOrder.update({
      where:   { id: req.params['id'] },
      data:    { status },
      include: { store: { select: { name: true, marketSlug: true } } },
    })

    // When order is delivered: bottles arrive on shelf, clear from inProcess.
    // Read current inProcess first so we never go below 0.
    if (status === 'delivered' && existing.status !== 'delivered') {
      const store = await prisma.store.findUnique({
        where:  { id: existing.storeId },
        select: { inProcess: true },
      })
      await prisma.store.update({
        where: { id: existing.storeId },
        data: {
          inProcess: Math.max(0, (store?.inProcess ?? 0) - existing.quantity),
          onShelf:   { increment: existing.quantity },
        },
      })
    }

    res.json({
      id:         order.id,
      storeId:    order.storeId,
      storeName:  order.store.name,
      region:     order.store.marketSlug,
      placedAt:   order.placedAt.toISOString(),
      quantity:   order.quantity,
      status:     order.status,
      invoiceRef: order.invoiceRef,
    })
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: 'Internal server error' })
  }
})

router.delete('/:id', async (req, res) => {
  try {
    const existing = await prisma.storeOrder.findUnique({
      where:  { id: req.params['id'] },
      select: { status: true, quantity: true, storeId: true },
    })
    if (!existing) return res.status(404).json({ error: 'Order not found' })

    await prisma.storeOrder.delete({ where: { id: req.params['id'] } })

    // Reverse this order's stat impact so deleting it fully undoes the entry.
    // Pending / in-transit orders sit in inProcess; delivered orders landed on the shelf.
    if (existing.status === 'pending' || existing.status === 'in_transit') {
      const store = await prisma.store.findUnique({
        where:  { id: existing.storeId },
        select: { inProcess: true },
      })
      await prisma.store.update({
        where: { id: existing.storeId },
        data:  { inProcess: Math.max(0, (store?.inProcess ?? 0) - existing.quantity) },
      })
    } else if (existing.status === 'delivered') {
      const store = await prisma.store.findUnique({
        where:  { id: existing.storeId },
        select: { onShelf: true },
      })
      await prisma.store.update({
        where: { id: existing.storeId },
        data:  { onShelf: Math.max(0, (store?.onShelf ?? 0) - existing.quantity) },
      })
    }

    res.json({ ok: true })
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: 'Internal server error' })
  }
})

export default router
