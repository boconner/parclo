import { Router } from 'express'
import { clerkClient } from '@clerk/express'
import { getRepContext } from '../repContext.js'

const router = Router()

// Returns all Clerk users so admins can link them to Rep records
router.get('/', async (_req, res) => {
  try {
    const { data: users } = await clerkClient.users.getUserList({ limit: 100 })
    res.json(users.map(u => ({
      id:    u.id,
      name:  [u.firstName, u.lastName].filter(Boolean).join(' ') || u.username || 'Unknown',
      email: u.emailAddresses[0]?.emailAddress ?? '',
    })))
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: 'Internal server error' })
  }
})

// Send a Clerk invitation so the recipient can set their password.
// Admin only — this grants access to the workspace.
router.post('/invite', async (req, res) => {
  try {
    const ctx = await getRepContext(req)
    if (!ctx.isAdmin && !ctx.allRegions) return res.status(403).json({ error: 'Forbidden' })

    const { email, redirectUrl } = req.body as { email: string; redirectUrl?: string }
    const resolvedRedirect = redirectUrl ?? process.env.FRONTEND_URL
    await clerkClient.invitations.createInvitation({
      emailAddress: email,
      ...(resolvedRedirect ? { redirectUrl: resolvedRedirect } : {}),
    })
    res.json({ ok: true })
  } catch (err: any) {
    console.error(err)
    const message = err?.errors?.[0]?.longMessage ?? err?.errors?.[0]?.message ?? 'Failed to send invite'
    res.status(400).json({ error: message })
  }
})

export default router
