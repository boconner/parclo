import { Router } from 'express'
import type { Request, Response, NextFunction } from 'express'
import { prisma } from '../prisma.js'
import { getRepContext } from '../repContext.js'
import { syncSingleProductLevel } from '../storeProducts.js'

const router = Router()

// Bulk chain/store imports reshape shared reference data, so they are admin
// config. Contact import stays open to any signed-in user — the Contacts page
// (visible to reps) offers it as a normal workflow.
async function requireAdmin(req: Request, res: Response, next: NextFunction) {
  try {
    const ctx = await getRepContext(req)
    if (!ctx.isAdmin && !ctx.allRegions) {
      res.status(403).json({ error: 'Forbidden' })
      return
    }
    next()
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: 'Internal server error' })
  }
}

type ImportResult = { created: number; skipped: number; errors: string[] }

function toSlug(name: string) {
  return name.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
}

async function geocodeAddress(address: string): Promise<{ latitude: number; longitude: number } | null> {
  const token = process.env.MAPBOX_TOKEN
  if (!token) return null
  try {
    const url = `https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(address)}.json`
      + `?country=US&limit=1&access_token=${token}`
    const res = await fetch(url)
    if (!res.ok) return null
    const data = await res.json() as { features?: { center: [number, number] }[] }
    const feature = data.features?.[0]
    if (!feature) return null
    const [lng, lat] = feature.center
    return { latitude: lat, longitude: lng }
  } catch {
    return null
  }
}

// POST /api/import/chains
router.post('/chains', requireAdmin, async (req, res) => {
  try {
    const rows: { name?: string }[] = req.body
    const result: ImportResult = { created: 0, skipped: 0, errors: [] }

    const existing = await prisma.chain.findMany({ select: { name: true } })
    const existingNames = new Set(existing.map(c => c.name.toLowerCase()))

    for (let i = 0; i < rows.length; i++) {
      const name = rows[i]?.name?.trim()
      if (!name) { result.errors.push(`Row ${i + 1}: missing name`); continue }
      if (existingNames.has(name.toLowerCase())) { result.skipped++; continue }
      try {
        await prisma.chain.create({ data: { id: toSlug(name), name } })
        existingNames.add(name.toLowerCase())
        result.created++
      } catch (e: any) {
        if (e?.code === 'P2002') result.skipped++
        else result.errors.push(`Row ${i + 1} (${name}): ${e?.message ?? 'error'}`)
      }
    }
    res.json(result)
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: 'Internal server error' })
  }
})

// POST /api/import/stores
router.post('/stores', requireAdmin, async (req, res) => {
  try {
    const rows: {
      name?: string; displayName?: string; market?: string; chain?: string
      address?: string; street?: string; city?: string; state?: string; zip?: string
      onShelf?: string; inProcess?: string
    }[] = req.body
    const result: ImportResult = { created: 0, skipped: 0, errors: [] }

    const [chains, markets, stores] = await Promise.all([
      prisma.chain.findMany({ select: { id: true, name: true } }),
      prisma.market.findMany({ select: { slug: true, name: true } }),
      prisma.store.findMany({ select: { name: true } }),
    ])

    const chainByName   = new Map(chains.map(c => [c.name.toLowerCase(), c.id]))
    const marketByName  = new Map(markets.map(m => [m.name.toLowerCase(), m.slug]))
    const marketBySlug  = new Map(markets.map(m => [m.slug.toLowerCase(), m.slug]))
    const existingNames = new Set(stores.map(s => s.name.toLowerCase()))

    for (let i = 0; i < rows.length; i++) {
      const row = rows[i]
      if (!row) continue
      const name = row.name?.trim()
      if (!name) { result.errors.push(`Row ${i + 1}: missing name`); continue }
      if (existingNames.has(name.toLowerCase())) { result.skipped++; continue }

      const mInput   = row.market?.trim().toLowerCase() ?? ''
      const marketSlug = marketBySlug.get(mInput) ?? marketByName.get(mInput)
      if (!marketSlug) {
        result.errors.push(`Row ${i + 1} (${name}): unknown market "${row.market}" — create it first`)
        continue
      }

      let chainId: string | null = null
      if (row.chain?.trim()) {
        chainId = chainByName.get(row.chain.trim().toLowerCase()) ?? null
        if (!chainId) {
          result.errors.push(`Row ${i + 1} (${name}): unknown chain "${row.chain}" — import chains first`)
          continue
        }
      }

      const address = row.address?.trim() || [
        row.street?.trim(),
        row.city?.trim(),
        row.state?.trim(),
        row.zip?.trim(),
      ].filter(Boolean).join(', ') || null
      const coords  = address ? await geocodeAddress(address) : null

      try {
        const created = await prisma.store.create({
          data: {
            name, displayName: row.displayName?.trim() || null,
            marketSlug, chainId,
            area: '',
            address,
            latitude:  coords?.latitude  ?? null,
            longitude: coords?.longitude ?? null,
            onShelf:   row.onShelf   ? Math.max(0, parseInt(row.onShelf))   : 0,
            inProcess: row.inProcess ? Math.max(0, parseInt(row.inProcess)) : 0,
          },
        })
        await syncSingleProductLevel(created.id, { onShelf: created.onShelf, inProcess: created.inProcess })
        existingNames.add(name.toLowerCase())
        result.created++
      } catch (e: any) {
        if (e?.code === 'P2002') result.skipped++
        else result.errors.push(`Row ${i + 1} (${name}): ${e?.message ?? 'error'}`)
      }
    }
    res.json(result)
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: 'Internal server error' })
  }
})

// POST /api/import/contacts
router.post('/contacts', async (req, res) => {
  try {
    const rows: {
      name?: string; role?: string; phone?: string; email?: string
      chain?: string; stores?: string; notes?: string
    }[] = req.body
    const result: ImportResult = { created: 0, skipped: 0, errors: [] }

    const [chains, stores, contacts] = await Promise.all([
      prisma.chain.findMany({ select: { id: true, name: true } }),
      prisma.store.findMany({ select: { id: true, name: true } }),
      prisma.contact.findMany({ select: { name: true } }),
    ])

    const chainByName   = new Map(chains.map(c => [c.name.toLowerCase(), c.id]))
    const storeByName   = new Map(stores.map(s => [s.name.toLowerCase(), s.id]))
    const existingNames = new Set(contacts.map(c => c.name.toLowerCase()))

    for (let i = 0; i < rows.length; i++) {
      const row = rows[i]
      if (!row) continue
      const name = row.name?.trim()
      if (!name) { result.errors.push(`Row ${i + 1}: missing name`); continue }
      if (existingNames.has(name.toLowerCase())) { result.skipped++; continue }

      let chainId: string | null = null
      if (row.chain?.trim()) {
        chainId = chainByName.get(row.chain.trim().toLowerCase()) ?? null
        if (!chainId) {
          result.errors.push(`Row ${i + 1} (${name}): unknown chain "${row.chain}" — skipping`)
          continue
        }
      }

      // Resolve store names (comma-separated); unresolvable ones are warned but don't block the row
      const storeIds: string[] = []
      if (row.stores?.trim()) {
        for (const sn of row.stores.split(',').map(s => s.trim()).filter(Boolean)) {
          const sid = storeByName.get(sn.toLowerCase())
          if (sid) storeIds.push(sid)
          else result.errors.push(`Row ${i + 1} (${name}): store "${sn}" not found — association skipped`)
        }
      }

      try {
        await prisma.contact.create({
          data: {
            name,
            role:  row.role?.trim()  || null,
            phone: row.phone?.trim() || null,
            email: row.email?.trim() || null,
            chainId,
            notes: row.notes?.trim() || null,
            stores: storeIds.length
              ? { create: storeIds.map(storeId => ({ storeId })) }
              : undefined,
          },
        })
        existingNames.add(name.toLowerCase())
        result.created++
      } catch (e: any) {
        if (e?.code === 'P2002') result.skipped++
        else result.errors.push(`Row ${i + 1} (${name}): ${e?.message ?? 'error'}`)
      }
    }
    res.json(result)
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: 'Internal server error' })
  }
})

export default router
