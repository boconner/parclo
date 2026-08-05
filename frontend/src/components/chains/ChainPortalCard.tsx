import { PortalQrCard } from '@/components/portal/PortalQrCard'
import { useChainPortalToken, useIssueChainPortalToken } from '@/hooks/useQueries'

// Chain-level QR panel, shown on the chain admin page. The resulting code goes
// to an HQ buyer who covers many locations rather than being left in one store.

export function ChainPortalCard({
  chainId, chainName, isAdmin,
}: {
  chainId:   string
  chainName: string
  isAdmin:   boolean
}) {
  const tokenQuery = useChainPortalToken(chainId, isAdmin)
  const issue      = useIssueChainPortalToken(chainId)

  if (!isAdmin) return null

  return (
    <PortalQrCard
      kind="chain"
      title={chainName}
      subtitle={null}
      tokenQuery={tokenQuery}
      issue={issue}
      rotateWarning={
        'Rotating invalidates the code already shared with this chain. ' +
        "You'll need to send the buyer a new one."
      }
    />
  )
}
