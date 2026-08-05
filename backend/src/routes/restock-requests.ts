import { Router } from 'express'
import { prisma } from '../prisma.js'
import { getRepContext, regionFilter } from '../repContext.js'
import { resolveDisplayName } from '../storeDisplayName.js'

// Internal queue for requests submitted through the customer portal.
// Scoped the same way as every other rep-facing list: admins and all-regions
// reps see everything, other reps see only their own markets.

const router = Router()

const VALID_STATUSES = ['new_request', 'acknowledged', 'resolved'] as const

function serialize(r: {
  id: string
  source: string
  storeId: string | null
  chainId: string | null
  stockLevel: string
  bottlesLeft: number | null
  casesRequested: number | null
  submitterEmail: string | null
  materials: string
  wantsRepVisit: boolean
  note: string | null
  submitterName: string | null
  submitterRole: string | null
  status: string
  createdAt: Date
  // Null for a chain-wide request that named no location.
  store: {
    name: string; displayName: string | null; address: string | null
    marketSlug: string
    chainId: string | null
    chain: { name: string } | null
    rep:   { id: string; name: string } | null
  } | null
  chain: { id: string; name: string } | null
}) {
  let materials: string[] = []
  try {
    const parsed = JSON.parse(r.materials)
    if (Array.isArray(parsed)) materials = parsed.filter((m): m is string => typeof m === 'string')
  } catch {
    // Corrupt JSON should degrade to "no materials", never break the queue.
  }

  // Chain name comes from the store when there is one, else from the chain the
  // request was filed against directly.
  const chainName = r.store?.chain?.name ?? r.chain?.name ?? null

  return {
    id:            r.id,
    source:        r.source,
    storeId:       r.storeId,
    storeName:     r.store
      ? resolveDisplayName({
          displayName: r.store.displayName,
          chainName,
          name:        r.store.name,
          address:     r.store.address,
        })
      : null,
    storeAddress:  r.store?.address ?? null,
    chainId:       r.store?.chainId ?? r.chainId,
    chainName,
    region:        r.store?.marketSlug ?? null,
    repId:         r.store?.rep?.id ?? null,
    repName:       r.store?.rep?.name ?? null,
    stockLevel:     r.stockLevel,
    bottlesLeft:    r.bottlesLeft,
    casesRequested: r.casesRequested,
    submitterEmail: r.submitterEmail,
    materials,
    wantsRepVisit: r.wantsRepVisit,
    note:          r.note,
    submitterName: r.submitterName,
    submitterRole: r.submitterRole,
    status:        r.status,
    createdAt:     r.createdAt.toISOString(),
  }
}

const storeInclude = {
  store: {
    select: {
      name: true, displayName: true, address: true, marketSlug: true,
      chainId: true,
      chain: { select: { name: true } },
      rep:   { select: { id: true, name: true } },
    },
  },
  chain: { select: { id: true, name: true } },
} as const

// GET /api/restock-requests?status=&storeId=&chainId=
router.get('/', async (req, res) => {
  try {
    const { status, storeId, chainId } = req.query as Record<string, string | undefined>
    const ctx = await getRepContext(req)
    const rf  = regionFilter(ctx)

    // The chain filter uses the denormalized RestockRequest.chainId rather than
    // the store relation: a chain-wide request has no store, and filtering
    // through `store` would silently hide exactly the rows the user asked for.
    //
    // Region scoping stays on the store relation, which means a region-scoped
    // rep does not see chain-wide requests — those have no location and so no
    // region. They surface for admins and all-regions reps only.
    const requests = await prisma.restockRequest.findMany({
      where: {
        ...(Object.keys(rf).length > 0 ? { store: rf } : {}),
        ...(chainId ? { chainId } : {}),
        ...(storeId ? { storeId } : {}),
        ...(status && VALID_STATUSES.includes(status as never)
          ? { status: status as never }
          : {}),
      },
      include:  storeInclude,
      orderBy:  { createdAt: 'desc' },
      take:     200,
    })

    res.json(requests.map(serialize))
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: 'Internal server error' })
  }
})

// PATCH /api/restock-requests/:id — advance the workflow status.
router.patch('/:id', async (req, res) => {
  try {
    const { status } = req.body ?? {}
    if (!VALID_STATUSES.includes(status)) {
      return res.status(400).json({ error: 'Invalid status' })
    }

    const id  = req.params['id']!
    const ctx = await getRepContext(req)
    const rf  = regionFilter(ctx)

    // Confirm the request is inside the caller's regions before mutating it.
    const existing = await prisma.restockRequest.findFirst({
      where:  { id, ...(Object.keys(rf).length > 0 ? { store: rf } : {}) },
      select: { id: true, alertId: true },
    })
    if (!existing) return res.status(404).json({ error: 'Not found' })

    const updated = await prisma.restockRequest.update({
      where:   { id },
      data:    { status },
      include: storeInclude,
    })

    // Resolving the request closes the alert it raised, so the two views agree.
    if (status === 'resolved' && existing.alertId) {
      await prisma.alert.updateMany({
        where: { id: existing.alertId, status: 'OPEN' },
        data:  { status: 'RESOLVED', resolvedAt: new Date() },
      })
    }

    res.json(serialize(updated))
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: 'Internal server error' })
  }
})

// DELETE /api/restock-requests/:id — remove a request entirely.
//
// These rows come from an unauthenticated public form, so spam, duplicates and
// mistaken submissions are expected and need to be removable rather than just
// resolved. Scoped the same way as PATCH: you can only delete what you can see.
router.delete('/:id', async (req, res) => {
  try {
    const id  = req.params['id']!
    const ctx = await getRepContext(req)
    const rf  = regionFilter(ctx)

    const existing = await prisma.restockRequest.findFirst({
      where:  { id, ...(Object.keys(rf).length > 0 ? { store: rf } : {}) },
      select: { id: true, alertId: true },
    })
    if (!existing) return res.status(404).json({ error: 'Not found' })

    // The alert this request raised has no meaning once the request is gone —
    // leaving it would strand an alert pointing at a submission nobody can open.
    // Deleted rather than resolved: resolving implies someone acted on it.
    await prisma.$transaction([
      ...(existing.alertId
        ? [prisma.alert.deleteMany({ where: { id: existing.alertId } })]
        : []),
      prisma.restockRequest.delete({ where: { id } }),
    ])

    res.json({ ok: true })
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: 'Internal server error' })
  }
})

export default router
