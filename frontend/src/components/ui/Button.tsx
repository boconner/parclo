// src/components/ui/Button.tsx
import { clsx } from 'clsx'

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger'

const styles: Record<Variant, string> = {
  primary:   'bg-accent text-white hover:bg-accent-hover',
  secondary: 'bg-accent-light text-accent border border-accent/20 hover:bg-accent/[.12] hover:border-accent/40',
  ghost:     'bg-transparent text-gray-500 border border-gray-200 hover:border-gray-300 hover:text-gray-900 hover:bg-white',
  danger:    'bg-red-50 text-red-600 border border-red-100 hover:bg-red-100',
}

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant
  size?: 'sm' | 'md'
  children: React.ReactNode
}

export function Button({
  variant = 'ghost',
  size = 'md',
  className,
  children,
  ...props
}: ButtonProps) {
  return (
    <button
      {...props}
      className={clsx(
        'inline-flex items-center gap-1.5 font-medium rounded-lg transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed',
        size === 'md' ? 'text-sm px-3.5 py-1.5' : 'text-xs px-3 py-1',
        styles[variant],
        className
      )}
    >
      {children}
    </button>
  )
}