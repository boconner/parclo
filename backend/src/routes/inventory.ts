import { Router } from 'express'
import { prisma } from '../prisma.js'
import { getRepContext } from '../repContext.js'
import { runStaleAlerts } from '../jobs/staleAlerts.js'

const router = Router()
const BOTTLES_PER_CASE = 6

// ── helpers ───────────────────────────────────────────────────────────────────

async function getSettings() {
  return prisma.inventorySettings.upsert({
    where:  { id: 'default' },
    create: { id: 'default' },
    update: {},
  })
}

interface MarketSnapshot {
  slug:                  string
  name:                  string
  casesDeployed:         number
  bottlesDeployed:       number
  bottlesOnShelf:        number
  bottlesDepleted:       number
  casesDepleted:         number
  sellThroughPct:        number
  depletionRateBottlesPerDay: number
  depletionRateWeeklyCases:   number
  warehouseNotApplicable: true
}

interface GlobalSnapshot {
  totalCasesMade:             number
  totalTransferred:           number  // warehouse → on-hand transfers
  casesInWarehouse:           number  // big warehouse balance
  onHandCases:                number  // on-hand balance (transferred − deployed)
  onHandBottles:              number
  casesDeployed:              number
  bottlesDeployed:            number
  bottlesOnShelf:             number
  bottlesDepleted:            number  // off shelf (deployed - on shelf)
  casesDepleted:              number  // off shelf in cases
  casesOnShelf:               number
  eventSalesBottles:          number  // auto-aggregated from completed events/tastings
  eventSalesCases:            number
  casesSold:                  number  // manually recorded distributor depletions
  bottlesSold:                number
  sellThroughPct:             number  // casesSold / casesDeployed
  depletionRateBottlesPerDay: number
  depletionRateWeeklyCases:   number
  warehouseWeeksLeft:         number | null
  reorderDate:                string | null
  recommendedOrderCases:      number | null
  reorderAlert:               boolean
  reorderLeadWeeks:           number
  bufferWeeks:                number
  markets:          MarketSnapshot[]
  chains:           { chainId: string; chainName: string; casesDeployed: number; casesOnShelf: number; casesOffShelf: number; offShelfPct: number; storeCount: number }[]
  storeDeliveries:  { storeId: string; storeName: string; chainId: string | null; casesDeployed: number; casesOnShelf: number; casesOffShelf: number; offShelfPct: number }[]
  repDeliveries:    { repId: string; repName: string; casesDeployed: number; casesOnShelf: number; casesOffShelf: number; offShelfPct: number }[]
}

// GET /api/inventory — full snapshot
router.get('/', async (_req, res) => {
  try {
    const [settings, productionRuns, warehouseTransfers, deployments, salesEntries, markets, chains, completedEvents] = await Promise.all([
      getSettings(),
      prisma.productionRun.findMany(),
      prisma.warehouseTransfer.findMany(),
      prisma.fieldDeployment.findMany({
        include: {
          market: { select: { slug: true, name: true } },
          chain:  { select: { id: true, name: true } },
          store:  { select: { id: true, name: true, chainId: true } },
          rep:    { select: { id: true, name: true } },
        },
      }),
      prisma.salesEntry.findMany(),
      prisma.market.findMany({
        include: { stores: { select: { id: true, onShelf: true, depletionRate: true, repId: true } } },
      }),
      prisma.chain.findMany({
        include: { stores: { select: { onShelf: true, chainId: true } } },
      }),
      prisma.event.findMany({
        where:  { status: 'completed', bottlesSold: { not: null } },
        select: { bottlesSold: true },
      }),
    ])

    const { reorderLeadWeeks, bufferWeeks } = settings

    // Global production totals
    const totalCasesMade = productionRuns.reduce((s, r) => s + r.quantity, 0)

    // Warehouse transfers (Warehouse → On-Hand)
    const totalTransferred = warehouseTransfers.reduce((s, t) => s + t.quantity, 0)
    const casesInWarehouse = Math.max(0, totalCasesMade - totalTransferred)

    // On-Hand balance (transferred − deployed)
    const casesDeployed  = deployments.reduce((s, d) => s + d.quantity, 0)
    const onHandCases    = Math.max(0, totalTransferred - casesDeployed)
    const onHandBottles  = onHandCases * BOTTLES_PER_CASE
    const bottlesDeployed = casesDeployed * BOTTLES_PER_CASE

    // Global on-shelf (sum across all stores)
    const bottlesOnShelf = markets.reduce(
      (s, m) => s + m.stores.reduce((ss, st) => ss + st.onShelf, 0), 0
    )
    const casesOnShelf = Math.round(bottlesOnShelf / BOTTLES_PER_CASE)

    // Off shelf = deployed − on shelf (not the same as sold)
    const bottlesOffShelf = bottlesDeployed > 0 ? Math.max(0, bottlesDeployed - bottlesOnShelf) : 0
    const casesOffShelf   = Math.round(bottlesOffShelf / BOTTLES_PER_CASE)

    // Event / tasting sales — auto-aggregated from completed events
    const eventSalesBottles = completedEvents.reduce((s, e) => s + (e.bottlesSold ?? 0), 0)
    const eventSalesCases   = Math.round(eventSalesBottles / BOTTLES_PER_CASE)

    // Depletions — manually recorded from distributor reports
    const casesSold      = salesEntries.reduce((s, e) => s + e.quantity, 0)
    const bottlesSold    = casesSold * BOTTLES_PER_CASE
    const sellThroughPct = casesDeployed > 0
      ? Math.min(100, Math.round((casesSold / casesDeployed) * 100))
      : 0

    // Global velocity from store depletionRates (bottles/day)
    const depletionRateBottlesPerDay = markets.reduce(
      (s, m) => s + m.stores.reduce((ss, st) => ss + (st.depletionRate ?? 0), 0), 0
    )
    const depletionRateWeeklyCases = Math.round(
      ((depletionRateBottlesPerDay * 7) / BOTTLES_PER_CASE) * 10
    ) / 10

    // Supply projection — use on-hand if available, fall back to warehouse so the signal
    // fires even before the first warehouse→on-hand transfer is recorded.
    const stockForProjection = onHandCases > 0 ? onHandCases : casesInWarehouse
    const warehouseWeeksLeft = depletionRateWeeklyCases > 0 && stockForProjection > 0
      ? Math.round(stockForProjection / depletionRateWeeklyCases)
      : null
    const reorderAlert = warehouseWeeksLeft !== null && warehouseWeeksLeft <= reorderLeadWeeks

    // Only set reorderDate when the window is still in the future (avoids returning past dates).
    const reorderDate = warehouseWeeksLeft !== null && warehouseWeeksLeft > reorderLeadWeeks
      ? new Date(Date.now() + (warehouseWeeksLeft - reorderLeadWeeks) * 7 * 86_400_000).toISOString().slice(0, 10)
      : null

    const recommendedOrderCases = depletionRateWeeklyCases > 0
      ? Math.ceil((reorderLeadWeeks + bufferWeeks) * depletionRateWeeklyCases)
      : null

    // Per-chain snapshots (only chains that have received a deployment)
    const deploymentsByChain = new Map<string, { name: string; quantity: number }>()
    for (const d of deployments) {
      if (d.chainId && d.chain) {
        const prev = deploymentsByChain.get(d.chainId) ?? { name: d.chain.name, quantity: 0 }
        deploymentsByChain.set(d.chainId, { name: prev.name, quantity: prev.quantity + d.quantity })
      }
    }

    const chainSnapshots = [...deploymentsByChain.entries()].map(([chainId, { name, quantity }]) => {
      const chainData     = chains.find(c => c.id === chainId)
      const bottlesOnShelf = chainData ? chainData.stores.reduce((s, st) => s + st.onShelf, 0) : 0
      const casesOnShelf   = Math.round(bottlesOnShelf / BOTTLES_PER_CASE)
      const casesOffShelf  = Math.max(0, quantity - casesOnShelf)
      const offShelfPct    = quantity > 0 ? Math.min(100, Math.round((casesOffShelf / quantity) * 100)) : 0
      return {
        chainId,
        chainName:     name,
        casesDeployed: quantity,
        casesOnShelf,
        casesOffShelf,
        offShelfPct,
        storeCount:    chainData?.stores.length ?? 0,
      }
    }).sort((a, b) => b.casesDeployed - a.casesDeployed)

    // Build a flat map of storeId → onShelf for store-level lookups
    const onShelfByStore = new Map<string, number>()
    for (const m of markets) {
      for (const st of m.stores) {
        onShelfByStore.set(st.id, st.onShelf)
      }
    }

    // Per-store snapshots (direct deliveries — typically independents)
    const deploymentsByStore = new Map<string, { name: string; chainId: string | null; quantity: number }>()
    for (const d of deployments) {
      if (d.storeId && d.store) {
        const prev = deploymentsByStore.get(d.storeId) ?? { name: d.store.name, chainId: d.store.chainId, quantity: 0 }
        deploymentsByStore.set(d.storeId, { ...prev, quantity: prev.quantity + d.quantity })
      }
    }

    const storeSnapshots = [...deploymentsByStore.entries()].map(([storeId, { name, chainId, quantity }]) => {
      const storeOnShelf  = onShelfByStore.get(storeId) ?? 0
      const casesOnShelf  = Math.round(storeOnShelf / BOTTLES_PER_CASE)
      const casesOffShelf = Math.max(0, quantity - casesOnShelf)
      const offShelfPct   = quantity > 0 ? Math.min(100, Math.round((casesOffShelf / quantity) * 100)) : 0
      return { storeId, storeName: name, chainId, casesDeployed: quantity, casesOnShelf, casesOffShelf, offShelfPct }
    }).sort((a, b) => b.casesDeployed - a.casesDeployed)

    // Build a map of repId → total onShelf across their stores
    const onShelfByRep = new Map<string, number>()
    for (const m of markets) {
      for (const st of m.stores) {
        if (st.repId) {
          onShelfByRep.set(st.repId, (onShelfByRep.get(st.repId) ?? 0) + st.onShelf)
        }
      }
    }

    // Per-rep snapshots (cases handed to a rep to carry/distribute)
    const deploymentsByRep = new Map<string, { name: string; quantity: number }>()
    for (const d of deployments) {
      if (d.repId && d.rep) {
        const prev = deploymentsByRep.get(d.repId) ?? { name: d.rep.name, quantity: 0 }
        deploymentsByRep.set(d.repId, { name: prev.name, quantity: prev.quantity + d.quantity })
      }
    }

    const repSnapshots = [...deploymentsByRep.entries()].map(([repId, { name, quantity }]) => {
      const repOnShelf  = onShelfByRep.get(repId) ?? 0
      const casesOnShelf  = Math.round(repOnShelf / BOTTLES_PER_CASE)
      const casesOffShelf = Math.max(0, quantity - casesOnShelf)
      const offShelfPct   = quantity > 0 ? Math.min(100, Math.round((casesOffShelf / quantity) * 100)) : 0
      return { repId, repName: name, casesDeployed: quantity, casesOnShelf, casesOffShelf, offShelfPct }
    }).sort((a, b) => b.casesDeployed - a.casesDeployed)

    // Per-market snapshots
    const deploymentsByMarket = new Map<string, number>()
    for (const d of deployments) {
      if (d.marketSlug) {
        deploymentsByMarket.set(d.marketSlug, (deploymentsByMarket.get(d.marketSlug) ?? 0) + d.quantity)
      }
    }

    const marketSnapshots: MarketSnapshot[] = markets.map(m => {
      const mCasesDeployed   = deploymentsByMarket.get(m.slug) ?? 0
      const mBottlesDeployed = mCasesDeployed * BOTTLES_PER_CASE
      const mBottlesOnShelf  = m.stores.reduce((s, st) => s + st.onShelf, 0)
      const mBottlesOffShelf = mBottlesDeployed > 0 ? Math.max(0, mBottlesDeployed - mBottlesOnShelf) : 0
      const mCasesOffShelf   = Math.round(mBottlesOffShelf / BOTTLES_PER_CASE)
      const mOffShelfPct     = mBottlesDeployed > 0
        ? Math.min(100, Math.round((mBottlesOffShelf / mBottlesDeployed) * 100))
        : 0
      const mDepletionRate   = m.stores.reduce((s, st) => s + (st.depletionRate ?? 0), 0)
      const mWeeklyCases     = Math.round(((mDepletionRate * 7) / BOTTLES_PER_CASE) * 10) / 10

      return {
        slug:                      m.slug,
        name:                      m.name,
        casesDeployed:             mCasesDeployed,
        bottlesDeployed:           mBottlesDeployed,
        bottlesOnShelf:            mBottlesOnShelf,
        bottlesDepleted:           mBottlesOffShelf,
        casesDepleted:             mCasesOffShelf,
        sellThroughPct:            mOffShelfPct,
        depletionRateBottlesPerDay: mDepletionRate,
        depletionRateWeeklyCases:  mWeeklyCases,
        warehouseNotApplicable:    true as const,
      }
    })

    const snapshot: GlobalSnapshot = {
      totalCasesMade, totalTransferred, casesInWarehouse, onHandCases, onHandBottles, casesDeployed,
      bottlesDeployed, bottlesOnShelf,
      bottlesDepleted: bottlesOffShelf,
      casesDepleted:   casesOffShelf,
      casesOnShelf, eventSalesBottles, eventSalesCases, casesSold, bottlesSold, sellThroughPct,
      depletionRateBottlesPerDay, depletionRateWeeklyCases,
      warehouseWeeksLeft, reorderDate, recommendedOrderCases, reorderAlert,
      reorderLeadWeeks, bufferWeeks,
      markets:          marketSnapshots,
      chains:           chainSnapshots,
      storeDeliveries:  storeSnapshots,
      repDeliveries:    repSnapshots,
    }

    res.json(snapshot)
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: 'Internal server error' })
  }
})

// DELETE /api/inventory/reset — wipe all inventory entries (admin only)
router.delete('/reset', async (req, res) => {
  try {
    const ctx = await getRepContext(req)
    if (!ctx.isAdmin && !ctx.allRegions) return res.status(403).json({ error: 'Forbidden' })

    await Promise.all([
      prisma.productionRun.deleteMany(),
      prisma.warehouseTransfer.deleteMany(),
      prisma.fieldDeployment.deleteMany(),
      prisma.salesEntry.deleteMany(),
    ])
    res.json({ ok: true })
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: 'Internal server error' })
  }
})

// POST /api/inventory/warehouse-transfers — admin or manager only
router.post('/warehouse-transfers', async (req, res) => {
  try {
    const ctx = await getRepContext(req)
    if (!ctx.isAdmin && !ctx.allRegions) return res.status(403).json({ error: 'Forbidden' })

    const { quantity, notes, transferredAt } = req.body as { quantity: number; notes?: string; transferredAt?: string }
    if (!quantity || quantity <= 0) return res.status(400).json({ error: 'quantity must be > 0' })

    const [{ _sum: { quantity: made } }, { _sum: { quantity: transferred } }] = await Promise.all([
      prisma.productionRun.aggregate({ _sum: { quantity: true } }),
      prisma.warehouseTransfer.aggregate({ _sum: { quantity: true } }),
    ])
    const available = (made ?? 0) - (transferred ?? 0)
    if (Math.floor(quantity) > available) {
      return res.status(400).json({ error: `Only ${available} cases available in warehouse` })
    }

    const t = await prisma.warehouseTransfer.create({
      data: { quantity: Math.floor(quantity), notes, transferredAt: transferredAt ? new Date(transferredAt) : undefined },
    })
    res.json(t)
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: 'Internal server error' })
  }
})

// PATCH /api/inventory/warehouse-transfers/:id
router.patch('/warehouse-transfers/:id', async (req, res) => {
  try {
    const ctx = await getRepContext(req)
    if (!ctx.isAdmin && !ctx.allRegions) return res.status(403).json({ error: 'Forbidden' })

    const { quantity, notes, transferredAt } = req.body as { quantity?: number; notes?: string; transferredAt?: string }
    const t = await prisma.warehouseTransfer.update({
      where: { id: req.params.id },
      data: {
        ...(quantity      !== undefined && { quantity: Math.max(1, Math.floor(quantity)) }),
        ...(notes         !== undefined && { notes }),
        ...(transferredAt !== undefined && { transferredAt: new Date(transferredAt) }),
      },
    })
    res.json(t)
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: 'Internal server error' })
  }
})

// DELETE /api/inventory/warehouse-transfers/:id
router.delete('/warehouse-transfers/:id', async (req, res) => {
  try {
    const ctx = await getRepContext(req)
    if (!ctx.isAdmin && !ctx.allRegions) return res.status(403).json({ error: 'Forbidden' })

    await prisma.warehouseTransfer.delete({ where: { id: req.params.id } })
    res.json({ ok: true })
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: 'Internal server error' })
  }
})

// GET /api/inventory/log — full audit log of production runs, deployments, and sales
router.get('/log', async (_req, res) => {
  try {
    const [productionRuns, warehouseTransfers, deployments, salesEntries] = await Promise.all([
      prisma.productionRun.findMany({ orderBy: { receivedAt: 'desc' } }),
      prisma.warehouseTransfer.findMany({ orderBy: { transferredAt: 'desc' } }),
      prisma.fieldDeployment.findMany({
        orderBy: { deployedAt: 'desc' },
        include: {
          market: { select: { name: true } },
          chain:  { select: { name: true } },
          store:  { select: { id: true, name: true } },
          rep:    { select: { id: true, name: true } },
        },
      }),
      prisma.salesEntry.findMany({ orderBy: { soldAt: 'desc' } }),
    ])
    res.json({
      warehouseTransfers: warehouseTransfers.map(t => ({
        id:           t.id,
        quantity:     t.quantity,
        notes:        t.notes,
        transferredAt: t.transferredAt,
        createdAt:    t.createdAt,
      })),
      productionRuns: productionRuns.map(r => ({
        id:         r.id,
        quantity:   r.quantity,
        notes:      r.notes,
        receivedAt: r.receivedAt,
        createdAt:  r.createdAt,
      })),
      deployments: deployments.map(d => ({
        id:          d.id,
        quantity:    d.quantity,
        marketSlug:  d.marketSlug,
        marketName:  d.market?.name ?? null,
        chainId:     d.chainId,
        chainName:   d.chain?.name ?? null,
        storeId:     d.storeId,
        storeName:   d.store?.name ?? null,
        repId:       d.repId,
        repName:     d.rep?.name ?? null,
        notes:       d.notes,
        deployedAt:  d.deployedAt,
        createdAt:   d.createdAt,
      })),
      salesEntries: salesEntries.map(e => ({
        id:        e.id,
        quantity:  e.quantity,
        notes:     e.notes,
        soldAt:    e.soldAt,
        createdAt: e.createdAt,
      })),
    })
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: 'Internal server error' })
  }
})

// POST /api/inventory/production-runs — admin or manager only
router.post('/production-runs', async (req, res) => {
  try {
    const ctx = await getRepContext(req)
    if (!ctx.isAdmin && !ctx.allRegions) return res.status(403).json({ error: 'Forbidden' })

    const { quantity, notes } = req.body as { quantity: number; notes?: string }
    if (!quantity || quantity <= 0) return res.status(400).json({ error: 'quantity must be > 0' })

    const run = await prisma.productionRun.create({
      data: { quantity: Math.floor(quantity), notes },
    })
    res.json(run)
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: 'Internal server error' })
  }
})

// PATCH /api/inventory/production-runs/:id — admin or manager only
router.patch('/production-runs/:id', async (req, res) => {
  try {
    const ctx = await getRepContext(req)
    if (!ctx.isAdmin && !ctx.allRegions) return res.status(403).json({ error: 'Forbidden' })

    const { quantity, notes, receivedAt } = req.body as { quantity?: number; notes?: string; receivedAt?: string }
    const run = await prisma.productionRun.update({
      where: { id: req.params.id },
      data: {
        ...(quantity   !== undefined && { quantity: Math.max(1, Math.floor(quantity)) }),
        ...(notes      !== undefined && { notes }),
        ...(receivedAt !== undefined && { receivedAt: new Date(receivedAt) }),
      },
    })
    res.json(run)
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: 'Internal server error' })
  }
})

// DELETE /api/inventory/production-runs/:id — admin or manager only
router.delete('/production-runs/:id', async (req, res) => {
  try {
    const ctx = await getRepContext(req)
    if (!ctx.isAdmin && !ctx.allRegions) return res.status(403).json({ error: 'Forbidden' })

    await prisma.productionRun.delete({ where: { id: req.params.id } })
    res.json({ ok: true })
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: 'Internal server error' })
  }
})

// POST /api/inventory/deployments — admin/manager for bulk; reps for store-targeted only
router.post('/deployments', async (req, res) => {
  try {
    const ctx = await getRepContext(req)
    const { quantity, marketSlug, chainId, storeId, repId, notes } = req.body as {
      quantity:    number
      marketSlug?: string
      chainId?:    string
      storeId?:    string
      repId?:      string
      notes?:      string
    }

    if (!ctx.isAdmin && !ctx.allRegions && !storeId) {
      return res.status(403).json({ error: 'Reps may only deploy to a specific store' })
    }
    if (!quantity || quantity <= 0) return res.status(400).json({ error: 'quantity must be > 0' })

    // Deploy draws from On-Hand (transferred − already deployed), not the warehouse.
    const [{ _sum: { quantity: transferred } }, { _sum: { quantity: deployed } }] = await Promise.all([
      prisma.warehouseTransfer.aggregate({ _sum: { quantity: true } }),
      prisma.fieldDeployment.aggregate({ _sum: { quantity: true } }),
    ])
    const onHand = (transferred ?? 0) - (deployed ?? 0)
    if (Math.floor(quantity) > onHand) {
      return res.status(400).json({ error: `Only ${onHand} cases available On-Hand` })
    }

    // Auto-derive chain/market from store if store is specified without them
    let resolvedChainId    = chainId    || null
    let resolvedMarketSlug = marketSlug || null
    if (storeId && !resolvedChainId) {
      const store = await prisma.store.findUnique({ where: { id: storeId }, select: { chainId: true, marketSlug: true } })
      if (store) {
        resolvedChainId    = store.chainId
        resolvedMarketSlug = resolvedMarketSlug ?? store.marketSlug
      }
    }
    // Auto-derive market from rep if rep is specified without market
    if (repId && !resolvedMarketSlug) {
      const rep = await prisma.rep.findUnique({ where: { id: repId }, select: { marketSlug: true } })
      if (rep) resolvedMarketSlug = rep.marketSlug
    }

    const deployment = await prisma.fieldDeployment.create({
      data: { quantity: Math.floor(quantity), marketSlug: resolvedMarketSlug, chainId: resolvedChainId, storeId: storeId || null, repId: repId || null, notes },
    })
    res.json(deployment)
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: 'Internal server error' })
  }
})

// POST /api/inventory/sales-entries — admin or manager only
router.post('/sales-entries', async (req, res) => {
  try {
    const ctx = await getRepContext(req)
    if (!ctx.isAdmin && !ctx.allRegions) return res.status(403).json({ error: 'Forbidden' })

    const { quantity, notes, soldAt } = req.body as { quantity: number; notes?: string; soldAt?: string }
    if (!quantity || quantity <= 0) return res.status(400).json({ error: 'quantity must be > 0' })

    const entry = await prisma.salesEntry.create({
      data: {
        quantity: Math.floor(quantity),
        notes,
        soldAt: soldAt ? new Date(soldAt) : undefined,
      },
    })
    res.json(entry)
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: 'Internal server error' })
  }
})

// PATCH /api/inventory/sales-entries/:id — admin or manager only
router.patch('/sales-entries/:id', async (req, res) => {
  try {
    const ctx = await getRepContext(req)
    if (!ctx.isAdmin && !ctx.allRegions) return res.status(403).json({ error: 'Forbidden' })

    const { quantity, notes, soldAt } = req.body as { quantity?: number; notes?: string; soldAt?: string }
    const entry = await prisma.salesEntry.update({
      where: { id: req.params.id },
      data: {
        ...(quantity !== undefined && { quantity: Math.max(1, Math.floor(quantity)) }),
        ...(notes    !== undefined && { notes }),
        ...(soldAt   !== undefined && { soldAt: new Date(soldAt) }),
      },
    })
    res.json(entry)
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: 'Internal server error' })
  }
})

// DELETE /api/inventory/sales-entries/:id — admin or manager only
router.delete('/sales-entries/:id', async (req, res) => {
  try {
    const ctx = await getRepContext(req)
    if (!ctx.isAdmin && !ctx.allRegions) return res.status(403).json({ error: 'Forbidden' })

    await prisma.salesEntry.delete({ where: { id: req.params.id } })
    res.json({ ok: true })
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: 'Internal server error' })
  }
})

// PATCH /api/inventory/deployments/:id — admin or manager only
router.patch('/deployments/:id', async (req, res) => {
  try {
    const ctx = await getRepContext(req)
    if (!ctx.isAdmin && !ctx.allRegions) return res.status(403).json({ error: 'Forbidden' })

    const { quantity, notes, deployedAt, marketSlug, chainId } = req.body as {
      quantity?: number; notes?: string; deployedAt?: string; marketSlug?: string; chainId?: string
    }
    const dep = await prisma.fieldDeployment.update({
      where: { id: req.params.id },
      data: {
        ...(quantity   !== undefined && { quantity: Math.max(1, Math.floor(quantity)) }),
        ...(notes      !== undefined && { notes }),
        ...(deployedAt !== undefined && { deployedAt: new Date(deployedAt) }),
        ...(marketSlug !== undefined && { marketSlug: marketSlug || null }),
        ...(chainId    !== undefined && { chainId: chainId || null }),
      },
    })
    res.json(dep)
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: 'Internal server error' })
  }
})

// DELETE /api/inventory/deployments/:id — admin or manager only
router.delete('/deployments/:id', async (req, res) => {
  try {
    const ctx = await getRepContext(req)
    if (!ctx.isAdmin && !ctx.allRegions) return res.status(403).json({ error: 'Forbidden' })

    await prisma.fieldDeployment.delete({ where: { id: req.params.id } })
    res.json({ ok: true })
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: 'Internal server error' })
  }
})

// PATCH /api/inventory/settings — admin or manager only
router.patch('/settings', async (req, res) => {
  try {
    const ctx = await getRepContext(req)
    if (!ctx.isAdmin && !ctx.allRegions) return res.status(403).json({ error: 'Forbidden' })

    const { reorderLeadWeeks, bufferWeeks } = req.body as {
      reorderLeadWeeks?: number
      bufferWeeks?:      number
    }

    const current = await getSettings()
    const updated  = await prisma.inventorySettings.update({
      where: { id: 'default' },
      data:  {
        reorderLeadWeeks: reorderLeadWeeks !== undefined ? Math.max(1, reorderLeadWeeks) : current.reorderLeadWeeks,
        bufferWeeks:      bufferWeeks      !== undefined ? Math.max(1, bufferWeeks)      : current.bufferWeeks,
      },
    })
    res.json({ reorderLeadWeeks: updated.reorderLeadWeeks, bufferWeeks: updated.bufferWeeks })
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: 'Internal server error' })
  }
})

// Manually trigger the stale-store scan (no visit inside the threshold, or a
// synced on-shelf count that hasn't moved). Normally runs nightly on cron.
// Pass { dryRun: true } to preview without writing. Admin / all-regions only.
router.post('/stale-alerts', async (req, res) => {
  try {
    const ctx = await getRepContext(req)
    if (!ctx.isAdmin && !ctx.allRegions) return res.status(403).json({ error: 'Forbidden' })

    const dryRun = req.body?.dryRun === true
    const report = await runStaleAlerts({ dryRun })
    res.json(report)
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: 'Internal server error' })
  }
})

export default router
