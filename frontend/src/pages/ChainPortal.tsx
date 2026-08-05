import { useState } from 'react'
import { useParams } from 'react-router-dom'
import { useQuery, useMutation } from '@tanstack/react-query'
import { api, type PortalChain } from '@/lib/api'
import { useBrand } from '@/lib/brand'
import {
  RestockForm, PortalShell, PortalSuccess, PortalNotFound,
  type RestockFormValues,
} from '@/components/portal/RestockForm'

// Chain-level portal for an HQ buyer covering many locations. Same form as the
// per-store portal, plus a location choice: they can file for one location or
// chain-wide when the whole account is running low.

const CHAIN_WIDE = '__chain_wide__'

export default function ChainPortal() {
  const { token = '' } = useParams()

  const chainQuery = useQuery({
    queryKey: ['portal-chain', token],
    queryFn:  () => api.getPortalChain(token),
    retry:    false,
    enabled:  token.length > 0,
  })

  if (chainQuery.isLoading) {
    return <PortalShell><p className="text-sm text-gray-400 text-center py-12">Loading…</p></PortalShell>
  }
  if (chainQuery.isError || !chainQuery.data) return <PortalNotFound />

  return <ChainForm token={token} chain={chainQuery.data} />
}

function ChainForm({ token, chain }: { token: string; chain: PortalChain }) {
  const brand = useBrand()
  // Defaults to unselected rather than chain-wide: an HQ buyer usually has a
  // specific location in mind, and an accidental chain-wide request is noisier
  // to triage than a missing one.
  const [locationId, setLocationId] = useState('')

  const submit = useMutation({
    mutationFn: (v: RestockFormValues) => api.submitChainPortalRestock(token, {
      ...v,
      storeId: locationId === CHAIN_WIDE ? null : locationId,
    }),
  })

  if (submit.isSuccess) return <PortalSuccess copySentTo={submit.data?.copySentTo} />

  return (
    <PortalShell>
      <RestockForm
        materials={chain.materials}
        canSubmit={locationId !== ''}
        isPending={submit.isPending}
        error={submit.isError ? (submit.error as Error).message : null}
        onSubmit={v => submit.mutate(v)}
        header={
          <div>
            <p className="text-[11px] font-semibold text-accent uppercase tracking-wider">
              {chain.chain}
            </p>
            <h1 className="text-xl font-semibold text-gray-900 mt-1">Request more {brand.brandName}</h1>
            <p className="text-sm text-gray-500 mt-0.5">
              Tell us which location needs attention.
            </p>
          </div>
        }
        locationPicker={
          <div>
            <label htmlFor="location" className="block text-sm font-semibold text-gray-900 mb-2">
              Which location?
            </label>
            <select
              id="location"
              value={locationId}
              onChange={e => setLocationId(e.target.value)}
              className="w-full rounded-xl border-2 border-gray-200 px-4 py-3 text-sm bg-white focus:border-accent focus:outline-none"
            >
              <option value="" disabled>Choose a location…</option>
              <option value={CHAIN_WIDE}>All locations (chain-wide)</option>
              {chain.locations.map(l => (
                <option key={l.id} value={l.id}>{l.label}</option>
              ))}
            </select>
            {locationId === CHAIN_WIDE && (
              <p className="text-xs text-gray-500 mt-2">
                We'll treat this as an account-wide signal rather than one store.
              </p>
            )}
          </div>
        }
      />
    </PortalShell>
  )
}
