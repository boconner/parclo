// src/components/ui/SupplyIndicator.tsx
import { clsx } from 'clsx'

export function statusVariant(days: number | null, onShelf?: number): 'critical' | 'low' | 'good' {
  if (onShelf !== undefined) {
    if (onShelf <= 3) return 'critical'
    if (onShelf === 4) return 'low'
    return 'good'
  }
  if (days === null) return 'good'
  if (days < 7)  return 'critical'
  if (days < 10) return 'low'
  return 'good'
}

export const statusColor = {
  critical: 'text-red-500',
  low:      'text-amber-600',
  good:     'text-green-600',
}

export const statusBarColor = {
  critical: 'bg-red-500',
  low:      'bg-amber-400',
  good:     'bg-green-500',
}

export const statusPillClass = {
  critical: 'bg-red-50 text-red-500',
  low:      'bg-amber-50 text-amber-700',
  good:     'bg-green-50 text-green-700',
}

export const statusLabel = {
  critical: 'Critical',
  low:      'Needs Attention',
  good:     'Good',
}

// Mini progress bar + days label
export function SupplyBar({ days, onShelf }: { days: number | null; onShelf?: number }) {
  const variant = statusVariant(days, onShelf)
  const pct = days !== null && days > 0 ? Math.min(100, (days / 30) * 100) : 0

  return (
    <div className="flex items-center gap-2">
      <div className="w-12 h-1 bg-gray-100 rounded overflow-hidden flex-shrink-0">
        <div
          className={clsx('h-full rounded transition-all', statusBarColor[variant])}
          style={{ width: `${pct}%` }}
        />
      </div>
      <span className={clsx('text-xs font-medium tabular-nums', statusColor[variant])}>
        {days !== null ? `${Math.round(days)}d` : '—'}
      </span>
    </div>
  )
}

// Rounded pill status label
export function StatusPill({ days, onShelf }: { days: number | null; onShelf?: number }) {
  const variant = statusVariant(days, onShelf)
  return (
    <span className={clsx(
      'inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold',
      statusPillClass[variant]
    )}>
      {statusLabel[variant]}
    </span>
  )
}