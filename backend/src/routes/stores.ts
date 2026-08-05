import { Router } from 'express'
import { randomBytes } from 'node:crypto'
import { prisma } from '../prisma.js'
import { getRepContext, regionFilter } from '../repContext.js'
import { syncSingleProductLevel, recomputeStoreAggregates } from '../storeProducts.js'

const router = Router()

/** URL-safe token for the in-store QR code. 32 bytes ≈ 43 chars of base64url. */
function newPortalToken(): string {
  return randomBytes(32).toString('base64url')
}

const storeSelect = {
  market:  { select: { name: true } },
  chain:   { select: { name: true } },
  rep:     { select: { name: true } },
  alerts:  { where: { status: 'OPEN' as const }, select: { type: true }, orderBy: { triggeredAt: 'desc' as const }, take: 1 },
}

function formatStore(s: any) {
  return {
    id:            s.id,
    name:          s.name,
    displayName:   s.displayName ?? null,
    address:       s.address ?? null,
    region:        s.marketSlug,
    regionName:    s.market.name,
    chainId:       s.chainId ?? null,
    chainName:     s.chain?.name ?? null,
    storeNumber:   s.storeNumber ?? null,
    repId:         s.repId ?? null,
    rep:           s.rep?.name ?? null,
    latitude:      s.latitude,
    longitude:     s.longitude,
    onShelf:       s.onShelf,
    inProcess:     s.inProcess,
    daysOfSupply:  s.daysOfSupply,
    depletionRate: s.depletionRate,
    lastVisit:     s.lastVisit?.toISOString() ?? null,
    status:        s.status ?? 'active',
    deactivatedAt: s.deactivatedAt?.toISOString() ?? null,
    hasAlert:      s.alerts.length > 0,
    alertType:     s.alerts[0]?.type ?? null,
  }
}

router.get('/', async (req, res) => {
  try {
    const { region, chain, rep, includeInactive } = req.query as Record<string, string>
    const ctx = await getRepContext(req)
    const rf  = regionFilter(ctx)

    // Inactive stores are hidden unless explicitly asked for — they stay on
    // record for history, but shouldn't clutter day-to-day lists.
    const showInactive = includeInactive === 'true'

    const stores = await prisma.store.findMany({
      where: {
        ...(showInactive ? {} : { status: 'active' }),
        ...rf,
        ...(region ? { marketSlug: region } : {}),
        ...(chain  ? { chainId: chain }     : {}),
        ...(rep    ? { repId: rep }          : {}),
      },
      include: storeSelect,
      orderBy: { name: 'asc' },
    })
    res.json(stores.map(formatStore))
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: 'Internal server error' })
  }
})

router.get('/:id', async (req, res) => {
  try {
    const store = await prisma.store.findUnique({
      where:   { id: req.params['id'] },
      include: {
        ...storeSelect,
        visits: {
          include: { rep: { select: { name: true } }, contact: { select: { id: true, name: true } } },
          orderBy: { createdAt: 'desc' },
          take:    20,
        },
        orders:  { orderBy: { placedAt: 'desc' }, take: 20 },
        contacts: {
          include: { contact: { include: { chain: { select: { name: true } } } } },
        },
        stockSyncs: { orderBy: { syncedAt: 'desc' }, take: 30 },
        products: {
          include: { product: { select: { name: true, sku: true, sizeLabel: true, status: true, sortOrder: true } } },
        },
      },
    })
    if (!store) return res.status(404).json({ error: 'Store not found' })

    const stockSyncs = store.stockSyncs.map(s => ({
      id:              s.id,
      syncedAt:        s.syncedAt.toISOString(),
      onShelf:         s.onShelf,
      previousOnShelf: s.previousOnShelf,
      stockStatus:     s.stockStatus,
      source:          s.source,
    }))
    const lastStockSync = stockSyncs[0] ?? null

    res.json({
      ...formatStore(store),
      lastStockSync,
      stockSyncs,
      products: store.products
        .filter(sp => sp.product.status === 'active')
        .sort((a, b) => a.product.sortOrder - b.product.sortOrder || a.product.name.localeCompare(b.product.name))
        .map(sp => ({
          productId: sp.productId,
          name:      sp.product.name,
          sku:       sp.product.sku ?? null,
          sizeLabel: sp.product.sizeLabel ?? null,
          onShelf:   sp.onShelf,
          inProcess: sp.inProcess,
        })),
      visits:   store.visits.map(v => ({
        id:              v.id,
        date:            (v.visitedAt ?? v.createdAt).toISOString(),
        rep:             v.rep.name,
        onShelf:         v.onShelf,
        action:          v.action,
        logType:         v.logType         ?? null,
        notes:           v.notes,
        takeaways:       v.takeaways       ?? null,
        accomplishments: v.accomplishments ?? null,
        hoursWorked:     v.hoursWorked     ?? null,
        bottlesSold:     v.bottlesSold     ?? null,
        contactId:       v.contactId,
        contactName:     v.contact?.name ?? null,
      })),
      orders:   store.orders.map(o => ({
        id:         o.id,
        placedAt:   o.placedAt.toISOString(),
        quantity:   o.quantity,
        status:     o.status,
        invoiceRef: o.invoiceRef,
      })),
      contacts: store.contacts.map(cs => ({
        id:        cs.contact.id,
        name:      cs.contact.name,
        role:      cs.contact.role,
        phone:     cs.contact.phone,
        email:     cs.contact.email,
        chainId:   cs.contact.chainId,
        chainName: cs.contact.chain?.name ?? null,
        notes:     cs.contact.notes,
      })),
    })
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: 'Internal server error' })
  }
})

router.post('/', async (req, res) => {
  try {
    const { name, displayName, address, regionSlug, chainId, storeNumber, repId, latitude, longitude } = req.body
    const store = await prisma.store.create({
      data:    { name, displayName: displayName || null, address, marketSlug: regionSlug, chainId, storeNumber: storeNumber || null, repId, latitude, longitude, area: '' },
      include: storeSelect,
    })
    res.status(201).json(formatStore(store))
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: 'Internal server error' })
  }
})

router.delete('/:id', async (req, res) => {
  try {
    // Deleting a store erases its entire history — admin only. Reps should use
    // "mark inactive" instead, which keeps the record.
    const ctx = await getRepContext(req)
    if (!ctx.isAdmin && !ctx.allRegions) return res.status(403).json({ error: 'Forbidden' })

    const id = req.params['id']
    await prisma.$transaction([
      prisma.eventRep.deleteMany({ where: { event: { storeId: id } } }),
      prisma.storeVisit.deleteMany({ where: { storeId: id } }),
      prisma.event.deleteMany({ where: { storeId: id } }),
      prisma.storeOrder.deleteMany({ where: { storeId: id } }),
      prisma.alert.deleteMany({ where: { storeId: id } }),
      prisma.contactStore.deleteMany({ where: { storeId: id } }),
      prisma.restockRequest.deleteMany({ where: { storeId: id } }),
      // Sync history has a required FK — without this, deleting any store a
      // retail stock sync has touched violates the constraint and 500s.
      prisma.stockSync.deleteMany({ where: { storeId: id } }),
      // Deployments keep their quantity in chain-wide totals; only the
      // per-store attribution goes away with the store.
      prisma.fieldDeployment.updateMany({ where: { storeId: id }, data: { storeId: null } }),
      prisma.store.delete({ where: { id } }),
    ])
    res.json({ ok: true })
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: 'Internal server error' })
  }
})

router.patch('/:id', async (req, res) => {
  try {
    const { name, displayName, address, regionSlug, chainId, storeNumber, repId, latitude, longitude, onShelf, inProcess, daysOfSupply, depletionRate } = req.body
    const store = await prisma.store.update({
      where:   { id: req.params['id'] },
      data:    { name, displayName, address, marketSlug: regionSlug, chainId, storeNumber: storeNumber === undefined ? undefined : (storeNumber || null), repId, latitude, longitude, onShelf, inProcess, daysOfSupply, depletionRate },
      include: storeSelect,
    })
    if (onShelf !== undefined || inProcess !== undefined) {
      await syncSingleProductLevel(store.id, {
        ...(onShelf   !== undefined ? { onShelf:   Number(onShelf) }   : {}),
        ...(inProcess !== undefined ? { inProcess: Number(inProcess) } : {}),
      })
    }
    res.json(formatStore(store))
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: 'Internal server error' })
  }
})

// PUT /api/stores/:id/products/:productId — set one product's shelf levels at
// this store. The store's aggregate columns are recomputed from all rows, so
// dashboards and lists stay consistent however many products exist.
router.put('/:id/products/:productId', async (req, res) => {
  try {
    const storeId   = req.params['id']!
    const productId = req.params['productId']!
    const { onShelf, inProcess } = req.body ?? {}
    if (onShelf === undefined && inProcess === undefined) {
      return res.status(400).json({ error: 'Provide onShelf and/or inProcess' })
    }

    const [store, product] = await Promise.all([
      prisma.store.findUnique({ where: { id: storeId }, select: { id: true } }),
      prisma.product.findUnique({ where: { id: productId }, select: { id: true } }),
    ])
    if (!store || !product) return res.status(404).json({ error: 'Not found' })

    const level = await prisma.storeProduct.upsert({
      where:  { storeId_productId: { storeId, productId } },
      create: {
        storeId, productId,
        onShelf:   Math.max(0, Number(onShelf   ?? 0)),
        inProcess: Math.max(0, Number(inProcess ?? 0)),
      },
      update: {
        ...(onShelf   !== undefined ? { onShelf:   Math.max(0, Number(onShelf)) }   : {}),
        ...(inProcess !== undefined ? { inProcess: Math.max(0, Number(inProcess)) } : {}),
      },
    })
    await recomputeStoreAggregates(storeId)

    res.json({ productId: level.productId, onShelf: level.onShelf, inProcess: level.inProcess })
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: 'Internal server error' })
  }
})

// PATCH /api/stores/:id/status — deactivate or reactivate a store.
//
// Deactivating is the alternative to deleting: the store and all its history
// (visits, orders, deployments, sync log) stay on record, but it drops out of
// day-to-day lists, dashboard metrics, the public locator, the stock sync, and
// the alert scan. Admin-only, since it changes what the whole team sees.
router.patch('/:id/status', async (req, res) => {
  try {
    const ctx = await getRepContext(req)
    if (!ctx.isAdmin && !ctx.allRegions) return res.status(403).json({ error: 'Forbidden' })

    const { status } = req.body ?? {}
    if (status !== 'active' && status !== 'inactive') {
      return res.status(400).json({ error: 'Status must be active or inactive' })
    }

    const id = req.params['id']!
    const existing = await prisma.store.findUnique({ where: { id }, select: { id: true } })
    if (!existing) return res.status(404).json({ error: 'Not found' })

    const store = await prisma.store.update({
      where: { id },
      data: {
        status,
        deactivatedAt: status === 'inactive' ? new Date() : null,
      },
      include: storeSelect,
    })

    // Open alerts on a store nobody services can never be actioned or cleared,
    // so deactivating closes them out rather than leaving them stranded.
    if (status === 'inactive') {
      await prisma.alert.updateMany({
        where: { storeId: id, status: 'OPEN' },
        data:  { status: 'RESOLVED', resolvedAt: new Date() },
      })
    }

    res.json(formatStore(store))
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: 'Internal server error' })
  }
})

// ─── Customer portal token ───────────────────────────────────────────────────
// The token is the sole credential for the public portal, so issuing/rotating it
// is admin-only. Rotating invalidates every QR code already printed for a store.

// GET /api/stores/:id/portal-token — current token, if one has been issued.
router.get('/:id/portal-token', async (req, res) => {
  try {
    const ctx = await getRepContext(req)
    if (!ctx.isAdmin && !ctx.allRegions) return res.status(403).json({ error: 'Forbidden' })

    const store = await prisma.store.findUnique({
      where:  { id: req.params['id'] },
      select: { portalToken: true, portalTokenIssuedAt: true },
    })
    if (!store) return res.status(404).json({ error: 'Not found' })

    res.json({
      token:    store.portalToken,
      issuedAt: store.portalTokenIssuedAt?.toISOString() ?? null,
    })
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: 'Internal server error' })
  }
})

// POST /api/stores/:id/portal-token — issue a token, or rotate an existing one.
router.post('/:id/portal-token', async (req, res) => {
  try {
    const ctx = await getRepContext(req)
    if (!ctx.isAdmin && !ctx.allRegions) return res.status(403).json({ error: 'Forbidden' })

    const id = req.params['id']!
    const existing = await prisma.store.findUnique({
      where:  { id },
      select: { portalToken: true },
    })
    if (!existing) return res.status(404).json({ error: 'Not found' })

    // Without an explicit rotate, issuing twice is a no-op so a double-click
    // cannot silently invalidate codes already printed and placed in a store.
    if (existing.portalToken && req.body?.rotate !== true) {
      const store = await prisma.store.findUnique({
        where:  { id },
        select: { portalToken: true, portalTokenIssuedAt: true },
      })
      return res.json({
        token:    store!.portalToken,
        issuedAt: store!.portalTokenIssuedAt?.toISOString() ?? null,
        rotated:  false,
      })
    }

    const store = await prisma.store.update({
      where:  { id },
      data:   { portalToken: newPortalToken(), portalTokenIssuedAt: new Date() },
      select: { portalToken: true, portalTokenIssuedAt: true },
    })

    res.json({
      token:    store.portalToken,
      issuedAt: store.portalTokenIssuedAt?.toISOString() ?? null,
      rotated:  Boolean(existing.portalToken),
    })
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: 'Internal server error' })
  }
})

export default router
