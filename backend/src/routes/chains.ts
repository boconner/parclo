import { Router } from 'express'
import { randomBytes } from 'node:crypto'
import { prisma } from '../prisma.js'
import { getRepContext } from '../repContext.js'

const router = Router()

/** URL-safe token for the chain-level QR code. Mirrors the per-store token. */
function newPortalToken(): string {
  return randomBytes(32).toString('base64url')
}

router.get('/', async (_req, res) => {
  try {
    const chains = await prisma.chain.findMany({
      include: { _count: { select: { stores: true } } },
      orderBy: { name: 'asc' },
    })
    res.json(chains.map(c => ({
      id:     c.id,
      name:   c.name,
      _count: { stores: c._count.stores },
    })))
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: 'Internal server error' })
  }
})

router.post('/', async (req, res) => {
  try {
    const ctx = await getRepContext(req)
    if (!ctx.isAdmin && !ctx.allRegions) return res.status(403).json({ error: 'Forbidden' })

    const { name } = req.body
    const id = name.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
    const chain = await prisma.chain.create({ data: { id, name } })
    res.status(201).json({ id: chain.id, name: chain.name, _count: { stores: 0 } })
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: 'Internal server error' })
  }
})

router.patch('/:id', async (req, res) => {
  try {
    const ctx = await getRepContext(req)
    if (!ctx.isAdmin && !ctx.allRegions) return res.status(403).json({ error: 'Forbidden' })

    const { name } = req.body
    const chain = await prisma.chain.update({
      where: { id: req.params['id'] },
      data:  { name },
    })
    res.json({ id: chain.id, name: chain.name })
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: 'Internal server error' })
  }
})

// ─── Chain portal token ──────────────────────────────────────────────────────
// Admin-only, same rules as the per-store token: issuing twice is a no-op, and
// rotating invalidates every chain QR card already printed.

router.get('/:id/portal-token', async (req, res) => {
  try {
    const ctx = await getRepContext(req)
    if (!ctx.isAdmin && !ctx.allRegions) return res.status(403).json({ error: 'Forbidden' })

    const chain = await prisma.chain.findUnique({
      where:  { id: req.params['id'] },
      select: { portalToken: true, portalTokenIssuedAt: true },
    })
    if (!chain) return res.status(404).json({ error: 'Not found' })

    res.json({
      token:    chain.portalToken,
      issuedAt: chain.portalTokenIssuedAt?.toISOString() ?? null,
    })
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: 'Internal server error' })
  }
})

router.post('/:id/portal-token', async (req, res) => {
  try {
    const ctx = await getRepContext(req)
    if (!ctx.isAdmin && !ctx.allRegions) return res.status(403).json({ error: 'Forbidden' })

    const id = req.params['id']
    const existing = await prisma.chain.findUnique({
      where:  { id },
      select: { portalToken: true, portalTokenIssuedAt: true },
    })
    if (!existing) return res.status(404).json({ error: 'Not found' })

    if (existing.portalToken && req.body?.rotate !== true) {
      return res.json({
        token:    existing.portalToken,
        issuedAt: existing.portalTokenIssuedAt?.toISOString() ?? null,
        rotated:  false,
      })
    }

    const chain = await prisma.chain.update({
      where:  { id },
      data:   { portalToken: newPortalToken(), portalTokenIssuedAt: new Date() },
      select: { portalToken: true, portalTokenIssuedAt: true },
    })

    res.json({
      token:    chain.portalToken,
      issuedAt: chain.portalTokenIssuedAt?.toISOString() ?? null,
      rotated:  Boolean(existing.portalToken),
    })
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: 'Internal server error' })
  }
})

router.delete('/:id', async (req, res) => {
  try {
    const ctx = await getRepContext(req)
    if (!ctx.isAdmin && !ctx.allRegions) return res.status(403).json({ error: 'Forbidden' })

    const id = req.params['id']
    const storeCount = await prisma.store.count({ where: { chainId: id } })
    if (storeCount > 0) {
      return res.status(409).json({ error: `Chain has ${storeCount} store(s). Reassign them before deleting.` })
    }
    await prisma.$transaction([
      prisma.contact.updateMany({ where: { chainId: id }, data: { chainId: null } }),
      // Chain-wide requests have no store to fall back on, so they are removed
      // rather than orphaned. Store-linked ones just lose the chain reference.
      prisma.restockRequest.deleteMany({ where: { chainId: id, storeId: null } }),
      prisma.restockRequest.updateMany({ where: { chainId: id }, data: { chainId: null } }),
      prisma.chain.delete({ where: { id } }),
    ])
    res.json({ ok: true })
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: 'Internal server error' })
  }
})

export default router
