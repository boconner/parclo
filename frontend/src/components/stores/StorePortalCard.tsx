import { PortalQrCard } from '@/components/portal/PortalQrCard'
import { useStorePortalToken, useIssueStorePortalToken } from '@/hooks/useQueries'

// Per-store QR panel on the store detail page.

export function StorePortalCard({
  storeId, storeName, chainName, isAdmin,
}: {
  storeId:   string
  storeName: string
  /** Shown on the printed card so the right card reaches the right location. */
  chainName: string | null
  isAdmin:   boolean
}) {
  const tokenQuery = useStorePortalToken(storeId, isAdmin)
  const issue      = useIssueStorePortalToken(storeId)

  // Reps can't mint tokens, so the panel is admin-only.
  if (!isAdmin) return null

  return (
    <PortalQrCard
      kind="store"
      title={storeName}
      subtitle={chainName}
      tokenQuery={tokenQuery}
      issue={issue}
      rotateWarning={
        "Rotating invalidates every printed copy of this store's QR code. " +
        "You'll need to print and deliver a new card."
      }
    />
  )
}
