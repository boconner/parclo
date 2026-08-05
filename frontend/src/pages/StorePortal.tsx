import { useParams } from 'react-router-dom'
import { useQuery, useMutation } from '@tanstack/react-query'
import { api, type PortalStore } from '@/lib/api'
import {
  RestockForm, PortalShell, PortalSuccess, PortalNotFound,
  type RestockFormValues,
} from '@/components/portal/RestockForm'

// Per-store portal reached by scanning the QR code a rep leaves in-store.
// No sign-in: the token in the URL identifies the store.

export default function StorePortal() {
  const { token = '' } = useParams()

  const storeQuery = useQuery({
    queryKey: ['portal-store', token],
    queryFn:  () => api.getPortalStore(token),
    retry:    false,
    enabled:  token.length > 0,
  })

  if (storeQuery.isLoading) {
    return <PortalShell><p className="text-sm text-gray-400 text-center py-12">Loading…</p></PortalShell>
  }
  if (storeQuery.isError || !storeQuery.data) return <PortalNotFound />

  return <StoreForm token={token} store={storeQuery.data} />
}

function StoreForm({ token, store }: { token: string; store: PortalStore }) {
  const submit = useMutation({
    mutationFn: (v: RestockFormValues) => api.submitPortalRestock(token, v),
  })

  if (submit.isSuccess) return <PortalSuccess copySentTo={submit.data?.copySentTo} />

  return (
    <PortalShell>
      <RestockForm
        materials={store.materials}
        isPending={submit.isPending}
        error={submit.isError ? (submit.error as Error).message : null}
        onSubmit={v => submit.mutate(v)}
        header={
          // Chain leads: for a chain store, storeName is only the city.
          <div>
            <p className="text-[11px] font-semibold text-accent uppercase tracking-wider">
              {store.chain ?? 'Store Request'}
            </p>
            <h1 className="text-xl font-semibold text-gray-900 mt-1">{store.storeName}</h1>
            {store.address && <p className="text-sm text-gray-500 mt-0.5">{store.address}</p>}
          </div>
        }
      />
    </PortalShell>
  )
}
