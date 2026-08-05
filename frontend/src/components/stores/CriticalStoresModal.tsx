import { Link } from 'react-router-dom'
import { Modal } from '@/components/ui/Modal'
import { StatusPill, statusVariant } from '@/components/ui/SupplyIndicator'
import type { DashboardStore } from '@/types'

export function CriticalStoresModal({
  open,
  onClose,
  stores,
}: {
  open: boolean
  onClose: () => void
  stores: DashboardStore[]
}) {
  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Low Stock"
      subtitle={`${stores.length} store${stores.length !== 1 ? 's' : ''} need attention`}
    >
      <div className="px-6 py-2 divide-y divide-gray-50 max-h-[60vh] overflow-y-auto">
        {stores.length === 0 ? (
          <p className="py-8 text-center text-sm text-gray-400">No critical stores</p>
        ) : (
          stores.map(store => (
            <Link
              key={store.id}
              to={`/stores/${store.id}`}
              onClick={onClose}
              className="flex items-center justify-between gap-4 py-3.5 group"
            >
              <div className="flex items-center gap-3 min-w-0">
                <div className={`w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 ${statusVariant(store.daysOfSupply, store.onShelf) === 'critical' ? 'bg-red-50' : 'bg-amber-50'}`}>
                  <span className={`text-xs font-bold ${statusVariant(store.daysOfSupply, store.onShelf) === 'critical' ? 'text-red-400' : 'text-amber-500'}`}>{store.name.charAt(0)}</span>
                </div>
                <div className="min-w-0">
                  <p className="text-sm font-medium text-gray-900 truncate group-hover:text-accent transition-colors">
                    {store.name}
                  </p>
                  <p className="text-xs text-gray-400 truncate">
                    {store.chainName} · {store.regionName} · {store.rep}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-3 flex-shrink-0">
                <StatusPill days={store.daysOfSupply} onShelf={store.onShelf} />
                <svg width="14" height="14" viewBox="0 0 14 14" fill="none" className="text-gray-300 group-hover:text-accent transition-colors">
                  <path d="M5 2l5 5-5 5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
              </div>
            </Link>
          ))
        )}
      </div>
      <div className="px-6 py-4 border-t border-gray-100 bg-gray-50/50 rounded-b-2xl">
        <p className="text-xs text-gray-400">Sorted by bottles on shelf — lowest first</p>
      </div>
    </Modal>
  )
}
