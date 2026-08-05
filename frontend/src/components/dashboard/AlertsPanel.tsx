// src/components/dashboard/AlertsPanel.tsx
import { useState, useMemo } from 'react'
import { clsx } from 'clsx'
import { CriticalStoresModal } from '@/components/stores/CriticalStoresModal'
import { Alert } from '@/types'
import { useStores } from '@/hooks/useQueries'
import { alertMeta } from '@/lib/alertMeta'

interface AlertsPanelProps {
  alerts: Alert[]
}

export function AlertsPanel({ alerts }: AlertsPanelProps) {
  const [showCritical, setShowCritical] = useState(false)
  const { data: allStores } = useStores()
  const criticalStores = useMemo(() =>
    (allStores ?? []).filter(s => s.onShelf <= 3)
      .sort((a, b) => a.onShelf - b.onShelf)
  , [allStores])

  return (
    <>
      <div>
        <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
          <h2 className="text-sm font-semibold text-gray-900">
            Active Alerts
            {alerts.length > 0 && (
              <span className="ml-2 bg-red-50 text-red-500 text-[10px] font-bold px-1.5 py-0.5 rounded-full">
                {alerts.length}
              </span>
            )}
          </h2>
        </div>

        {!alerts.length ? (
          <div className="py-10 text-center">
            <div className="w-8 h-8 bg-green-50 rounded-full flex items-center justify-center mx-auto mb-2">
              <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                <path d="M2.5 7.5l3 3 6-6" stroke="#10b981" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
            </div>
            <p className="text-sm text-gray-400">No active alerts</p>
          </div>
        ) : (
          <div className="divide-y divide-gray-50">
            {alerts.map(alert => (
              <AlertRow
                key={alert.id}
                alert={alert}
                onClickCritical={() => setShowCritical(true)}
              />
            ))}
          </div>
        )}
      </div>

      <CriticalStoresModal open={showCritical} onClose={() => setShowCritical(false)} stores={criticalStores} />
    </>
  )
}

function AlertRow({
  alert,
  onClickCritical,
}: {
  alert: Alert
  onClickCritical: () => void
}) {
  const meta       = alertMeta(alert.type)
  const isCritical = meta.critical

  return (
    <button
      onClick={isCritical ? onClickCritical : undefined}
      className={clsx(
        'w-full text-left px-5 py-3.5 transition-colors group',
        isCritical ? 'hover:bg-red-50/60 cursor-pointer' : 'hover:bg-gray-50 cursor-default'
      )}
    >
      <div className="flex items-center gap-1.5 mb-1">
        <span className={clsx('w-1.5 h-1.5 rounded-full flex-shrink-0', meta.dot)} />
        <span className="text-[10px] font-medium text-gray-400">{meta.label}</span>
        {isCritical && (
          <span className="ml-auto text-[10px] text-accent opacity-0 group-hover:opacity-100 transition-opacity">
            View stores →
          </span>
        )}
      </div>
      <div className="flex items-start justify-between gap-3">
        <p className="text-sm font-medium text-gray-900 leading-snug">
          {alert.store?.name ?? 'Total Region Inventory'}
        </p>
        <span className="text-[10px] text-gray-400 flex-shrink-0">
          {new Date(alert.triggeredAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
        </span>
      </div>
      <p className="text-xs text-gray-500 mt-0.5">{alert.message}</p>
    </button>
  )
}
