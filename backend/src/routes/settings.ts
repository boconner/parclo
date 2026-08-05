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

    const { brandName, logoUrl, primaryColor, fromEmail, supportEmail, appUrl, featureEvents, featurePipeline } = req.body ?? {}
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
        ...(featureEvents   !== undefined ? { featureEvents:   Boolean(featureEvents) }   : {}),
        ...(featurePipeline !== undefined ? { featurePipeline: Boolean(featurePipeline) } : {}),
      },
    })
    res.json({
      brandName:    s.brandName,
      logoUrl:      s.logoUrl,
      primaryColor: s.primaryColor,
      fromEmail:    s.fromEmail,
      supportEmail: s.supportEmail,
      appUrl:       s.appUrl,
      featureEvents:   s.featureEvents,
      featurePipeline: s.featurePipeline,
    })
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: 'Internal server error' })
  }
})

// Onboarding progress for the Getting Started checklist. Completion is derived
// from data presence, not stored state, so it stays accurate however the data
// arrives (UI, CSV import, or API).
router.get('/setup-status', async (_req, res) => {
  try {
    const [settings, productCount, storeCount, repCount, qrIssuedCount] = await Promise.all([
      getOrgSettings(),
      prisma.product.count({ where: { status: 'active' } }),
      prisma.store.count(),
      prisma.rep.count(),
      prisma.store.count({ where: { portalToken: { not: null } } }),
    ])

    const brandingConfigured = settings.brandName !== 'Parclo' || settings.logoUrl !== null
    res.json({
      brandingConfigured,
      productCount,
      storeCount,
      repCount,
      qrIssuedCount,
      complete: brandingConfigured && productCount > 0 && storeCount > 0 && repCount > 0 && qrIssuedCount > 0,
    })
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: 'Internal server error' })
  }
})

export default router
