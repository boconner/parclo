import { clsx } from 'clsx'

export type SortDir = 'asc' | 'desc'

/** Sortable-column indicator: ↑/↓ when active, ↕ when not. */
export function SortIcon({ active, dir }: { active: boolean; dir: SortDir }) {
  return (
    <span className={clsx('ml-1 inline-block transition-colors', active ? 'text-accent' : 'text-gray-300')}>
      {active ? (dir === 'asc' ? '↑' : '↓') : '↕'}
    </span>
  )
}
