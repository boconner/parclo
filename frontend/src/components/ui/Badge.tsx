// src/components/ui/Badge.tsx
import { clsx } from 'clsx'
 
type Variant = 'red' | 'amber' | 'green' | 'blue' | 'muted'
 
const styles: Record<Variant, string> = {
  red:   'bg-red-50 text-red-500',
  amber: 'bg-amber-50 text-amber-700',
  green: 'bg-green-50 text-green-700',
  blue:  'bg-blue-50 text-blue-600',
  muted: 'bg-gray-100 text-gray-400',
}
 
interface BadgeProps {
  children: React.ReactNode
  variant?: Variant
  className?: string
}
 
export function Badge({ children, variant = 'muted', className }: BadgeProps) {
  return (
    <span className={clsx(
      'inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold',
      styles[variant],
      className
    )}>
      {children}
    </span>
  )
}