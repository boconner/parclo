import { useState, useMemo } from 'react'
import { clsx } from 'clsx'
import { Modal } from '@/components/ui/Modal'
import { SortIcon, type SortDir } from '@/components/ui/SortIcon'
import type { StoreVisit, VisitAction } from '@/types'

// ─── badge metadata (matches the Visit Log timeline) ──────────────────────────

const ACTION_META: Record<VisitAction, { label: string; color: string; bg: string }> = {
  'stocked':        { label: 'Stocked',       color: 'text-green-700', bg: 'bg-green-50'  },
  'checked':        { label: 'Checked',        color: 'text-blue-600',  bg: 'bg-blue-50'   },
  'order-placed':   { label: 'Order placed',   color: 'text-accent',    bg: 'bg-accent-light' },
  'issue-reported': { label: 'Issue reported', color: 'text-red-600',   bg: 'bg-red-50'    },
}

const LOGTYPE_META: Record<string, { label: string; color: string; bg: string }> = {
  'visit':   { label: 'Visit',   color: 'text-blue-600', bg: 'bg-blue-50'     },
  'tasting': { label: 'Tasting', color: 'text-accent',   bg: 'bg-accent-light' },
}

function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

// ─── component ────────────────────────────────────────────────────────────────

type SortCol = 'date' | 'type' | 'rep' | 'onShelf'

interface AllVisitsModalProps {
  open:        boolean
  onClose:     () => void
  storeName:   string
  visits:      StoreVisit[]
  /** Ids of visits that exist server-side and can therefore be edited/deleted. */
  editableIds: Set<string>
  onSelect:    (id: string) => void
  onDelete:    (id: string) => void
}

export function AllVisitsModal({ open, onClose, storeName, visits, editableIds, onSelect, onDelete }: AllVisitsModalProps) {
  const [sort, setSort]           = useState<{ col: SortCol; dir: SortDir }>({ col: 'date', dir: 'desc' })
  const [confirmId, setConfirmId] = useState<string | null>(null)

  const sorted = useMemo(() => {
    return [...visits].sort((a, b) => {
      let av: string | number = ''
      let bv: string | number = ''
      switch (sort.col) {
        case 'date':    av = a.date;                 bv = b.date;                 break
        case 'rep':     av = a.rep ?? '';            bv = b.rep ?? '';            break
        case 'onShelf': av = a.onShelf;              bv = b.onShelf;              break
        case 'type':    av = a.action ?? a.logType ?? ''; bv = b.action ?? b.logType ?? ''; break
      }
      if (av < bv) return sort.dir === 'asc' ? -1 : 1
      if (av > bv) return sort.dir === 'asc' ?  1 : -1
      return 0
    })
  }, [visits, sort])

  function toggleSort(col: SortCol) {
    setSort(prev =>
      prev.col === col
        ? { col, dir: prev.dir === 'asc' ? 'desc' : 'asc' }
        : { col, dir: col === 'date' ? 'desc' : 'asc' },
    )
  }

  const COLS: { key: SortCol; label: string; align?: 'right' }[] = [
    { key: 'date',    label: 'Date'    },
    { key: 'type',    label: 'Type'    },
    { key: 'rep',     label: 'Rep'     },
    { key: 'onShelf', label: 'On Shelf', align: 'right' },
  ]

  return (
    <Modal open={open} onClose={onClose} title="All Visits" subtitle={`${storeName} · ${visits.length} entries`} width="lg">
      <div className="overflow-x-auto">
        <table className="w-full min-w-[640px]">
          <thead>
            <tr className="border-b border-gray-100 bg-gray-50/50">
              {COLS.map(col => (
                <th
                  key={col.key}
                  onClick={() => toggleSort(col.key)}
                  className={clsx(
                    'px-5 py-3 text-[10px] font-semibold text-gray-400 uppercase tracking-wider cursor-pointer select-none hover:text-gray-600 transition-colors whitespace-nowrap',
                    col.align === 'right' ? 'text-right' : 'text-left',
                  )}
                >
                  {col.label}
                  <SortIcon active={sort.col === col.key} dir={sort.dir} />
                </th>
              ))}
              <th className="px-5 py-3 text-left text-[10px] font-semibold text-gray-400 uppercase tracking-wider">Notes</th>
              <th className="px-5 py-3 w-20" />
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-50">
            {sorted.map(v => {
              const meta = v.action
                ? ACTION_META[v.action]
                : (v.logType ? LOGTYPE_META[v.logType] : null)
              const editable = editableIds.has(v.id)
              return (
                <tr
                  key={v.id}
                  className={clsx('transition-colors', editable && confirmId !== v.id && 'cursor-pointer hover:bg-gray-50')}
                  onClick={() => { if (editable && confirmId !== v.id) onSelect(v.id) }}
                >
                  <td className="px-5 py-3 whitespace-nowrap text-sm text-gray-700">{fmtDate(v.date)}</td>
                  <td className="px-5 py-3">
                    {meta && (
                      <span className={clsx('inline-flex text-[10px] font-semibold px-2 py-0.5 rounded-full', meta.bg, meta.color)}>
                        {meta.label}
                      </span>
                    )}
                  </td>
                  <td className="px-5 py-3 text-sm text-gray-500">{v.rep}</td>
                  <td className="px-5 py-3 text-right">
                    <span className="text-sm font-semibold tabular-nums text-gray-900">{v.onShelf}</span>
                    <span className="text-[10px] text-gray-400 ml-1">btl</span>
                  </td>
                  <td className="px-5 py-3 max-w-xs">
                    <p className="text-xs text-gray-400 truncate">{v.notes}</p>
                  </td>
                  <td className="px-5 py-3 text-right">
                    {editable && (confirmId === v.id ? (
                      <div className="flex items-center justify-end gap-1">
                        <button
                          onClick={e => { e.stopPropagation(); onDelete(v.id); setConfirmId(null) }}
                          className="px-2 py-0.5 text-[10px] font-semibold text-white bg-red-500 hover:bg-red-600 rounded transition-colors"
                        >
                          Confirm
                        </button>
                        <button
                          onClick={e => { e.stopPropagation(); setConfirmId(null) }}
                          className="px-2 py-0.5 text-[10px] font-medium text-gray-400 hover:text-gray-700 hover:bg-gray-100 rounded transition-colors"
                        >
                          Cancel
                        </button>
                      </div>
                    ) : (
                      <button
                        onClick={e => { e.stopPropagation(); setConfirmId(v.id) }}
                        className="text-[10px] text-red-300 hover:text-red-500 transition-colors"
                      >
                        Delete
                      </button>
                    ))}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
        {sorted.length === 0 && (
          <div className="py-12 text-center text-sm text-gray-400">No visits logged yet</div>
        )}
      </div>
    </Modal>
  )
}
