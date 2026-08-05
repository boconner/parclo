import { prisma } from './prisma.js'

export interface Brand {
  brandName:    string
  logoUrl:      string | null
  primaryColor: string
  fromEmail:    string | null
  supportEmail: string | null
  appUrl:       string | null
}

/** Load the org settings singleton, creating it with defaults on first read. */
export async function getOrgSettings(): Promise<Brand> {
  const s = await prisma.orgSettings.upsert({
    where:  { id: 'default' },
    create: { id: 'default' },
    update: {},
  })
  return {
    brandName:    s.brandName,
    logoUrl:      s.logoUrl,
    primaryColor: s.primaryColor,
    fromEmail:    s.fromEmail,
    supportEmail: s.supportEmail,
    appUrl:       s.appUrl,
  }
}
