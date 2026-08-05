import { Router } from 'express'
import { prisma } from '../prisma.js'
import { resolveDisplayName } from '../storeDisplayName.js'
import { rateLimit, clientIp } from '../rateLimit.js'
import { sendRestockEmail, sendRequesterCopy, looksLikeEmail, MATERIAL_LABELS } from '../restockNotify.js'

// Customer-facing store portal — the ONLY unauthenticated write path in the API.
//
// Mounted before the Clerk gate in index.ts. Retail staff reach it by scanning a
// QR code left in the store, which encodes the store's `portalToken`. That token
// is the entire credential, so every route here assumes hostile input:
//   - the token is looked up on each request and can be rotated to revoke codes
//   - responses leak nothing beyond the store's own public-facing identity
//   - writes are rate limited per token and per IP, with a honeypot field
//   - all free text is length-capped before it is stored or emailed
//
// Deliberately NOT reusing the shared x-api-key gate in public.ts: that key is
// for server-to-server callers (the WordPress locator) and would be visible to
// anyone opening devtools on the portal page.

const router = Router()

// `almost_out` stays accepted for backwards compatibility, but the current form
// only offers the three faces: well_stocked / getting_low / out_of_stock.
const VALID_STOCK_LEVELS = ['well_stocked', 'getting_low', 'almost_out', 'out_of_stock'] as const
type StockLevelValue = typeof VALID_STOCK_LEVELS[number]

/** Levels urgent enough to raise an alert. A healthy shelf raises nothing. */
function raisesAlert(level: StockLevelValue): boolean {
  return level === 'almost_out' || level === 'out_of_stock'
}
const VALID_MATERIALS    = Object.keys(MATERIAL_LABELS)

const MAX_NOTE  = 1000
const MAX_NAME  = 120
const MAX_ROLE  = 120
const MAX_EMAIL = 254

/** Trims and caps a free-text field, returning null when empty. */
function text(value: unknown, max: number): string | null {
  if (typeof value !== 'string') return null
  const trimmed = value.trim().slice(0, max)
  return trimmed.length > 0 ? trimmed : null
}

/**
 * Reads the :token route param as a plain string. Express types params as
 * `string | string[]`, and a repeated param would otherwise arrive as an array.
 */
function tokenParam(req: { params: Record<string, string | string[] | undefined> }): string {
  const raw = req.params['token']
  return typeof raw === 'string' ? raw : ''
}

/** Token format check, so malformed tokens never reach the database. */
function isTokenShaped(token: string): boolean {
  return /^[A-Za-z0-9_-]{16,64}$/.test(token)
}

async function findStoreByToken(token: string) {
  // findFirst rather than findUnique so the active check can be part of the
  // lookup: a deactivated store's QR code stops working, and the scanner sees
  // the same "code isn't active" screen as a rotated token.
  return prisma.store.findFirst({
    where:  { portalToken: token, status: 'active' },
    select: {
      id: true, name: true, displayName: true, address: true, chainId: true,
      chain:  { select: { name: true } },
      market: { select: { name: true } },
      rep:    { select: { name: true, email: true } },
    },
  })
}

async function findChainByToken(token: string) {
  return prisma.chain.findUnique({
    where:  { portalToken: token },
    select: { id: true, name: true },
  })
}

/**
 * Shape of a validated portal submission, shared by the store and chain forms.
 * Returns an error string instead of throwing so callers control the response.
 */
function parseSubmission(body: Record<string, unknown> | undefined):
  | { ok: false; error: string }
  | {
      ok: true
      stockLevel: StockLevelValue
      bottlesLeft: number | null
      casesRequested: number | null
      materials: string[]
      wantsRepVisit: boolean
      note: string | null
      submitterName: string | null
      submitterEmail: string | null
      submitterRole: string | null
    } {
  const stockLevel = body?.['stockLevel']
  if (typeof stockLevel !== 'string' || !VALID_STOCK_LEVELS.includes(stockLevel as never)) {
    return { ok: false, error: 'Please tell us how your stock is doing.' }
  }

  /** Optional count; clamped rather than rejected so a fat-fingered entry never
   *  blocks a legitimate submission. */
  function clampCount(raw: unknown, max: number): number | null {
    if (raw == null || raw === '') return null
    const n = Number(raw)
    if (!Number.isFinite(n)) return null
    return Math.max(0, Math.min(max, Math.floor(n)))
  }

  const bottlesLeft    = clampCount(body?.['bottlesLeft'], 999)
  const casesRequested = clampCount(body?.['casesRequested'], 999)

  const rawMaterials = body?.['materials']
  const materials: string[] = Array.isArray(rawMaterials)
    ? Array.from(new Set(rawMaterials.filter((m: unknown): m is string =>
        typeof m === 'string' && VALID_MATERIALS.includes(m))))
    : []

  // A malformed address is dropped rather than rejected — it only drives the
  // courtesy copy, and losing the whole submission over a typo would be worse.
  const rawEmail = text(body?.['submitterEmail'], MAX_EMAIL)
  const submitterEmail = rawEmail && looksLikeEmail(rawEmail) ? rawEmail : null

  return {
    ok:            true,
    stockLevel:    stockLevel as StockLevelValue,
    bottlesLeft,
    casesRequested,
    materials,
    wantsRepVisit: body?.['wantsRepVisit'] === true,
    note:          text(body?.['note'], MAX_NOTE),
    submitterName: text(body?.['submitterName'], MAX_NAME),
    submitterEmail,
    submitterRole: text(body?.['submitterRole'], MAX_ROLE),
  }
}

/** Honeypot check — a real browser leaves this hidden field empty. */
function isBot(body: Record<string, unknown> | undefined): boolean {
  const v = body?.['website']
  return typeof v === 'string' && v.trim() !== ''
}

// Read limiter is generous — a store may reload the form a few times.
const readLimiter = rateLimit({
  name:     'portal-read',
  windowMs: 60 * 1000,
  max:      30,
  keyFn:    clientIp,
})

// Write limiters: one per store token (stops a single QR being spammed) and one
// per IP (stops one actor hitting many stores). Both must pass.
const writeTokenLimiter = rateLimit({
  name:     'portal-write-token',
  windowMs: 60 * 60 * 1000,
  max:      5,
  keyFn:    req => tokenParam(req) || 'unknown',
})

// A chain code is held by an HQ buyer who may legitimately file for several
// locations in one sitting, so it gets more headroom than a single store's code.
const writeChainTokenLimiter = rateLimit({
  name:     'portal-write-chain-token',
  windowMs: 60 * 60 * 1000,
  max:      15,
  keyFn:    req => tokenParam(req) || 'unknown',
})

// Sits above both token limiters to stop one actor hitting many codes. Set
// comfortably above the chain limit (15) so an HQ buyer working through several
// locations hits the meaningful per-code limit rather than this backstop — and
// because a chain's staff may share one corporate IP.
const writeIpLimiter = rateLimit({
  name:     'portal-write-ip',
  windowMs: 60 * 60 * 1000,
  max:      40,
  keyFn:    clientIp,
})

// GET /api/portal/s/:token — store identity for the form header.
// Returns only what the store already knows about itself: no inventory, no rep
// contact details, no internal IDs.
router.get('/s/:token', readLimiter, async (req, res) => {
  try {
    const token = tokenParam(req)
    if (!isTokenShaped(token)) return res.status(404).json({ error: 'Not found' })

    const store = await findStoreByToken(token)
    if (!store) return res.status(404).json({ error: 'Not found' })

    res.json({
      // Chain is returned separately rather than folded into the name:
      // resolveDisplayName reduces a chain store to its city ("Austin"), which
      // is meaningless on its own to the person holding the phone.
      chain:     store.chain?.name ?? null,
      storeName: resolveDisplayName({
        displayName: store.displayName,
        chainName:   store.chain?.name ?? null,
        name:        store.name,
        address:     store.address,
      }),
      address:  store.address ?? null,
      region:   store.market?.name ?? null,
      // Materials the store is allowed to ask for, so the form stays in sync
      // with what the backend will actually accept.
      materials: Object.entries(MATERIAL_LABELS).map(([value, label]) => ({ value, label })),
    })
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: 'Internal server error' })
  }
})

// POST /api/portal/s/:token/restock — submit a restock signal.
router.post('/s/:token/restock', writeTokenLimiter, writeIpLimiter, async (req, res) => {
  try {
    const token = tokenParam(req)
    if (!isTokenShaped(token)) return res.status(404).json({ error: 'Not found' })

    // Respond 201 to a bot so a scraper cannot tell it was rejected.
    if (isBot(req.body)) return res.status(201).json({ ok: true })

    const store = await findStoreByToken(token)
    if (!store) return res.status(404).json({ error: 'Not found' })

    const parsed = parseSubmission(req.body)
    if (!parsed.ok) return res.status(400).json({ error: parsed.error })

    const {
      stockLevel, bottlesLeft: bottles, casesRequested, materials: cleanMaterials,
      wantsRepVisit: repVisit, note, submitterName, submitterEmail, submitterRole,
    } = parsed

    const chainName = store.chain?.name ?? null
    const storeLabel = resolveDisplayName({
      displayName: store.displayName,
      chainName,
      name:        store.name,
      address:     store.address,
    })
    // Alerts and email subjects need the chain to be identifiable at a glance —
    // "Austin" alone doesn't tell a rep which retailer is out.
    const fullLabel = chainName ? `${chainName} — ${storeLabel}` : storeLabel

    // Raise an alert for the genuinely urgent levels only, so the alert list
    // stays actionable. This is also the first runtime writer of Alert rows.
    let alertId: string | null = null
    if (raisesAlert(stockLevel)) {
      const cases = casesRequested && casesRequested > 0
        ? ` Requesting ${casesRequested} case(s).`
        : ''
      const alert = await prisma.alert.create({
        data: {
          type:    'LOW_STOCK_REP',
          status:  'OPEN',
          storeId: store.id,
          message: stockLevel === 'out_of_stock'
            ? `${fullLabel} reported they are OUT OF STOCK via the store portal.${cases}`
            : `${fullLabel} reported they are almost out via the store portal.${cases}`,
        },
        select: { id: true },
      })
      alertId = alert.id
    }

    const request = await prisma.restockRequest.create({
      data: {
        source:        'store_qr',
        storeId:       store.id,
        chainId:       store.chainId,
        stockLevel,
        bottlesLeft:   bottles,
        casesRequested,
        materials:     JSON.stringify(cleanMaterials),
        wantsRepVisit: repVisit,
        note,
        submitterName,
        submitterEmail,
        submitterRole,
        alertId,
        submittedIp:   clientIp(req),
      },
    })

    const email = {
      storeName:     storeLabel,
      chainName,
      storeAddress:  store.address,
      regionName:    store.market?.name ?? null,
      stockLevel,
      bottlesLeft:   bottles,
      casesRequested,
      materials:     cleanMaterials,
      wantsRepVisit: repVisit,
      note,
      submitterName,
      submitterEmail,
      submitterRole,
      createdAt:     request.createdAt,
      appUrl:        process.env.APP_URL ? `${process.env.APP_URL}/requests` : null,
    }

    // Fire-and-forget both: the store gets its confirmation screen regardless of
    // email health, and a failed send must never fail the submission.
    void sendRestockEmail(email)
    void sendRequesterCopy(email)

    res.status(201).json({ ok: true, copySentTo: submitterEmail })
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: 'Internal server error' })
  }
})

// ─── Chain-level portal ──────────────────────────────────────────────────────
// For an HQ buyer covering many locations. They can file chain-wide, or name one
// of the chain's locations. Same form, same validation, different scope.

// GET /api/portal/c/:token — chain identity plus its locations for the picker.
router.get('/c/:token', readLimiter, async (req, res) => {
  try {
    const token = tokenParam(req)
    if (!isTokenShaped(token)) return res.status(404).json({ error: 'Not found' })

    const chain = await findChainByToken(token)
    if (!chain) return res.status(404).json({ error: 'Not found' })

    // Location list is limited to name and city — the same information the
    // public store locator already publishes. No inventory, reps, or alerts.
    const stores = await prisma.store.findMany({
      where:   { chainId: chain.id, status: 'active' },
      select:  { id: true, name: true, displayName: true, address: true },
      orderBy: { name: 'asc' },
    })

    res.json({
      chain:     chain.name,
      locations: stores.map(s => ({
        id:    s.id,
        label: resolveDisplayName({
          displayName: s.displayName,
          chainName:   chain.name,
          name:        s.name,
          address:     s.address,
        }),
        address: s.address ?? null,
      })),
      materials: Object.entries(MATERIAL_LABELS).map(([value, label]) => ({ value, label })),
    })
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: 'Internal server error' })
  }
})

// POST /api/portal/c/:token/restock — chain-wide, or for one named location.
router.post('/c/:token/restock', writeChainTokenLimiter, writeIpLimiter, async (req, res) => {
  try {
    const token = tokenParam(req)
    if (!isTokenShaped(token)) return res.status(404).json({ error: 'Not found' })

    if (isBot(req.body)) return res.status(201).json({ ok: true })

    const chain = await findChainByToken(token)
    if (!chain) return res.status(404).json({ error: 'Not found' })

    const parsed = parseSubmission(req.body)
    if (!parsed.ok) return res.status(400).json({ error: parsed.error })

    const {
      stockLevel, bottlesLeft, casesRequested, materials, wantsRepVisit, note,
      submitterName, submitterEmail, submitterRole,
    } = parsed

    // An optional location. Verified to belong to THIS chain, so a chain token
    // can never file a request against another retailer's store.
    const rawStoreId = req.body?.storeId
    let store: Awaited<ReturnType<typeof findStoreForChain>> = null
    if (typeof rawStoreId === 'string' && rawStoreId.trim() !== '') {
      store = await findStoreForChain(rawStoreId, chain.id)
      if (!store) return res.status(400).json({ error: 'That location is not part of this chain.' })
    }

    const storeLabel = store
      ? resolveDisplayName({
          displayName: store.displayName,
          chainName:   chain.name,
          name:        store.name,
          address:     store.address,
        })
      : null
    const fullLabel = storeLabel ? `${chain.name} — ${storeLabel}` : `${chain.name} (chain-wide)`

    // Alerts hang off a store, so a chain-wide request raises none — there is no
    // single location to attach it to. The queue and the email still carry it.
    let alertId: string | null = null
    if (store && raisesAlert(stockLevel)) {
      const cases = casesRequested && casesRequested > 0
        ? ` Requesting ${casesRequested} case(s).`
        : ''
      const alert = await prisma.alert.create({
        data: {
          type:    'LOW_STOCK_REP',
          status:  'OPEN',
          storeId: store.id,
          message: stockLevel === 'out_of_stock'
            ? `${fullLabel} reported OUT OF STOCK via the chain portal.${cases}`
            : `${fullLabel} reported they are almost out via the chain portal.${cases}`,
        },
        select: { id: true },
      })
      alertId = alert.id
    }

    const request = await prisma.restockRequest.create({
      data: {
        source:        'chain_qr',
        storeId:       store?.id ?? null,
        chainId:       chain.id,
        stockLevel,
        bottlesLeft,
        casesRequested,
        materials:     JSON.stringify(materials),
        wantsRepVisit,
        note,
        submitterName,
        submitterEmail,
        submitterRole,
        alertId,
        submittedIp:   clientIp(req),
      },
    })

    const email = {
      storeName:     storeLabel ?? 'All locations',
      chainName:     chain.name,
      chainWide:     !store,
      storeAddress:  store?.address ?? null,
      regionName:    store?.market?.name ?? null,
      stockLevel,
      bottlesLeft,
      casesRequested,
      materials,
      wantsRepVisit,
      note,
      submitterName,
      submitterEmail,
      submitterRole,
      createdAt:     request.createdAt,
      appUrl:        process.env.APP_URL ? `${process.env.APP_URL}/requests` : null,
    }

    void sendRestockEmail(email)
    void sendRequesterCopy(email)

    res.status(201).json({ ok: true, copySentTo: submitterEmail })
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: 'Internal server error' })
  }
})

/** Looks up a store, but only if it belongs to the given chain. */
async function findStoreForChain(storeId: string, chainId: string) {
  return prisma.store.findFirst({
    where:  { id: storeId, chainId, status: 'active' },
    select: {
      id: true, name: true, displayName: true, address: true,
      market: { select: { name: true } },
      rep:    { select: { name: true, email: true } },
    },
  })
}

export default router
