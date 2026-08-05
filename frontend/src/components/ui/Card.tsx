// src/components/ui/Card.tsx
import { clsx } from 'clsx'

interface CardProps {
  children: React.ReactNode
  className?: string
  padding?: boolean
}

export function Card({ children, className, padding = false }: CardProps) {
  return (
    <div className={clsx(
      'bg-white border border-gray-200 rounded-xl shadow-sm overflow-hidden',
      padding && 'p-5',
      className
    )}>
      {children}
    </div>
  )
}

interface CardHeaderProps {
  title: string
  action?: React.ReactNode
  subtitle?: string
}

export function CardHeader({ title, action, subtitle }: CardHeaderProps) {
  return (
    <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
      <div>
        <h2 className="text-sm font-semibold text-gray-900">{title}</h2>
        {subtitle && <p className="text-xs text-gray-400 mt-0.5">{subtitle}</p>}
      </div>
      {action && <div>{action}</div>}
    </div>
  )
}