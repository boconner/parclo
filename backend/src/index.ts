import 'dotenv/config'
import express from 'express'
import cors from 'cors'
import morgan from 'morgan'
import { clerkMiddleware, getAuth } from '@clerk/express'

import { getRepContext } from './repContext.js'
import dashboardRouter from './routes/dashboard.js'
import regionsRouter   from './routes/regions.js'
import storesRouter    from './routes/stores.js'
import chainsRouter    from './routes/chains.js'
import repsRouter      from './routes/reps.js'
import usersRouter     from './routes/users.js'
import eventsRouter    from './routes/events.js'
import contactsRouter  from './routes/contacts.js'
import alertsRouter    from './routes/alerts.js'
import visitsRouter    from './routes/visits.js'
import ordersRouter         from './routes/orders.js'
import supplierOrdersRouter from './routes/supplier-orders.js'
import importRouter         from './routes/import.js'
import supplyRequestsRouter from './routes/supply-requests.js'
import inventoryRouter      from './routes/inventory.js'
import publicRouter         from './routes/public.js'
import portalRouter         from './routes/portal.js'
import restockRequestsRouter from './routes/restock-requests.js'
import productsRouter        from './routes/products.js'

const app = express()

app.use(cors())
app.use(morgan('dev'))
app.use(express.json())

// Health check before Clerk middleware so it never fails due to missing keys
app.get('/api/health', (_req, res) => res.json({ ok: true }))

// Public, API-key-gated routes (e.g. WordPress store locator). Mounted before the
// Clerk middleware/gate so they are reachable without a Clerk session.
app.use('/api/public', publicRouter)

// Customer-facing store portal (QR code in store). Token-gated and rate limited
// inside the router — also before the Clerk gate, since retail staff have no
// Contento account by design.
app.use('/api/portal', portalRouter)

app.use(clerkMiddleware())

// All other API routes require a valid Clerk session
app.use('/api', (req, res, next) => {
  try {
    const { userId } = getAuth(req)
    if (!userId) return res.status(401).json({ error: 'Unauthorized' })
    next()
  } catch {
    return res.status(401).json({ error: 'Unauthorized' })
  }
})

app.get('/api/me', async (req, res) => {
  try {
    const ctx = await getRepContext(req)
    res.json(ctx)
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: 'Internal server error' })
  }
})

app.use('/api/dashboard', dashboardRouter)
app.use('/api/regions',   regionsRouter)
app.use('/api/stores',    storesRouter)
app.use('/api/chains',    chainsRouter)
app.use('/api/reps',      repsRouter)
app.use('/api/users',     usersRouter)
app.use('/api/events',    eventsRouter)
app.use('/api/contacts',  contactsRouter)
app.use('/api/alerts',    alertsRouter)
app.use('/api/visits',    visitsRouter)
app.use('/api/orders',           ordersRouter)
app.use('/api/supplier-orders',  supplierOrdersRouter)
app.use('/api/import',           importRouter)
app.use('/api/supply-requests',  supplyRequestsRouter)
app.use('/api/restock-requests', restockRequestsRouter)
app.use('/api/inventory',        inventoryRouter)
app.use('/api/products',         productsRouter)

const PORT = process.env.PORT ?? 3001

app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`)
})
