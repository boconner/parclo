import { useState, useEffect, useRef, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { clsx } from 'clsx'
import { useStores, useChains } from '@/hooks/useQueries'

interface Result {
  id: string
  label: string
  sublabel: string
  category: 'Store' | 'Chain'
  href: string
  initial: string
  accent: boolean
}

interface CommandPaletteProps {
  open: boolean
  onClose: () => void
}

export function CommandPalette({ open, onClose }: CommandPaletteProps) {
  const [query, setQuery] = useState('')
  const [selected, setSelected] = useState(0)
  const navigate = useNavigate()
  const inputRef = useRef<HTMLInputElement>(null)
  const listRef = useRef<HTMLDivElement>(null)

  const { data: apiStores } = useStores()
  const { data: apiChains } = useChains()

  const allResults = useMemo<Result[]>(() => {
    const stores: Result[] = (apiStores ?? []).map(s => ({
      id: `store-${s.id}`,
      label: s.name,
      sublabel: `${s.chainName} · ${s.regionName} · ${s.rep}`,
      category: 'Store',
      href: `/stores/${s.id}`,
      initial: s.name.charAt(0),
      accent: false,
    }))
    const chains: Result[] = (apiChains ?? []).map(c => ({
      id: `chain-${c.id}`,
      label: c.name,
      sublabel: `${c._count.stores} stores`,
      category: 'Chain',
      href: `/stores?chain=${c.id}`,
      initial: c.name.charAt(0),
      accent: true,
    }))
    return [...chains, ...stores]
  }, [apiStores, apiChains])

  const results = useMemo(() => {
    if (!query.trim()) return allResults.slice(0, 8)
    const q = query.toLowerCase()
    return allResults.filter(r =>
      r.label.toLowerCase().includes(q) || r.sublabel.toLowerCase().includes(q)
    ).slice(0, 10)
  }, [query, allResults])

  useEffect(() => {
    if (open) {
      setQuery('')
      setSelected(0)
      setTimeout(() => inputRef.current?.focus(), 50)
    }
  }, [open])

  useEffect(() => { setSelected(0) }, [results])

  useEffect(() => {
    const el = listRef.current?.children[selected] as HTMLElement | undefined
    el?.scrollIntoView({ block: 'nearest' })
  }, [selected])

  function commit(result: Result) {
    navigate(result.href)
    onClose()
  }

  function handleKey(e: React.KeyboardEvent) {
    if (e.key === 'ArrowDown') { e.preventDefault(); setSelected(i => Math.min(i + 1, results.length - 1)) }
    if (e.key === 'ArrowUp')   { e.preventDefault(); setSelected(i => Math.max(i - 1, 0)) }
    if (e.key === 'Enter' && results[selected]) commit(results[selected])
    if (e.key === 'Escape') onClose()
  }

  if (!open) return null

  return (
    <div className="fixed inset-0 z-[70] flex items-start justify-center pt-[15vh] px-4">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} />
      <div className="relative w-full max-w-lg bg-white rounded-2xl shadow-2xl overflow-hidden animate-in fade-in-0 zoom-in-95 duration-150">
        <div className="flex items-center gap-3 px-4 py-3.5 border-b border-gray-100">
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none" className="text-gray-400 flex-shrink-0">
            <circle cx="7" cy="7" r="5" stroke="currentColor" strokeWidth="1.5"/>
            <path d="M11 11l3 3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
          </svg>
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={e => setQuery(e.target.value)}
            onKeyDown={handleKey}
            placeholder="Search stores, chains…"
            className="flex-1 text-sm text-gray-900 placeholder:text-gray-400 outline-none bg-transparent"
          />
          <kbd className="hidden sm:flex items-center gap-0.5 text-[10px] font-medium text-gray-400 bg-gray-100 px-1.5 py-0.5 rounded">
            ESC
          </kbd>
        </div>
        <div ref={listRef} className="max-h-80 overflow-y-auto py-2">
          {results.length === 0 ? (
            <p className="px-4 py-6 text-center text-sm text-gray-400">No results for "{query}"</p>
          ) : (
            results.map((r, i) => (
              <button
                key={r.id}
                onClick={() => commit(r)}
                onMouseEnter={() => setSelected(i)}
                className={clsx(
                  'w-full flex items-center gap-3 px-4 py-2.5 text-left transition-colors',
                  i === selected ? 'bg-accent-light' : 'hover:bg-gray-50'
                )}
              >
                <div className={clsx(
                  'w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0 text-xs font-bold',
                  r.accent
                    ? (i === selected ? 'bg-accent text-white' : 'bg-accent-light text-accent')
                    : (i === selected ? 'bg-accent/20 text-accent' : 'bg-gray-100 text-gray-500')
                )}>
                  {r.initial}
                </div>
                <div className="flex-1 min-w-0">
                  <p className={clsx('text-sm font-medium truncate', i === selected ? 'text-accent' : 'text-gray-900')}>
                    {r.label}
                  </p>
                  <p className="text-xs text-gray-400 truncate">{r.sublabel}</p>
                </div>
                <span className={clsx(
                  'text-[10px] font-semibold px-1.5 py-0.5 rounded-full flex-shrink-0',
                  r.category === 'Chain' ? 'bg-accent-light text-accent' : 'bg-gray-100 text-gray-500'
                )}>
                  {r.category}
                </span>
              </button>
            ))
          )}
        </div>
        <div className="px-4 py-2.5 border-t border-gray-100 flex items-center gap-4 bg-gray-50/60">
          <span className="text-[10px] text-gray-400 flex items-center gap-1">
            <kbd className="bg-white border border-gray-200 rounded px-1 py-0.5 font-mono text-[9px]">↑↓</kbd> navigate
          </span>
          <span className="text-[10px] text-gray-400 flex items-center gap-1">
            <kbd className="bg-white border border-gray-200 rounded px-1 py-0.5 font-mono text-[9px]">↵</kbd> open
          </span>
          <span className="text-[10px] text-gray-400 flex items-center gap-1">
            <kbd className="bg-white border border-gray-200 rounded px-1 py-0.5 font-mono text-[9px]">ESC</kbd> close
          </span>
        </div>
      </div>
    </div>
  )
}
