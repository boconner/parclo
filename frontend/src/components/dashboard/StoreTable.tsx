// src/components/dashboard/StoreTable.tsx
import { Link } from 'react-router-dom'
import { clsx } from 'clsx'
import { SupplyBar, StatusPill, statusVariant } from '@/components/ui/SupplyIndicator'
import { DashboardStore } from '@/types'

interface StoreTableProps {
  stores:       DashboardStore[]
  limit?:       number
  onViewAll?:   () => void
}

export function StoreTable({ stores, limit, onViewAll }: StoreTableProps) {
  if (!stores.length) {
    return (
      <div className="py-12 text-center text-sm text-gray-400">
        No stores in this market yet
      </div>
    )
  }

  const visible  = limit ? stores.slice(0, limit) : stores
  const overflow = stores.length - visible.length

  return (
    <>
      <div className="overflow-x-auto">
      <table className="w-full min-w-[560px]">
        <thead>
          <tr className="border-b border-gray-100">
            <th className="w-1 p-0" />
            {['Store', 'Status', 'On Shelf', 'In Process', 'Days Supply', 'Last Visit'].map(h => (
              <th
                key={h}
                className="text-left text-[10px] font-semibold text-gray-400 uppercase tracking-wider px-5 py-2.5"
              >
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-50">
          {visible.map(s => (
            <StoreRow key={s.id} store={s} />
          ))}
        </tbody>
      </table>
      </div>
      {overflow > 0 && onViewAll && (
        <div className="px-5 py-2.5 border-t border-gray-100 bg-gray-50/40">
          <button
            onClick={onViewAll}
            className="text-xs font-medium text-accent hover:underline"
          >
            +{overflow} more stores — view all {stores.length}
          </button>
        </div>
      )}
    </>
  )
}

function StoreRow({ store: s }: { store: DashboardStore }) {
  const isLow    = s.onShelf <= 3
  const isWarn   = s.onShelf === 4
  const variant  = statusVariant(s.daysOfSupply, s.onShelf)

  return (
    <tr className="hover:bg-gray-100 transition-colors cursor-pointer group">
      <td className={clsx(
        'w-1 p-0',
        variant === 'critical' ? 'bg-red-400' : variant === 'low' ? 'bg-amber-400' : 'bg-green-400'
      )} />
      <td className="px-5 py-3">
        <Link to={`/stores/${s.id}`} className="block">
          <p className="text-sm font-medium text-gray-900 group-hover:text-accent transition-colors">
            {s.name}
          </p>
          <p className="text-xs text-gray-400 mt-0.5">
            {s.chainName} · {s.rep}
          </p>
        </Link>
      </td>
      <td className="px-5 py-3">
        <StatusPill days={s.daysOfSupply} onShelf={s.onShelf} />
      </td>
      <td className="px-5 py-3">
        <span className={clsx(
          'text-sm font-semibold',
          isLow ? 'text-red-500' : isWarn ? 'text-amber-600' : 'text-gray-900',
        )}>
          {s.onShelf}
        </span>
      </td>
      <td className="px-5 py-3">
        {s.inProcess > 0
          ? <span className="text-sm font-semibold text-blue-500">{s.inProcess}</span>
          : <span className="text-gray-300 text-sm">—</span>
        }
      </td>
      <td className="px-5 py-3">
        <SupplyBar days={s.daysOfSupply} onShelf={s.onShelf} />
      </td>
      <td className="px-5 py-3">
        <span className="text-xs text-gray-400">
          {s.lastVisit
            ? new Date(s.lastVisit).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
            : 'Never'
          }
        </span>
      </td>
    </tr>
  )
}