import type { AlertType } from '@/types'

// Presentation for each alert type, shared by the dashboard panel and the store
// detail page. Previously both used a binary ternary that treated anything not
// LOW_STOCK_REP as a supplier reorder — which silently mislabels every type
// added since.

export interface AlertMeta {
  /** Short "Category · Owner" label shown above the message. */
  label: string
  /** Tailwind class for the status dot. */
  dot:   string
  /** Whether this warrants the red, click-through treatment. */
  critical: boolean
}

const FALLBACK: AlertMeta = { label: 'Alert', dot: 'bg-gray-400', critical: false }

const META: Record<AlertType, AlertMeta> = {
  LOW_STOCK_REP:    { label: 'Low Stock · Rep action',      dot: 'bg-red-400',    critical: true  },
  REORDER_SUPPLIER: { label: 'Reorder Signal · Supplier',   dot: 'bg-amber-400',  critical: false },
  VISIT_OVERDUE:    { label: 'Visit Overdue · Rep action',  dot: 'bg-orange-400', critical: false },
  NO_MOVEMENT:      { label: 'Not Moving · Needs attention', dot: 'bg-purple-400', critical: false },
}

export function alertMeta(type: AlertType | string): AlertMeta {
  return META[type as AlertType] ?? FALLBACK
}
