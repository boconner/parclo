import type { Request } from 'express'
import { getAuth, clerkClient } from '@clerk/express'
import { prisma } from './prisma.js'

// Clerk only includes publicMetadata in the session JWT if the session token has
// been customized to add it — it is NOT there by default. The frontend reads
// publicMetadata off the User object, where it always exists, so without this
// fallback the UI would show admin controls that the API then rejects with 403.
//
// Cached briefly because this runs on most requests and the role rarely changes.
const ROLE_TTL_MS = 60 * 1000
const roleCache = new Map<string, { role: string | undefined; at: number }>()

async function roleForUser(userId: string): Promise<string | undefined> {
  const hit = roleCache.get(userId)
  if (hit && Date.now() - hit.at < ROLE_TTL_MS) return hit.role

  try {
    const user = await clerkClient.users.getUser(userId)
    const role = (user.publicMetadata as { role?: string } | undefined)?.role
    roleCache.set(userId, { role, at: Date.now() })
    return role
  } catch (err) {
    // Never let a Clerk outage escalate into a total loss of access — fall
    // through to the Rep lookup, which still scopes the user correctly.
    console.error('Clerk user lookup failed:', err)
    return undefined
  }
}

export interface RepContext {
  isAdmin: boolean
  allRegions: boolean
  marketSlugs: string[]
}

export async function getRepContext(req: Request): Promise<RepContext> {
  const { userId, sessionClaims } = getAuth(req)

  // Prefer the session claim (no network call); fall back to the Clerk API when
  // the token doesn't carry publicMetadata, which is the default configuration.
  let role = (sessionClaims?.publicMetadata as { role?: string } | undefined)?.role
  if (role === undefined && userId) {
    role = await roleForUser(userId)
  }

  if (role === 'admin') {
    return { isAdmin: true, allRegions: true, marketSlugs: [] }
  }

  if (!userId) {
    return { isAdmin: false, allRegions: false, marketSlugs: [] }
  }

  const rep = await prisma.rep.findFirst({
    where: { clerkUserId: userId },
    select: {
      allRegions: true,
      marketSlug:  true,
      repMarkets:  { select: { marketSlug: true } },
    },
  })

  if (!rep) {
    return { isAdmin: false, allRegions: false, marketSlugs: [] }
  }

  if (rep.allRegions) {
    return { isAdmin: false, allRegions: true, marketSlugs: [] }
  }

  const slugs = rep.repMarkets.length > 0
    ? rep.repMarkets.map(rm => rm.marketSlug)
    : [rep.marketSlug]

  return { isAdmin: false, allRegions: false, marketSlugs: slugs }
}

export function regionFilter(ctx: RepContext): { marketSlug?: { in: string[] } } {
  if (ctx.isAdmin || ctx.allRegions) return {}
  return { marketSlug: { in: ctx.marketSlugs } }
}
