import { useMemo } from 'react'
import { clsx } from 'clsx'
import type { DashboardStore } from '@/types'

// ─── generic FilterBar ────────────────────────────────────────────────────────

interface FilterBarItem {
  slug:  string
  name:  string
  count: number
}

interface FilterBarProps {
  active:    string
  onChange:  (slug: string) => void
  allLabel:  string
  allCount:  number
  items:     FilterBarItem[]
}

export function FilterBar({ active, onChange, allLabel, allCount, items }: FilterBarProps) {
  return (
    <div className="flex items-center gap-1 bg-white border border-gray-200 rounded-xl p-1.5 mb-3 overflow-x-auto scrollbar-hide touch-pan-x shadow-sm">
      <FilterChip
        label={allLabel}
        count={allCount}
        active={active === 'all'}
        onClick={() => onChange('all')}
      />
      <div className="w-px h-5 bg-gray-100 flex-shrink-0 mx-0.5" />
      {items.map(item => (
        <FilterChip
          key={item.slug}
          label={item.name}
          count={item.count}
          active={active === item.slug}
          onClick={() => onChange(item.slug)}
        />
      ))}
    </div>
  )
}

function FilterChip({ label, count, active, onClick }: {
  label: string; count: number; active: boolean; onClick: () => void
}) {
  return (
    <button
      onClick={onClick}
      className={clsx(
        'flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium',
        'whitespace-nowrap transition-all flex-shrink-0',
        active
          ? 'bg-accent text-white'
          : 'text-gray-500 hover:bg-gray-100 hover:text-gray-800'
      )}
    >
      {label}
      <span className={clsx(
        'text-[10px] font-bold min-w-[16px] h-4 px-1 rounded-full flex items-center justify-center',
        active ? 'bg-white/20 text-white' : 'bg-gray-100 text-gray-400'
      )}>
        {count}
      </span>
    </button>
  )
}

// ─── MarketBar (adapter over FilterBar, backward-compatible) ─────────────────

interface Market {
  slug: string
  name: string
  _count?: { stores: number }
}

interface MarketBarProps {
  active:      string
  onChange:    (slug: string) => void
  storeCounts: Record<string, number>
  markets:     Market[]
}

export function MarketBar({ active, onChange, storeCounts, markets }: MarketBarProps) {
  const totalCount = Object.values(storeCounts).reduce((a, b) => a + b, 0)
  const items: FilterBarItem[] = markets.map(m => ({  // prop kept as "markets" for caller compat
    slug:  m.slug,
    name:  m.name,
    count: m._count?.stores ?? storeCounts[m.slug] ?? 0,
  }))
  return (
    <FilterBar
      active={active}
      onChange={onChange}
      allLabel="All Regions"
      allCount={totalCount}
      items={items}
    />
  )
}

// ─── ChainBar ─────────────────────────────────────────────────────────────────
// Derives chain counts dynamically from the stores passed in (which should
// already be filtered by market so counts reflect the active market context).

interface ChainBarProps {
  active:  string
  onChange:(chainId: string) => void
  stores:  DashboardStore[]  // market-filtered stores to count against
}

export function ChainBar({ active, onChange, stores }: ChainBarProps) {
  const items = useMemo<FilterBarItem[]>(() => {
    const map: Map<string, { name: string; count: number }> = new Map()
    for (const s of stores) {
      const key  = s.chainId   ?? 'independent'
      const name = s.chainName ?? 'Independent'
      const e = map.get(key)
      if (e) e.count++
      else map.set(key, { name, count: 1 })
    }
    return Array.from(map.entries()).map(([id, { name, count }]) => ({ slug: id, name, count }))
  }, [stores])

  return (
    <FilterBar
      active={active}
      onChange={onChange}
      allLabel="All Chains"
      allCount={stores.length}
      items={items}
    />
  )
}
