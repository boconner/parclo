import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api, type RestockRequestStatus } from '@/lib/api'
import { toast } from '@/components/ui/Toast'

// ─── Me ───────────────────────────────────────────────────────────────────────

export function useMe() {
  return useQuery({
    queryKey: ['me'],
    queryFn:  api.getMe,
    staleTime: 60_000,
  })
}

// ─── Dashboard ────────────────────────────────────────────────────────────────

export function useDashboard(region?: string) {
  return useQuery({
    queryKey: ['dashboard', region ?? 'all'],
    queryFn:  () => api.getDashboard(region),
  })
}

// ─── Regions ──────────────────────────────────────────────────────────────────

export function useRegions() {
  return useQuery({
    queryKey: ['regions'],
    queryFn:  api.getRegions,
    staleTime: 5 * 60_000,
  })
}

export function useCreateRegion() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (name: string) => api.createRegion(name),
    onSuccess:  () => qc.invalidateQueries({ queryKey: ['regions'] }),
    onError: (err: Error) => toast(err.message, 'error'),
  })
}

export function useDeleteRegion() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (slug: string) => api.deleteRegion(slug),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['regions'] })
      qc.invalidateQueries({ queryKey: ['stores'] })
    },
    onError: (err: Error) => toast(err.message, 'error'),
  })
}

// ─── Stores ───────────────────────────────────────────────────────────────────

export function useStores(params?: { region?: string; chain?: string; rep?: string; includeInactive?: string }) {
  return useQuery({
    queryKey: ['stores', params ?? {}],
    queryFn:  () => api.getStores(params),
  })
}

export function useWeeklyDepletion(params?: { region?: string; weeks?: string }) {
  return useQuery({
    queryKey: ['weeklyDepletion', params ?? {}],
    queryFn:  () => api.getWeeklyDepletion(params),
  })
}

export function useSetStoreStatus() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, status }: { id: string; status: 'active' | 'inactive' }) =>
      api.setStoreStatus(id, status),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['stores'] })
      qc.invalidateQueries({ queryKey: ['store'] })
      qc.invalidateQueries({ queryKey: ['dashboard'] })
      // Deactivating resolves the store's open alerts.
      qc.invalidateQueries({ queryKey: ['alerts'] })
    },
    onError: (err: Error) => toast(err.message, 'error'),
  })
}

export function useStore(id: string | undefined) {
  return useQuery({
    queryKey: ['stores', id],
    queryFn:  () => api.getStore(id!),
    enabled:  !!id,
  })
}

export function useCreateStore() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: api.createStore,
    onSuccess:  () => {
      qc.invalidateQueries({ queryKey: ['stores'] })
      qc.invalidateQueries({ queryKey: ['dashboard'] })
      qc.invalidateQueries({ queryKey: ['regions'] })
    },
  })
}

export function useDeleteStore() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => api.deleteStore(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['stores'] })
      qc.invalidateQueries({ queryKey: ['dashboard'] })
    },
    onError: (err: Error) => toast(err.message, 'error'),
  })
}

export function useUpdateStore() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, ...body }: { id: string } & Parameters<typeof api.updateStore>[1]) =>
      api.updateStore(id, body),
    onSuccess: (_, vars) => {
      qc.invalidateQueries({ queryKey: ['stores', vars.id] })
      qc.invalidateQueries({ queryKey: ['stores'] })
      qc.invalidateQueries({ queryKey: ['dashboard'] })
    },
  })
}

// ─── Products ─────────────────────────────────────────────────────────────────

export function useProducts(includeArchived = false) {
  return useQuery({
    queryKey:  ['products', { includeArchived }],
    queryFn:   () => api.getProducts(includeArchived),
    staleTime: 5 * 60_000,
  })
}

export function useCreateProduct() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (body: { name: string; sku?: string; sizeLabel?: string; unitsPerCase?: number | null }) => api.createProduct(body),
    onSuccess:  () => qc.invalidateQueries({ queryKey: ['products'] }),
    onError: (err: Error) => toast(err.message, 'error'),
  })
}

export function useUpdateProduct() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, ...body }: { id: string } & Partial<{ name: string; sku: string | null; sizeLabel: string | null; unitsPerCase: number | null; sortOrder: number; status: 'active' | 'archived' }>) =>
      api.updateProduct(id, body),
    onSuccess:  () => qc.invalidateQueries({ queryKey: ['products'] }),
    onError: (err: Error) => toast(err.message, 'error'),
  })
}

export function useDeleteProduct() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => api.deleteProduct(id),
    onSuccess:  () => qc.invalidateQueries({ queryKey: ['products'] }),
    onError: (err: Error) => toast(err.message, 'error'),
  })
}

// ─── Chains ───────────────────────────────────────────────────────────────────

export function useChains() {
  return useQuery({
    queryKey:  ['chains'],
    queryFn:   api.getChains,
    staleTime: 5 * 60_000,
  })
}

export function useCreateChain() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (name: string) => api.createChain(name),
    onSuccess:  () => qc.invalidateQueries({ queryKey: ['chains'] }),
    onError: (err: Error) => toast(err.message, 'error'),
  })
}

export function useUpdateChain() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, name }: { id: string; name: string }) => api.updateChain(id, name),
    onSuccess:  () => qc.invalidateQueries({ queryKey: ['chains'] }),
    onError: (err: Error) => toast(err.message, 'error'),
  })
}

export function useDeleteChain() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => api.deleteChain(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['chains'] })
      qc.invalidateQueries({ queryKey: ['stores'] })
    },
    onError: (err: Error) => toast(err.message, 'error'),
  })
}

export function useUpdateRegion() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ slug, name }: { slug: string; name: string }) => api.updateRegion(slug, name),
    onSuccess:  () => qc.invalidateQueries({ queryKey: ['regions'] }),
    onError: (err: Error) => toast(err.message, 'error'),
  })
}

// ─── Reps ─────────────────────────────────────────────────────────────────────

export function useReps(region?: string) {
  return useQuery({
    queryKey: ['reps', region ?? 'all'],
    queryFn:  () => api.getReps(region),
  })
}

export function useClerkUsers() {
  return useQuery({
    queryKey: ['clerkUsers'],
    queryFn:  api.getClerkUsers,
    staleTime: 5 * 60_000,
  })
}

export function useInviteUser() {
  return useMutation({
    mutationFn: (email: string) => api.inviteUser(email),
    onError: (err: Error) => toast(err.message, 'error'),
  })
}

export function useCreateRep() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: api.createRep,
    onSuccess:  () => qc.invalidateQueries({ queryKey: ['reps'] }),
  })
}

export function useUpdateRep() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, ...body }: { id: string } & Parameters<typeof api.updateRep>[1]) =>
      api.updateRep(id, body),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['reps'] }),
  })
}

export function useDeleteRep() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => api.deleteRep(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['reps'] })
      qc.invalidateQueries({ queryKey: ['stores'] })
    },
    onError: (err: Error) => toast(err.message, 'error'),
  })
}

// ─── Contacts ─────────────────────────────────────────────────────────────────

export function useContacts(params?: { chainId?: string; storeId?: string }) {
  return useQuery({
    queryKey: ['contacts', params ?? {}],
    queryFn:  () => api.getContacts(params),
  })
}

export function useContact(id: string | undefined) {
  return useQuery({
    queryKey: ['contacts', id],
    queryFn:  () => api.getContact(id!),
    enabled:  !!id,
  })
}

export function useCreateContact() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: api.createContact,
    onSuccess:  () => {
      qc.invalidateQueries({ queryKey: ['contacts'] })
      qc.invalidateQueries({ queryKey: ['stores'] })
    },
  })
}

export function useUpdateContact() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, ...body }: { id: string } & Parameters<typeof api.updateContact>[1]) =>
      api.updateContact(id, body),
    onSuccess: (_, vars) => {
      qc.invalidateQueries({ queryKey: ['contacts'] })
      qc.invalidateQueries({ queryKey: ['contacts', vars.id] })
    },
  })
}

export function useDeleteContact() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => api.deleteContact(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['contacts'] }),
    onError: (err: Error) => toast(err.message, 'error'),
  })
}

// ─── Events ───────────────────────────────────────────────────────────────────

export function useEvents(params?: { repId?: string; status?: string; storeId?: string }, options?: { enabled?: boolean }) {
  return useQuery({
    queryKey: ['events', params ?? {}],
    queryFn:  () => api.getEvents(params),
    enabled:  options?.enabled !== false,
  })
}

export function useCreateEvent() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: api.createEvent,
    onSuccess:  () => qc.invalidateQueries({ queryKey: ['events'] }),
    onError: (err: Error) => toast(err.message, 'error'),
  })
}

export function useUpdateEvent() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, ...data }: { id: string; status?: string; completionNotes?: string; takeaways?: string; accomplishments?: string; hoursWorked?: number; type?: string; title?: string; address?: string; bottlesSold?: number | null; scheduledAt?: string; endTime?: string; notes?: string; contactId?: string; repIds?: string[] }) =>
      api.updateEvent(id, data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['events'] }),
    onError: (err: Error) => toast(err.message, 'error'),
  })
}

export function useDeleteEvent() {
  const qc = useQueryClient()
  return useMutation<{ id: string }, Error, string>({
    mutationFn: (id: string) => api.deleteEvent(id),
    onSuccess:  () => qc.invalidateQueries({ queryKey: ['events'] }),
    onError: (err: Error) => toast(err.message, 'error'),
  })
}

// ─── Alerts ───────────────────────────────────────────────────────────────────

export function useAlerts(params?: { region?: string; status?: string; storeId?: string }) {
  return useQuery({
    queryKey: ['alerts', params ?? {}],
    queryFn:  () => api.getAlerts(params),
  })
}

export function useResolveAlert() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => api.resolveAlert(id),
    onSuccess:  () => {
      qc.invalidateQueries({ queryKey: ['alerts'] })
      qc.invalidateQueries({ queryKey: ['dashboard'] })
    },
  })
}

export function useResolveAllAlerts() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (region?: string) => api.resolveAllAlerts(region),
    onSuccess:  () => {
      qc.invalidateQueries({ queryKey: ['alerts'] })
      qc.invalidateQueries({ queryKey: ['dashboard'] })
    },
  })
}

// ─── Visits ───────────────────────────────────────────────────────────────────

export function useVisits(params?: { storeId?: string; repId?: string; contactId?: string; limit?: string }) {
  return useQuery({
    queryKey: ['visits', params ?? {}],
    queryFn:  () => api.getVisits(params),
  })
}

export function useCreateVisit() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: api.createVisit,
    onSuccess:  (_, vars) => {
      qc.invalidateQueries({ queryKey: ['visits'] })
      qc.invalidateQueries({ queryKey: ['stores', vars.storeId] })
      qc.invalidateQueries({ queryKey: ['stores'] })
      qc.invalidateQueries({ queryKey: ['dashboard'] })
      qc.invalidateQueries({ queryKey: ['events'] })
    },
  })
}

export function useUpdateVisit() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, body }: { id: string; body: Parameters<typeof api.updateVisit>[1] }) =>
      api.updateVisit(id, body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['visits'] })
      qc.invalidateQueries({ queryKey: ['stores'] })
      qc.invalidateQueries({ queryKey: ['dashboard'] })
      qc.invalidateQueries({ queryKey: ['events'] })
    },
  })
}

export function useDeleteVisit() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id }: { id: string; storeId?: string }) => api.deleteVisit(id),
    onSuccess: (_, { storeId }) => {
      qc.invalidateQueries({ queryKey: ['visits'] })
      qc.invalidateQueries({ queryKey: ['stores'] })
      if (storeId) qc.invalidateQueries({ queryKey: ['stores', storeId] })
      qc.invalidateQueries({ queryKey: ['dashboard'] })
      qc.invalidateQueries({ queryKey: ['events'] })
    },
  })
}


// ─── Orders ───────────────────────────────────────────────────────────────────

export function useOrders(params?: { storeId?: string; status?: string }) {
  return useQuery({
    queryKey: ['orders', params ?? {}],
    queryFn:  () => api.getOrders(params),
  })
}

export function useCreateOrder() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: api.createOrder,
    onSuccess:  () => {
      // A delivered order lands on the shelf immediately, so refresh the whole
      // stores cache (list + detail), not just the one store's detail view.
      qc.invalidateQueries({ queryKey: ['orders'] })
      qc.invalidateQueries({ queryKey: ['stores'] })
      qc.invalidateQueries({ queryKey: ['dashboard'] })
    },
  })
}

export function useUpdateOrderStatus() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, status }: { id: string; status: string }) =>
      api.updateOrderStatus(id, status),
    onSuccess: () => {
      // Delivering an order moves bottles inProcess → onShelf on the store,
      // so the stores cache must refresh too (matches useCreateOrder/useDeleteOrder).
      qc.invalidateQueries({ queryKey: ['orders'] })
      qc.invalidateQueries({ queryKey: ['stores'] })
      qc.invalidateQueries({ queryKey: ['dashboard'] })
    },
  })
}

export function useDeleteOrder() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => api.deleteOrder(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['orders'] })
      qc.invalidateQueries({ queryKey: ['stores'] })
      qc.invalidateQueries({ queryKey: ['dashboard'] })
    },
    onError: (err: Error) => toast(err.message, 'error'),
  })
}

// ─── Supplier Orders ──────────────────────────────────────────────────────────

export function useSupplierOrders(params?: { status?: string }) {
  return useQuery({
    queryKey: ['supplierOrders', params ?? {}],
    queryFn:  () => api.getSupplierOrders(params),
  })
}

export function useCreateSupplierOrder() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: api.createSupplierOrder,
    onSuccess:  () => qc.invalidateQueries({ queryKey: ['supplierOrders'] }),
    onError: (err: Error) => toast(err.message, 'error'),
  })
}

export function useUpdateSupplierOrderStatus() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, status }: { id: string; status: string }) =>
      api.updateSupplierOrderStatus(id, status),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['supplierOrders'] }),
    onError: (err: Error) => toast(err.message, 'error'),
  })
}

// ─── Supply Requests ──────────────────────────────────────────────────────────

export function useCreateSupplyRequest() {
  return useMutation({
    mutationFn: api.createSupplyRequest,
    onError: (err: Error) => toast(err.message, 'error'),
  })
}

// ─── Restock Requests (customer portal) ───────────────────────────────────────

export function useRestockRequests(params?: { status?: string; storeId?: string; chainId?: string }) {
  return useQuery({
    queryKey: ['restockRequests', params ?? {}],
    queryFn:  () => api.getRestockRequests(params),
  })
}

export function useUpdateRestockRequestStatus() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, status }: { id: string; status: RestockRequestStatus }) =>
      api.updateRestockRequestStatus(id, status),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['restockRequests'] })
      // Resolving a request also closes its alert.
      qc.invalidateQueries({ queryKey: ['alerts'] })
    },
    onError: (err: Error) => toast(err.message, 'error'),
  })
}

export function useDeleteRestockRequest() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => api.deleteRestockRequest(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['restockRequests'] })
      // Deleting a request also removes the alert it raised.
      qc.invalidateQueries({ queryKey: ['alerts'] })
    },
    onError: (err: Error) => toast(err.message, 'error'),
  })
}

export function useStorePortalToken(storeId: string, enabled = true) {
  return useQuery({
    queryKey: ['storePortalToken', storeId],
    queryFn:  () => api.getStorePortalToken(storeId),
    enabled:  enabled && Boolean(storeId),
    retry:    false,
  })
}

export function useIssueStorePortalToken(storeId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (rotate: boolean) => api.issueStorePortalToken(storeId, rotate),
    onSuccess:  () => qc.invalidateQueries({ queryKey: ['storePortalToken', storeId] }),
    onError:    (err: Error) => toast(err.message, 'error'),
  })
}

export function useChainPortalToken(chainId: string, enabled = true) {
  return useQuery({
    queryKey: ['chainPortalToken', chainId],
    queryFn:  () => api.getChainPortalToken(chainId),
    enabled:  enabled && Boolean(chainId),
    retry:    false,
  })
}

export function useIssueChainPortalToken(chainId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (rotate: boolean) => api.issueChainPortalToken(chainId, rotate),
    onSuccess:  () => qc.invalidateQueries({ queryKey: ['chainPortalToken', chainId] }),
    onError:    (err: Error) => toast(err.message, 'error'),
  })
}
