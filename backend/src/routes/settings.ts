import { Router } from 'express'
import { prisma } from '../prisma.js'
import { getRepContext } from '../repContext.js'
import { getOrgSettings } from '../orgSettings.js'

const router = Router()

router.get('/', async (_req, res) => {
  try {
    res.json(await getOrgSettings())
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: 'Internal server error' })
  }
})

router.patch('/', async (req, res) => {
  try {
    const ctx = await getRepContext(req)
    if (!ctx.isAdmin) return res.status(403).json({ error: 'Forbidden' })

    const { brandName, logoUrl, primaryColor, fromEmail, supportEmail, appUrl } = req.body ?? {}
    if (brandName !== undefined && (typeof brandName !== 'string' || !brandName.trim())) {
      return res.status(400).json({ error: 'Brand name cannot be empty' })
    }
    if (primaryColor !== undefined && !/^#[0-9a-fA-F]{6}$/.test(primaryColor)) {
      return res.status(400).json({ error: 'Primary color must be a hex value like #724fac' })
    }

    const trimOrNull = (v: unknown) => (typeof v === 'string' && v.trim() ? v.trim() : null)

    await prisma.orgSettings.upsert({
      where:  { id: 'default' },
      create: { id: 'default' },
      update: {},
    })
    const s = await prisma.orgSettings.update({
      where: { id: 'default' },
      data: {
        ...(brandName    !== undefined ? { brandName: brandName.trim() }      : {}),
        ...(logoUrl      !== undefined ? { logoUrl: trimOrNull(logoUrl) }     : {}),
        ...(primaryColor !== undefined ? { primaryColor }                     : {}),
        ...(fromEmail    !== undefined ? { fromEmail: trimOrNull(fromEmail) } : {}),
        ...(supportEmail !== undefined ? { supportEmail: trimOrNull(supportEmail) } : {}),
        ...(appUrl       !== undefined ? { appUrl: trimOrNull(appUrl) }       : {}),
      },
    })
    res.json({
      brandName:    s.brandName,
      logoUrl:      s.logoUrl,
      primaryColor: s.primaryColor,
      fromEmail:    s.fromEmail,
      supportEmail: s.supportEmail,
      appUrl:       s.appUrl,
    })
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: 'Internal server error' })
  }
})

export default router
