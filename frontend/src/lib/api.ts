import type { DashboardStore, Chain, Rep, ClerkUser, Contact, Alert, Event, SupplierOrder } from '@/types'

export interface RepContext {
  isAdmin:     boolean
  allRegions:  boolean
  marketSlugs: string[]
}

const BASE = import.meta.env.VITE_API_URL ?? ''


function toQuery(params?: Record<string, string | undefined>): string {
  if (!params) return ''
  const q = new URLSearchParams()
  for (const [k, v] of Object.entries(params)) {
    if (v && v !== 'all') q.set(k, v)
  }
  const s = q.toString()
  return s ? `?${s}` : ''
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const clerk = (window as any).Clerk
  const token: string | null = clerk?.session ? await clerk.session.getToken() : null
  const res = await fetch(`${BASE}${path}`, {
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...init?.headers,
    },
    ...init,
  })
  if (!res.ok) {
    const body = await res.json().catch(() => ({}))
    throw new Error((body as { error?: string }).error ?? `HTTP ${res.status}`)
  }
  return res.json() as Promise<T>
}

// Unauthenticated fetch for the customer portal. Deliberately does NOT attach a
// Clerk token: retail staff have no account, and the store's portal token in the
// URL is the only credential.
async function publicRequest<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    headers: { 'Content-Type': 'application/json', ...init?.headers },
    ...init,
  })
  if (!res.ok) {
    const body = await res.json().catch(() => ({}))
    throw new Error((body as { error?: string }).error ?? `HTTP ${res.status}`)
  }
  return res.json() as Promise<T>
}

// ─── response normalizers ─────────────────────────────────────────────────────
// DB enums use underscores; frontend expects hyphens.

function normOrderStatus(s: string): 'pending' | 'in-transit' | 'delivered' {
  return (s === 'in_transit' ? 'in-transit' : s) as 'pending' | 'in-transit' | 'delivered'
}

function normVisitAction(a: string): 'stocked' | 'checked' | 'order-placed' | 'issue-reported' {
  return a.replace('_', '-') as 'stocked' | 'checked' | 'order-placed' | 'issue-reported'
}

function toDbOrderStatus(s: string): string {
  return s === 'in-transit' ? 'in_transit' : s
}

function toDbVisitAction(a: string): string {
  return a.replace('-', '_')
}

// ─── public API types ─────────────────────────────────────────────────────────

export interface ApiRegion {
  slug:   string
  name:   string
  _count: { stores: number }
}

export interface CreateVisitBody {
  storeId:          string
  repId?:           string
  logType?:         string
  action?:          string
  visitedAt?:       string
  onShelf:          number
  notes?:           string
  takeaways?:       string
  accomplishments?: string
  hoursWorked?:     number
  bottlesSold?:     number
  contactId?:       string
  linkedEventId?:   string
  casesDelivered?:  number
}

export interface UpdateVisitBody {
  onShelf?:         number
  action?:          string | null
  notes?:           string
  contactId?:       string | null
  takeaways?:       string | null
  accomplishments?: string | null
  hoursWorked?:     number | null
  bottlesSold?:     number | null
}

export interface ApiVisit {
  id:               string
  storeId:          string
  storeName:        string
  region:           string
  date:             string
  repId:            string
  rep:              string
  onShelf:          number
  action:           'stocked' | 'checked' | 'order-placed' | 'issue-reported' | null
  logType:          string | null
  bottlesSold:      number | null
  notes:            string | null
  takeaways:        string | null
  accomplishments:  string | null
  hoursWorked:      number | null
  contactId:        string | null
  contactName:      string | null
}

export interface ApiOrder {
  id:         string
  storeId:    string
  storeName:  string
  region:     string
  placedAt:   string
  quantity:   number
  status:     'pending' | 'in-transit' | 'delivered'
  invoiceRef: string
}

export interface StockSyncInfo {
  syncedAt:    string
  onShelf:     number
  stockStatus: string
  source:      string
}

export interface StockSyncLogEntry extends StockSyncInfo {
  id:              string
  previousOnShelf: number
}

export interface OrgSettings {
  brandName:    string
  logoUrl:      string | null
  primaryColor: string
  fromEmail:    string | null
  supportEmail: string | null
  appUrl:       string | null
}

export interface Product {
  id:           string
  name:         string
  sku:          string | null
  sizeLabel:    string | null
  unitsPerCase: number | null
  status:       'active' | 'archived'
  sortOrder:    number
}

export interface StoreProductLevel {
  productId: string
  name:      string
  sku:       string | null
  sizeLabel: string | null
  onShelf:   number
  inProcess: number
}

export interface ApiStoreDetail extends DashboardStore {
  visits:   ApiVisit[]
  orders:   ApiOrder[]
  contacts: Pick<Contact, 'id' | 'name' | 'role' | 'phone' | 'email' | 'chainId' | 'chainName' | 'notes'>[]
  lastStockSync: StockSyncInfo | null
  stockSyncs:    StockSyncLogEntry[]
  products:      StoreProductLevel[]
}

// ─── internal normalizers ─────────────────────────────────────────────────────

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const normVisit  = (v: any): ApiVisit  => ({ ...v, action: v.action ? normVisitAction(v.action) : null })
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const normOrder  = (o: any): ApiOrder  => ({ ...o, status: normOrderStatus(o.status) })
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const normContact = (c: any): Contact => ({ ...c, storeIds: c.storeIds ?? [], storeNames: c.storeNames ?? [] })

// Adjust daysOfSupply to be relative to now, not to the last visit timestamp.
// The backend stores daysOfSupply as-of the visit; we subtract elapsed days so
// every consumer gets an up-to-date number without a round-trip.
function normDashboardStore(s: DashboardStore): DashboardStore {
  if (s.daysOfSupply === null || s.lastVisit === null) return s
  const daysSince = (Date.now() - new Date(s.lastVisit).getTime()) / 86_400_000
  const adjusted  = Math.max(0, Math.round((s.daysOfSupply - daysSince) * 10) / 10)
  return { ...s, daysOfSupply: adjusted }
}

// ─── api client ───────────────────────────────────────────────────────────────

export const api = {
  // Dashboard
  getDashboard: (region?: string) =>
    request<DashboardStore[]>(`/api/dashboard${toQuery({ region })}`).then(ss => ss.map(normDashboardStore)),

  // Regions
  getRegions: () =>
    request<ApiRegion[]>('/api/regions'),

  createRegion: (name: string) =>
    request<ApiRegion>('/api/regions', { method: 'POST', body: JSON.stringify({ name }) }),

  deleteRegion: (slug: string) =>
    request<{ ok: boolean }>(`/api/regions/${slug}`, { method: 'DELETE' }),

  // Stores
  getWeeklyDepletion: (params?: { region?: string; weeks?: string }) =>
    request<WeeklyDepletionRow[]>(`/api/dashboard/depletion${toQuery(params)}`),

  getStores: (params?: { region?: string; chain?: string; rep?: string; includeInactive?: string }) =>
    request<DashboardStore[]>(`/api/stores${toQuery(params)}`).then(ss => ss.map(normDashboardStore)),

  setStoreStatus: (id: string, status: 'active' | 'inactive') =>
    request<DashboardStore>(`/api/stores/${id}/status`, {
      method: 'PATCH', body: JSON.stringify({ status }),
    }),

  getStore: (id: string) =>
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    request<any>(`/api/stores/${id}`).then((s): ApiStoreDetail => ({
      ...normDashboardStore(s),
      visits:   (s.visits  ?? []).map(normVisit),
      orders:   (s.orders  ?? []).map(normOrder),
      contacts: s.contacts ?? [],
      lastStockSync: s.lastStockSync ?? null,
      stockSyncs:    s.stockSyncs ?? [],
      products:      s.products ?? [],
    })),

  createStore: (body: {
    name: string; displayName?: string; address?: string; regionSlug: string
    chainId?: string; storeNumber?: string | null; repId?: string; latitude?: number; longitude?: number
  }) =>
    request<DashboardStore>('/api/stores', { method: 'POST', body: JSON.stringify(body) }),

  deleteStore: (id: string) =>
    request<{ ok: boolean }>(`/api/stores/${id}`, { method: 'DELETE' }),

  updateStore: (id: string, body: Partial<{
    name: string; displayName: string | null; address: string | null; onShelf: number; inProcess: number; daysOfSupply: number; depletionRate: number
    chainId: string | null; storeNumber: string | null; repId: string | null; regionSlug: string; latitude: number; longitude: number
  }>) =>
    request<DashboardStore>(`/api/stores/${id}`, { method: 'PATCH', body: JSON.stringify(body) }),

  // Org settings (branding)
  getOrgSettings: () => request<OrgSettings>('/api/settings'),

  updateOrgSettings: (body: Partial<OrgSettings>) =>
    request<OrgSettings>('/api/settings', { method: 'PATCH', body: JSON.stringify(body) }),

  // Products
  getProducts: (includeArchived = false) =>
    request<Product[]>(`/api/products${includeArchived ? '?includeArchived=1' : ''}`),

  createProduct: (body: { name: string; sku?: string; sizeLabel?: string; unitsPerCase?: number | null }) =>
    request<Product>('/api/products', { method: 'POST', body: JSON.stringify(body) }),

  updateProduct: (id: string, body: Partial<{ name: string; sku: string | null; sizeLabel: string | null; unitsPerCase: number | null; sortOrder: number; status: 'active' | 'archived' }>) =>
    request<Product>(`/api/products/${id}`, { method: 'PATCH', body: JSON.stringify(body) }),

  deleteProduct: (id: string) =>
    request<{ ok: boolean }>(`/api/products/${id}`, { method: 'DELETE' }),

  setStoreProductLevel: (storeId: string, productId: string, body: { onShelf?: number; inProcess?: number }) =>
    request<{ productId: string; onShelf: number; inProcess: number }>(
      `/api/stores/${storeId}/products/${productId}`,
      { method: 'PUT', body: JSON.stringify(body) },
    ),

  // Chains
  getChains: () => request<Chain[]>('/api/chains'),

  createChain: (name: string) =>
    request<Chain>('/api/chains', { method: 'POST', body: JSON.stringify({ name }) }),

  updateChain: (id: string, name: string) =>
    request<Chain>(`/api/chains/${id}`, { method: 'PATCH', body: JSON.stringify({ name }) }),

  deleteChain: (id: string) =>
    request<{ ok: boolean }>(`/api/chains/${id}`, { method: 'DELETE' }),

  updateRegion: (slug: string, name: string) =>
    request<ApiRegion>(`/api/regions/${slug}`, { method: 'PATCH', body: JSON.stringify({ name }) }),

  // Me (current user context)
  getMe: () =>
    request<RepContext>('/api/me'),

  // Reps
  getReps: (region?: string) =>
    request<Rep[]>(`/api/reps${toQuery({ region })}`),

  createRep: (body: {
    name: string; email: string; phone?: string; regionSlug: string
    status?: string; clerkUserId?: string; allRegions?: boolean; markets?: string[]
  }) =>
    request<Rep>('/api/reps', { method: 'POST', body: JSON.stringify(body) }),

  updateRep: (id: string, body: Partial<{
    name: string; email: string; phone: string | null; regionSlug: string
    status: string; clerkUserId: string | null; allRegions: boolean; markets: string[]
  }>) =>
    request<Rep>(`/api/reps/${id}`, { method: 'PATCH', body: JSON.stringify(body) }),

  deleteRep: (id: string) =>
    request<{ ok: boolean }>(`/api/reps/${id}`, { method: 'DELETE' }),

  // Clerk users (admin only)
  getClerkUsers: () =>
    request<ClerkUser[]>('/api/users'),

  inviteUser: (email: string) =>
    request<{ ok: boolean }>('/api/users/invite', { method: 'POST', body: JSON.stringify({ email }) }),

  // Events
  getEvents: (params?: { repId?: string; status?: string; storeId?: string }) =>
    request<Event[]>(`/api/events${toQuery(params)}`),

  createEvent: (body: { storeId?: string; type?: string; title?: string; address?: string; bottlesSold?: number; scheduledAt: string; endTime?: string; repIds: string[]; notes?: string; contactId?: string }) =>
    request<Event>('/api/events', { method: 'POST', body: JSON.stringify(body) }),

  updateEvent: (id: string, data: { status?: string; completionNotes?: string; takeaways?: string; accomplishments?: string; hoursWorked?: number; type?: string; title?: string; address?: string; bottlesSold?: number | null; scheduledAt?: string; endTime?: string; notes?: string; contactId?: string; repIds?: string[] }) =>
    request<Event>(`/api/events/${id}`, { method: 'PATCH', body: JSON.stringify(data) }),

  deleteEvent: (id: string) =>
    request<{ id: string }>(`/api/events/${id}`, { method: 'DELETE' }),

  // Contacts
  getContacts: (params?: { chainId?: string; storeId?: string }) =>
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    request<any[]>(`/api/contacts${toQuery(params)}`).then(cs => cs.map(normContact)),

  getContact: (id: string) =>
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    request<any>(`/api/contacts/${id}`).then(normContact),

  createContact: (body: {
    name: string; role: string; phone?: string; email?: string
    chainId?: string; storeIds?: string[]; notes?: string
  }) =>
    request<Contact>('/api/contacts', { method: 'POST', body: JSON.stringify(body) }),

  updateContact: (id: string, body: Partial<{
    name: string; role: string; phone: string; email: string; chainId: string; notes: string; storeIds: string[]
  }>) =>
    request<Contact>(`/api/contacts/${id}`, { method: 'PATCH', body: JSON.stringify(body) }),

  deleteContact: (id: string) =>
    request<{ ok: boolean }>(`/api/contacts/${id}`, { method: 'DELETE' }),

  // Alerts
  getAlerts: (params?: { region?: string; status?: string; storeId?: string }) =>
    request<Alert[]>(`/api/alerts${toQuery(params)}`),

  resolveAlert: (id: string) =>
    request<Alert>(`/api/alerts/${id}/resolve`, { method: 'PATCH' }),

  resolveAllAlerts: (region?: string) =>
    request<{ ok: boolean }>(`/api/alerts/resolve-all${toQuery({ region })}`, { method: 'PATCH' }),

  // Visits
  getVisits: (params?: { storeId?: string; repId?: string; contactId?: string; limit?: string }) =>
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    request<any[]>(`/api/visits${toQuery(params)}`).then(vs => vs.map(normVisit)),

  createVisit: (body: CreateVisitBody) =>
    request<ApiVisit>('/api/visits', {
      method: 'POST',
      body:   JSON.stringify(body),
    }).then(normVisit),

  updateVisit: (id: string, body: UpdateVisitBody) =>
    request<ApiVisit>(`/api/visits/${id}`, { method: 'PATCH', body: JSON.stringify(body) }).then(normVisit),

  deleteVisit: (id: string) =>
    request<{ ok: boolean }>(`/api/visits/${id}`, { method: 'DELETE' }),

  // Orders
  getOrders: (params?: { storeId?: string; status?: string }) =>
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    request<any[]>(`/api/orders${toQuery(params)}`).then(os => os.map(normOrder)),

  createOrder: (body: { storeId: string; quantity: number; invoiceRef: string; status?: string }) =>
    request<ApiOrder>('/api/orders', { method: 'POST', body: JSON.stringify(body) }).then(normOrder),

  updateOrderStatus: (id: string, status: string) =>
    request<ApiOrder>(`/api/orders/${id}`, {
      method: 'PATCH',
      body:   JSON.stringify({ status: toDbOrderStatus(status) }),
    }).then(normOrder),

  deleteOrder: (id: string) =>
    request<{ ok: boolean }>(`/api/orders/${id}`, { method: 'DELETE' }),

  // Supplier Orders
  getSupplierOrders: (params?: { status?: string }) =>
    request<SupplierOrder[]>(`/api/supplier-orders${toQuery(params)}`),

  createSupplierOrder: (body: { poNumber: string; product: string; quantity: number; supplier?: string; notes?: string; expectedAt: string }) =>
    request<SupplierOrder>('/api/supplier-orders', { method: 'POST', body: JSON.stringify(body) }),

  updateSupplierOrderStatus: (id: string, status: string) =>
    request<SupplierOrder>(`/api/supplier-orders/${id}`, { method: 'PATCH', body: JSON.stringify({ status }) }),

  // Bulk import
  importRecords: (type: 'chains' | 'stores' | 'contacts', rows: Record<string, string>[]) =>
    request<{ created: number; skipped: number; errors: string[] }>(
      `/api/import/${type}`,
      { method: 'POST', body: JSON.stringify(rows) }
    ),

  // Supply requests
  createSupplyRequest: (body: {
    eventId?:    string
    eventType?:  string
    eventDate?:  string
    eventTitle?: string
    storeName?:  string
    needByDate?: string
    items:       { label: string; quantity?: number; details?: string }[]
    urgency:     string
    notes?:      string
  }) =>
    request<{ id: string }>('/api/supply-requests', { method: 'POST', body: JSON.stringify(body) }),

  // Inventory
  getInventory: () =>
    request<import('@/types').InventorySnapshot>('/api/inventory'),

  getInventoryLog: () =>
    request<{
      warehouseTransfers: { id: string; quantity: number; notes: string | null; transferredAt: string; createdAt: string }[]
      productionRuns:     { id: string; quantity: number; notes: string | null; receivedAt: string; createdAt: string }[]
      deployments:        { id: string; quantity: number; marketSlug: string | null; marketName: string | null; chainId: string | null; chainName: string | null; storeId: string | null; storeName: string | null; repId: string | null; repName: string | null; notes: string | null; deployedAt: string; createdAt: string }[]
      salesEntries:       { id: string; quantity: number; notes: string | null; soldAt: string; createdAt: string }[]
    }>('/api/inventory/log'),

  addWarehouseTransfer: (body: { quantity: number; notes?: string; transferredAt?: string }) =>
    request<{ id: string; quantity: number }>('/api/inventory/warehouse-transfers', { method: 'POST', body: JSON.stringify(body) }),

  patchWarehouseTransfer: (id: string, body: { quantity?: number; notes?: string; transferredAt?: string }) =>
    request<{ id: string }>(`/api/inventory/warehouse-transfers/${id}`, { method: 'PATCH', body: JSON.stringify(body) }),

  deleteWarehouseTransfer: (id: string) =>
    request<{ ok: boolean }>(`/api/inventory/warehouse-transfers/${id}`, { method: 'DELETE' }),

  addProductionRun: (body: { quantity: number; notes?: string }) =>
    request<{ id: string; quantity: number }>('/api/inventory/production-runs', {
      method: 'POST', body: JSON.stringify(body),
    }),

  patchProductionRun: (id: string, body: { quantity?: number; notes?: string; receivedAt?: string }) =>
    request<{ id: string }>(`/api/inventory/production-runs/${id}`, { method: 'PATCH', body: JSON.stringify(body) }),

  deleteProductionRun: (id: string) =>
    request<{ ok: boolean }>(`/api/inventory/production-runs/${id}`, { method: 'DELETE' }),

  addDeployment: (body: { quantity: number; marketSlug?: string; chainId?: string; storeId?: string; repId?: string; notes?: string }) =>
    request<{ id: string; quantity: number }>('/api/inventory/deployments', {
      method: 'POST', body: JSON.stringify(body),
    }),

  patchDeployment: (id: string, body: { quantity?: number; notes?: string; deployedAt?: string; chainId?: string; marketSlug?: string }) =>
    request<{ id: string }>(`/api/inventory/deployments/${id}`, { method: 'PATCH', body: JSON.stringify(body) }),

  deleteDeployment: (id: string) =>
    request<{ ok: boolean }>(`/api/inventory/deployments/${id}`, { method: 'DELETE' }),

  addSalesEntry: (body: { quantity: number; notes?: string; soldAt?: string }) =>
    request<{ id: string; quantity: number }>('/api/inventory/sales-entries', {
      method: 'POST', body: JSON.stringify(body),
    }),

  patchSalesEntry: (id: string, body: { quantity?: number; notes?: string; soldAt?: string }) =>
    request<{ id: string }>(`/api/inventory/sales-entries/${id}`, { method: 'PATCH', body: JSON.stringify(body) }),

  deleteSalesEntry: (id: string) =>
    request<{ ok: boolean }>(`/api/inventory/sales-entries/${id}`, { method: 'DELETE' }),

  resetInventory: () =>
    request<{ ok: boolean }>('/api/inventory/reset', { method: 'DELETE' }),

  updateInventorySettings: (body: { reorderLeadWeeks?: number; bufferWeeks?: number }) =>
    request<{ reorderLeadWeeks: number; bufferWeeks: number }>('/api/inventory/settings', {
      method: 'PATCH', body: JSON.stringify(body),
    }),

  runStaleAlerts: (dryRun: boolean) =>
    request<StaleAlertsReport>('/api/inventory/stale-alerts', {
      method: 'POST', body: JSON.stringify({ dryRun }),
    }),

  // ─── customer portal ───────────────────────────────────────────────────────
  // Public (no Clerk session) — used by the /r/:token page.
  getPortalStore: (token: string) =>
    publicRequest<PortalStore>(`/api/portal/s/${encodeURIComponent(token)}`),

  submitPortalRestock: (token: string, body: PortalRestockSubmission) =>
    publicRequest<PortalSubmitResult>(
      `/api/portal/s/${encodeURIComponent(token)}/restock`,
      { method: 'POST', body: JSON.stringify(body) },
    ),

  getPortalChain: (token: string) =>
    publicRequest<PortalChain>(`/api/portal/c/${encodeURIComponent(token)}`),

  submitChainPortalRestock: (token: string, body: PortalRestockSubmission & { storeId?: string | null }) =>
    publicRequest<PortalSubmitResult>(
      `/api/portal/c/${encodeURIComponent(token)}/restock`,
      { method: 'POST', body: JSON.stringify(body) },
    ),

  // Internal queue + QR token management.
  getRestockRequests: (params?: { status?: string; storeId?: string; chainId?: string }) =>
    request<RestockRequest[]>(`/api/restock-requests${toQuery(params)}`),

  updateRestockRequestStatus: (id: string, status: RestockRequestStatus) =>
    request<RestockRequest>(`/api/restock-requests/${id}`, {
      method: 'PATCH', body: JSON.stringify({ status }),
    }),

  deleteRestockRequest: (id: string) =>
    request<{ ok: true }>(`/api/restock-requests/${id}`, { method: 'DELETE' }),

  getStorePortalToken: (storeId: string) =>
    request<StorePortalToken>(`/api/stores/${storeId}/portal-token`),

  issueStorePortalToken: (storeId: string, rotate = false) =>
    request<StorePortalToken & { rotated: boolean }>(
      `/api/stores/${storeId}/portal-token`,
      { method: 'POST', body: JSON.stringify({ rotate }) },
    ),

  getChainPortalToken: (chainId: string) =>
    request<StorePortalToken>(`/api/chains/${chainId}/portal-token`),

  issueChainPortalToken: (chainId: string, rotate = false) =>
    request<StorePortalToken & { rotated: boolean }>(
      `/api/chains/${chainId}/portal-token`,
      { method: 'POST', body: JSON.stringify({ rotate }) },
    ),
}

// ─── customer portal types ────────────────────────────────────────────────────

// `almost_out` only appears on rows submitted before the form moved to three
// faces; it is still rendered, but never offered.
export type StockLevel = 'well_stocked' | 'getting_low' | 'almost_out' | 'out_of_stock'
export type RestockRequestStatus = 'new_request' | 'acknowledged' | 'resolved'

export interface PortalStore {
  /** Chain name, kept separate — a chain store's storeName is just its city. */
  chain:     string | null
  storeName: string
  address:   string | null
  region:    string | null
  materials: { value: string; label: string }[]
}

export interface PortalChainLocation {
  id:      string
  label:   string
  address: string | null
}

export interface PortalChain {
  chain:     string
  locations: PortalChainLocation[]
  materials: { value: string; label: string }[]
}

export interface WeeklyDepletionRow {
  week:      string
  weekStart: string
  /** Bottles reps recorded on visits that week. */
  sold:      number
  /** Quantity across orders placed that week. */
  ordered:   number
}

export interface PortalSubmitResult {
  ok: true
  /** Address the courtesy copy went to, when one was supplied. */
  copySentTo?: string | null
}

export interface PortalRestockSubmission {
  stockLevel:      StockLevel
  bottlesLeft?:    number | null
  casesRequested?: number | null
  materials:       string[]
  wantsRepVisit:   boolean
  note?:           string | null
  submitterName?:  string | null
  submitterEmail?: string | null
  submitterRole?:  string | null
  /** Honeypot — must stay empty. */
  website?:        string
}

export type RequestSource = 'store_qr' | 'chain_qr'

export interface RestockRequest {
  id:            string
  source:        RequestSource
  /** Null for a chain-wide request that named no location. */
  storeId:       string | null
  storeName:     string | null
  storeAddress:  string | null
  chainId:       string | null
  chainName:     string | null
  region:        string | null
  repId:         string | null
  repName:       string | null
  stockLevel:     StockLevel
  bottlesLeft:    number | null
  casesRequested: number | null
  materials:      string[]
  wantsRepVisit:  boolean
  note:           string | null
  submitterName:  string | null
  submitterEmail: string | null
  submitterRole:  string | null
  status:        RestockRequestStatus
  createdAt:     string
}

export interface StorePortalToken {
  token:    string | null
  issuedAt: string | null
}

export interface StaleAlertsReport {
  dryRun:               boolean
  ranAt:                string
  visitOverdueDays:     number
  noMovementDays:       number
  storesConsidered:     number
  visitOverdueRaised:   number
  visitOverdueResolved: number
  noMovementRaised:     number
  noMovementResolved:   number
  details: {
    storeId:   string
    storeName: string
    type:      'VISIT_OVERDUE' | 'NO_MOVEMENT'
    action:    'raised' | 'resolved'
    reason:    string
  }[]
}
