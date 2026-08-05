import { useState, useMemo } from 'react'
import { Link } from 'react-router-dom'
import { clsx } from 'clsx'
import { Button } from '@/components/ui/Button'
import { toast } from '@/components/ui/Toast'
import { useRestockRequests, useUpdateRestockRequestStatus, useDeleteRestockRequest, useChains } from '@/hooks/useQueries'
import type { RestockRequest, RestockRequestStatus, StockLevel } from '@/lib/api'

// Internal triage queue for requests submitted by retail staff through the
// in-store QR portal. Region-scoped by the API, so a rep only sees their own.

const STOCK_META: Record<StockLevel, { label: string; className: string }> = {
  well_stocked: { label: '🙂 Good',        className: 'bg-green-50 text-green-700 border-green-200' },
  getting_low:  { label: '😐 Low',         className: 'bg-amber-50 text-amber-700 border-amber-200' },
  // Only on rows submitted before the form moved to three faces.
  almost_out:   { label: 'Almost out',     className: 'bg-orange-50 text-orange-700 border-orange-200' },
  out_of_stock: { label: '🙁 Out of stock', className: 'bg-red-50 text-red-700 border-red-200' },
}

const MATERIAL_LABELS: Record<string, string> = {
  shelf_talkers: 'Shelf talkers',
  menus:         'Menus / table tents',
  case_cards:    'Case cards',
  coasters:      'Coasters',
  swag:          'Branded swag',
}

const STATUS_TABS: { value: RestockRequestStatus | 'all'; label: string }[] = [
  { value: 'new_request',  label: 'New' },
  { value: 'acknowledged', label: 'Working' },
  { value: 'resolved',     label: 'Resolved' },
  { value: 'all',          label: 'All' },
]

function relativeTime(iso: string): string {
  const diffMs = Date.now() - new Date(iso).getTime()
  const mins   = Math.round(diffMs / 60000)
  if (mins < 1)    return 'just now'
  if (mins < 60)   return `${mins}m ago`
  const hours = Math.round(mins / 60)
  if (hours < 24)  return `${hours}h ago`
  const days = Math.round(hours / 24)
  if (days < 30)   return `${days}d ago`
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

export default function Requests() {
  const [tab, setTab]                 = useState<RestockRequestStatus | 'all'>('new_request')
  const [chainFilter, setChainFilter] = useState('all')

  const { data, isLoading } = useRestockRequests({
    ...(tab === 'all' ? {} : { status: tab }),
    ...(chainFilter === 'all' ? {} : { chainId: chainFilter }),
  })
  // Separate query for the tab badge: deriving the count from the visible list
  // made it drop to 0 the moment you switched to Working/Resolved. Same key as
  // the sidebar badge, so this is a cache hit, not an extra request.
  const { data: openRequests } = useRestockRequests({ status: 'new_request' })
  const { data: apiChains } = useChains()
  const updateStatus   = useUpdateRestockRequestStatus()
  const deleteRequest  = useDeleteRestockRequest()

  const requests  = useMemo(() => data ?? [], [data])
  const chains    = apiChains ?? []
  const openCount = openRequests?.length ?? 0

  return (
    <div className="p-4 lg:p-8">

      <div className="flex flex-wrap items-start justify-between gap-3 mb-6">
        <div>
          <h1 className="text-xl font-semibold text-gray-900 tracking-tight">Store Requests</h1>
          <p className="text-sm text-gray-400 mt-0.5">
            Submitted by retail staff via the in-store QR code
          </p>
        </div>
      </div>

      {/* Status tabs */}
      <div className="flex items-center gap-1 mb-5 border-b border-gray-200">
        {STATUS_TABS.map(t => (
          <button
            key={t.value}
            onClick={() => setTab(t.value)}
            className={clsx(
              'px-3.5 py-2 text-sm font-medium border-b-2 -mb-px transition-colors',
              tab === t.value
                ? 'border-accent text-accent'
                : 'border-transparent text-gray-500 hover:text-gray-900',
            )}
          >
            {t.label}
            {t.value === 'new_request' && openCount > 0 && (
              <span className="ml-1.5 inline-flex items-center justify-center min-w-[18px] h-[18px] px-1 rounded-full bg-accent text-white text-[10px] font-semibold">
                {openCount}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* Chain filter — different chains often mean different distributors and
          different people to chase, so triaging by chain is the common case. */}
      <div className="flex flex-wrap items-center gap-3 mb-5">
        <select
          value={chainFilter}
          onChange={e => setChainFilter(e.target.value)}
          className="px-3 py-2 text-sm bg-white border border-gray-200 rounded-lg outline-none focus:border-accent focus:ring-2 focus:ring-accent/10 text-gray-600"
        >
          <option value="all">All chains</option>
          {chains.map(c => (
            <option key={c.id} value={c.id}>{c.name}</option>
          ))}
        </select>
        {chainFilter !== 'all' && (
          <button
            onClick={() => setChainFilter('all')}
            className="text-xs text-gray-400 hover:text-gray-900"
          >
            Clear
          </button>
        )}
      </div>

      {isLoading ? (
        <p className="text-sm text-gray-400 py-12 text-center">Loading…</p>
      ) : requests.length === 0 ? (
        <div className="bg-white border border-gray-200 rounded-xl py-16 text-center">
          <div className="w-10 h-10 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-3">
            <svg width="18" height="18" viewBox="0 0 20 20" fill="none" stroke="#9ca3af" strokeWidth="1.6">
              <rect x="3" y="3" width="14" height="14" rx="2" />
              <path d="M7 9h6M7 12h4" strokeLinecap="round" />
            </svg>
          </div>
          <p className="text-sm text-gray-500 font-medium">No requests here</p>
          {/* Points at where codes are made without putting generation here —
              that stays admin-only under Configuration. */}
          <p className="text-xs text-gray-400 mt-1">
            Store codes are printed from a store's detail page; chain codes from
            Configuration → Chains.
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {requests.map(r => (
            <RequestCard
              key={r.id}
              request={r}
              busy={updateStatus.isPending || deleteRequest.isPending}
              onStatus={status => updateStatus.mutate({ id: r.id, status })}
              onDelete={() => deleteRequest.mutate(r.id, {
                onSuccess: () => toast('Request deleted', 'success'),
              })}
            />
          ))}
        </div>
      )}
    </div>
  )
}

function RequestCard({
  request: r, busy, onStatus, onDelete,
}: {
  request: RestockRequest
  busy: boolean
  onStatus: (status: RestockRequestStatus) => void
  onDelete: () => void
}) {
  const [confirmDelete, setConfirmDelete] = useState(false)
  const stock = STOCK_META[r.stockLevel]

  return (
    <div className="bg-white border border-gray-200 rounded-xl p-4 lg:p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            {/* A chain-wide request has no location to link to */}
            {r.storeId ? (
              <Link
                to={`/stores/${r.storeId}`}
                className="text-sm font-semibold text-gray-900 hover:text-accent truncate"
              >
                {/* Chain first: a chain store's name is only its city */}
                {r.chainName && <span className="text-gray-500">{r.chainName} · </span>}
                {r.storeName}
              </Link>
            ) : (
              <span className="text-sm font-semibold text-gray-900 truncate">
                {r.chainName ?? 'Unknown chain'}
                <span className="text-gray-500 font-normal"> · all locations</span>
              </span>
            )}
            {r.source === 'chain_qr' && (
              <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full border bg-purple-50 text-purple-700 border-purple-200">
                Chain HQ
              </span>
            )}
            <span className={clsx('text-[11px] font-semibold px-2 py-0.5 rounded-full border', stock.className)}>
              {stock.label}
              {r.bottlesLeft != null && ` · ~${r.bottlesLeft} on shelf`}
            </span>
            {r.casesRequested != null && r.casesRequested > 0 && (
              <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full border bg-accent-light text-accent border-accent/20">
                {r.casesRequested} case{r.casesRequested === 1 ? '' : 's'} requested
              </span>
            )}
            {r.status === 'resolved' && (
              <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full border bg-green-50 text-green-700 border-green-200">
                Resolved
              </span>
            )}
            {r.status === 'acknowledged' && (
              <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full border bg-blue-50 text-blue-700 border-blue-200">
                Working
              </span>
            )}
          </div>

          <p className="text-xs text-gray-400 mt-1">
            {relativeTime(r.createdAt)}
            {r.repName && <> · Rep: {r.repName}</>}
            {r.submitterName && <> · From: {r.submitterName}</>}
            {r.submitterEmail && (
              <> · <a href={`mailto:${r.submitterEmail}`} className="text-accent hover:underline">
                {r.submitterEmail}
              </a></>
            )}
            {/* Chain-wide requests have no owning rep by design, so don't nag */}
            {!r.repName && r.storeId && (
              <> · <span className="text-amber-600">No rep assigned</span></>
            )}
          </p>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          {confirmDelete ? (
            <div className="flex items-center gap-2">
              <span className="text-xs text-gray-500">Delete permanently?</span>
              <Button size="sm" variant="danger" disabled={busy} onClick={onDelete}>
                {busy ? 'Deleting…' : 'Delete'}
              </Button>
              <button
                onClick={() => setConfirmDelete(false)}
                className="text-xs text-gray-400 hover:text-gray-600"
              >
                Cancel
              </button>
            </div>
          ) : (
            <>
          {r.status !== 'acknowledged' && r.status !== 'resolved' && (
            <Button size="sm" variant="secondary" disabled={busy}
              onClick={() => onStatus('acknowledged')}>
              Mark working
            </Button>
          )}
          {r.status !== 'resolved' && (
            <Button size="sm" variant="primary" disabled={busy}
              onClick={() => onStatus('resolved')}>
              Resolve
            </Button>
          )}
          {r.status === 'resolved' && (
            <Button size="sm" variant="ghost" disabled={busy}
              onClick={() => onStatus('new_request')}>
              Reopen
            </Button>
          )}
              {/* Requests arrive from a public form, so spam and duplicates
                  need removing outright, not just resolving. */}
              <button
                onClick={() => setConfirmDelete(true)}
                disabled={busy}
                aria-label="Delete request"
                title="Delete request"
                className="p-1.5 text-gray-300 hover:text-red-600 disabled:opacity-40 transition-colors"
              >
                <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
                  <path d="M2.5 4h11M6 4V2.5h4V4M4 4l.6 9a1 1 0 001 1h4.8a1 1 0 001-1L12 4" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
              </button>
            </>
          )}
        </div>
      </div>

      {(r.wantsRepVisit || r.materials.length > 0 || r.note) && (
        <div className="mt-3 pt-3 border-t border-gray-100 space-y-2">
          {r.wantsRepVisit && (
            <p className="text-xs font-medium text-indigo-700 bg-indigo-50 border border-indigo-100 rounded-lg px-2.5 py-1.5 inline-block">
              🚗 Asked for a rep visit
            </p>
          )}
          {r.materials.length > 0 && (
            <p className="text-xs text-gray-600">
              <span className="text-gray-400">POS materials: </span>
              {r.materials.map(m => MATERIAL_LABELS[m] ?? m).join(', ')}
            </p>
          )}
          {r.note && (
            <p className="text-xs text-gray-600 bg-gray-50 border border-gray-100 rounded-lg px-3 py-2">
              “{r.note}”
            </p>
          )}
        </div>
      )}
    </div>
  )
}
