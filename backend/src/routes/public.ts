import { Router } from 'express'
import { prisma } from '../prisma.js'
import { resolveDisplayName } from '../storeDisplayName.js'

// Public, read-only routes for external consumers (e.g. the WordPress store
// locator). Mounted BEFORE the Clerk auth gate in index.ts, so these are NOT
// behind a Clerk session — they are gated by a shared API key instead.

const router = Router()

// API-key gate for every public route. Fails closed: if LOCATOR_API_KEY is not
// configured, all requests are rejected.
router.use((req, res, next) => {
  const expected = process.env.LOCATOR_API_KEY
  const provided = req.header('x-api-key')
  if (!expected || provided !== expected) {
    return res.status(401).json({ error: 'Unauthorized' })
  }
  next()
})

// GET /api/public/locator — geocoded stores for the store-locator map.
// Only stores with coordinates are returned (they can't be plotted otherwise).
// Payload is intentionally trimmed to locator-safe fields — no inventory, rep,
// or alert data.
router.get('/locator', async (_req, res) => {
  try {
    const stores = await prisma.store.findMany({
      // Inactive stores must never reach the public locator — listing a shop
      // that no longer carries the product sends customers to a dead end.
      where:  { status: 'active', latitude: { not: null }, longitude: { not: null } },
      select: {
        id: true, name: true, displayName: true, address: true,
        latitude: true, longitude: true,
        chain:  { select: { name: true } },
        market: { select: { slug: true, name: true } },
      },
      orderBy: { name: 'asc' },
    })

    res.json({
      count:  stores.length,
      stores: stores.map(s => ({
        id:          s.id,
        displayName: resolveDisplayName({
          displayName: s.displayName,
          chainName:   s.chain?.name ?? null,
          name:        s.name,
          address:     s.address,
        }),
        chain:      s.chain?.name ?? null,
        address:    s.address ?? null,
        latitude:   s.latitude,
        longitude:  s.longitude,
        region:     s.market?.name ?? null,
        regionSlug: s.market?.slug ?? null,
      })),
    })
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: 'Internal server error' })
  }
})

export default router
