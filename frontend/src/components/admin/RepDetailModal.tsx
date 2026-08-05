import { useState } from 'react'
import { Link } from 'react-router-dom'
import { clsx } from 'clsx'
import { Modal } from '@/components/ui/Modal'
import { Button } from '@/components/ui/Button'
import type { Rep, DashboardStore } from '@/types'
import { useVisits } from '@/hooks/useQueries'

interface RepDetailModalProps {
  rep: Rep | null
  stores: DashboardStore[]
  onClose: () => void
  onUpdatePhone: (phone: string) => void
}

const ACTION_META = {
  stocked:        { label: 'Stocked',       bg: 'bg-green-50',  color: 'text-green-700' },
  checked:        { label: 'Checked',        bg: 'bg-gray-100',  color: 'text-gray-600'  },
  'order-placed': { label: 'Order Placed',   bg: 'bg-blue-50',   color: 'text-blue-700'  },
  'issue-reported': { label: 'Issue',        bg: 'bg-red-50',    color: 'text-red-700'   },
}

export function RepDetailModal({ rep, stores, onClose, onUpdatePhone }: RepDetailModalProps) {
  const [editingPhone, setEditingPhone] = useState(false)
  const [phoneVal, setPhoneVal]         = useState('')

  const { data: visits = [] } = useVisits(rep ? { repId: rep.id } : undefined)
  const recentVisits = [...visits]
    .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
    .slice(0, 8)

  function startEdit() {
    setPhoneVal(rep?.phone ?? '')
    setEditingPhone(true)
  }

  function savePhone() {
    onUpdatePhone(phoneVal.trim())
    setEditingPhone(false)
  }

  if (!rep) return null

  const isActive  = rep.status === 'active'
  const initials  = rep.name.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase()

  return (
    <Modal open={!!rep} onClose={onClose} title="Rep Profile" width="lg">
      <div className="px-6 py-5 space-y-5">

        {/* Profile header */}
        <div className="flex items-start gap-4">
          <div className={clsx(
            'w-14 h-14 rounded-full flex items-center justify-center flex-shrink-0 text-lg font-bold',
            isActive ? 'bg-accent-light text-accent' : 'bg-gray-100 text-gray-400'
          )}>
            {initials}
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <h3 className="text-base font-semibold text-gray-900">{rep.name}</h3>
              <span className={clsx(
                'inline-flex items-center gap-1.5 text-xs font-medium px-2 py-0.5 rounded-full',
                isActive ? 'bg-green-50 text-green-700' : 'bg-gray-100 text-gray-500'
              )}>
                <span className={clsx('w-1.5 h-1.5 rounded-full', isActive ? 'bg-green-500' : 'bg-gray-400')} />
                {isActive ? 'Active' : 'Inactive'}
              </span>
            </div>
            <p className="text-sm text-gray-500 mt-0.5">{rep.regionName} Region</p>

            {/* Contact info */}
            <div className="mt-2 flex flex-wrap items-center gap-3">
              <a
                href={`mailto:${rep.email}`}
                className="inline-flex items-center gap-1.5 text-xs text-gray-500 hover:text-accent transition-colors"
              >
                <svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
                  <rect x="1" y="3" width="14" height="10" rx="1.5"/>
                  <path d="M1 5l7 5 7-5"/>
                </svg>
                {rep.email}
              </a>

              {editingPhone ? (
                <div className="flex items-center gap-1.5">
                  <input
                    type="tel"
                    value={phoneVal}
                    onChange={e => setPhoneVal(e.target.value)}
                    onKeyDown={e => { if (e.key === 'Enter') savePhone(); if (e.key === 'Escape') setEditingPhone(false) }}
                    placeholder="(512) 555-0100"
                    autoFocus
                    className="text-xs px-2 py-1 border border-accent rounded-md outline-none focus:ring-2 focus:ring-accent/10 w-36"
                  />
                  <button onClick={savePhone} className="text-xs font-medium text-accent hover:underline">Save</button>
                  <button onClick={() => setEditingPhone(false)} className="text-xs text-gray-400 hover:text-gray-600">Cancel</button>
                </div>
              ) : rep.phone ? (
                <div className="flex items-center gap-1.5">
                  <a
                    href={`tel:${rep.phone}`}
                    className="inline-flex items-center gap-1.5 text-xs text-gray-500 hover:text-accent transition-colors"
                  >
                    <svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
                      <path d="M2 3a1 1 0 011-1h2.5a1 1 0 011 1l.5 2.5a1 1 0 01-.3.9L5.4 7.1c.9 1.8 2.7 3.6 4.5 4.5l.7-1.3a1 1 0 01.9-.3l2.5.5a1 1 0 011 1V14a1 1 0 01-1 1h-1C6.4 15 1 9.6 1 3V2a1 1 0 011-1h.5"/>
                    </svg>
                    {rep.phone}
                  </a>
                  <button onClick={startEdit} className="text-[10px] text-gray-400 hover:text-gray-600">edit</button>
                </div>
              ) : (
                <button
                  onClick={startEdit}
                  className="inline-flex items-center gap-1 text-xs text-gray-400 hover:text-accent transition-colors"
                >
                  <svg width="11" height="11" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
                    <path d="M2 3a1 1 0 011-1h2.5a1 1 0 011 1l.5 2.5a1 1 0 01-.3.9L5.4 7.1c.9 1.8 2.7 3.6 4.5 4.5l.7-1.3a1 1 0 01.9-.3l2.5.5a1 1 0 011 1V14a1 1 0 01-1 1h-1C6.4 15 1 9.6 1 3V2a1 1 0 011-1h.5"/>
                  </svg>
                  Add phone
                </button>
              )}
            </div>
          </div>

          {/* Call CTA */}
          {rep.phone && (
            <a
              href={`tel:${rep.phone}`}
              className="flex-shrink-0 inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-accent text-white rounded-lg hover:bg-accent/90 transition-colors"
            >
              <svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
                <path d="M2 3a1 1 0 011-1h2.5a1 1 0 011 1l.5 2.5a1 1 0 01-.3.9L5.4 7.1c.9 1.8 2.7 3.6 4.5 4.5l.7-1.3a1 1 0 01.9-.3l2.5.5a1 1 0 011 1V14a1 1 0 01-1 1h-1C6.4 15 1 9.6 1 3V2a1 1 0 011-1h.5"/>
              </svg>
              Call
            </a>
          )}
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">

          {/* Assigned Stores */}
          <div>
            <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider mb-2">
              Assigned Stores ({stores.length})
            </p>
            {stores.length === 0 ? (
              <p className="text-xs text-gray-400 italic">No stores assigned</p>
            ) : (
              <div className="space-y-1.5">
                {stores.map(s => (
                  <Link
                    key={s.id}
                    to={`/stores/${s.id}`}
                    onClick={onClose}
                    className="flex items-center justify-between px-3 py-2 rounded-lg bg-gray-50 hover:bg-accent-light/30 transition-colors group"
                  >
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-gray-800 group-hover:text-accent transition-colors truncate">
                        {s.name}
                      </p>
                      <p className="text-[11px] text-gray-400 truncate">{s.chainName ?? s.regionName}</p>
                    </div>
                    <div className="flex-shrink-0 ml-2 text-right">
                      <p className="text-xs font-semibold text-gray-700 tabular-nums">{s.onShelf}</p>
                      <p className="text-[10px] text-gray-400">on shelf</p>
                    </div>
                  </Link>
                ))}
              </div>
            )}
          </div>

          {/* Recent Activity */}
          <div>
            <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider mb-2">
              Recent Activity
            </p>
            {recentVisits.length === 0 ? (
              <p className="text-xs text-gray-400 italic">No visits recorded</p>
            ) : (
              <div className="space-y-2">
                {recentVisits.map(v => {
                  const meta = ACTION_META[v.action] ?? ACTION_META.checked
                  return (
                    <div key={v.id} className="flex items-start gap-2.5">
                      <span className={clsx('mt-0.5 text-[10px] font-semibold px-1.5 py-0.5 rounded-full flex-shrink-0', meta.bg, meta.color)}>
                        {meta.label}
                      </span>
                      <div className="min-w-0">
                        <Link
                          to={`/stores/${v.storeId}`}
                          onClick={onClose}
                          className="text-xs font-medium text-gray-800 hover:text-accent transition-colors truncate block"
                        >
                          {v.storeName}
                        </Link>
                        <p className="text-[10px] text-gray-400">
                          {new Date(v.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                          {v.notes && ` · ${v.notes.slice(0, 40)}${v.notes.length > 40 ? '…' : ''}`}
                        </p>
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </div>

        </div>
      </div>

      <div className="px-6 py-4 border-t border-gray-100 bg-gray-50/50 rounded-b-2xl flex justify-end">
        <Button variant="ghost" size="sm" onClick={onClose}>Close</Button>
      </div>
    </Modal>
  )
}
