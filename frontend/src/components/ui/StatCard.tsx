// src/components/ui/StatCard.tsx
import { clsx } from 'clsx'
 
interface StatCardProps {
  label: string
  value: number | string
  sub?: React.ReactNode
  valueColor?: string
  onClick?: () => void
}

export function StatCard({ label, value, sub, valueColor = 'text-gray-900', onClick }: StatCardProps) {
  return (
    <div
      onClick={onClick}
      className={clsx(
        'bg-white border border-gray-200 rounded-xl p-5 shadow-sm',
        onClick && 'cursor-pointer hover:border-accent/40 hover:shadow-md transition-all',
      )}
    >
      <p className="text-xs font-medium text-gray-500 mb-2">{label}</p>
      <p className={clsx('text-3xl font-semibold tracking-tight leading-none mb-2', valueColor)}>
        {value}
      </p>
      {sub && <div className="text-xs text-gray-400">{sub}</div>}
      {onClick && <p className="text-xs text-accent mt-1.5 font-medium">View list →</p>}
    </div>
  )
}