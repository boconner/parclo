import { useState, useMemo } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { clsx } from 'clsx'
import { Button } from '@/components/ui/Button'
import { AddContactModal } from '@/components/contacts/AddContactModal'
import { ImportModal } from '@/components/import/ImportModal'
import type { Contact } from '@/types'
import { useContacts, useChains, useCreateContact, useDeleteContact } from '@/hooks/useQueries'
import { useQueryClient } from '@tanstack/react-query'

export default function Contacts() {
  const [query, setQuery]           = useState('')
  const [chainFilter, setChainFilter] = useState('all')
  const [showAdd, setShowAdd]       = useState(false)
  const [showImport, setShowImport] = useState(false)
  const [deleteId, setDeleteId]     = useState<string | null>(null)
  const queryClient = useQueryClient()

  const navigate = useNavigate()

  const { data: apiContacts } = useContacts()
  const { data: apiChains   } = useChains()
  const createContact  = useCreateContact()
  const deleteContact  = useDeleteContact()

  function handleDelete(id: string) {
    deleteContact.mutate(id, { onSuccess: () => setDeleteId(null) })
  }

  const contacts = apiContacts ?? []
  const chains   = apiChains   ?? []

  const filtered = useMemo(() => {
    let list = contacts
    if (chainFilter !== 'all') {
      list = list.filter(c => c.chainId === chainFilter)
    }
    if (query.trim()) {
      const q = query.toLowerCase()
      list = list.filter(c =>
        c.name.toLowerCase().includes(q) ||
        c.role?.toLowerCase().includes(q) ||
        c.email?.toLowerCase().includes(q) ||
        c.chainName?.toLowerCase().includes(q)
      )
    }
    return list
  }, [contacts, query, chainFilter])

  // Group by chain for the table view
  const grouped = useMemo(() => {
    const map: Map<string, { label: string; contacts: Contact[] }> = new Map()
    for (const c of filtered) {
      const key = c.chainId ?? '__none__'
      if (!map.has(key)) {
        map.set(key, { label: c.chainName ?? 'No Chain', contacts: [] })
      }
      map.get(key)!.contacts.push(c)
    }
    return Array.from(map.entries()).map(([, v]) => v)
  }, [filtered])

  function handleSave(c: Contact) {
    if (apiContacts !== undefined) {
      createContact.mutate({
        name: c.name, role: c.role, phone: c.phone, email: c.email,
        chainId: c.chainId, storeIds: c.storeIds, notes: c.notes,
      })
    }
  }

  return (
    <div className="p-4 lg:p-8">

      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-3 mb-6">
        <div>
          <h1 className="text-xl font-semibold text-gray-900 tracking-tight">Contacts</h1>
          <p className="text-sm text-gray-400 mt-0.5">{contacts.length} contacts across {chains.length} chains</p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="sm" onClick={() => setShowImport(true)}>
            <svg width="12" height="12" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.4">
              <path d="M2 10v2a1 1 0 001 1h8a1 1 0 001-1v-2M7 2v7M4.5 6.5L7 9l2.5-2.5" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
            Import
          </Button>
          <Button variant="primary" size="sm" onClick={() => setShowAdd(true)}>
            <svg width="11" height="11" viewBox="0 0 11 11" fill="none">
              <path d="M5.5 1v9M1 5.5h9" stroke="white" strokeWidth="1.6" strokeLinecap="round"/>
            </svg>
            Add Contact
          </Button>
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-3 mb-5">
        <div className="relative flex-1 min-w-[200px] max-w-sm">
          <svg className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" width="13" height="13" viewBox="0 0 14 14" fill="none">
            <circle cx="6" cy="6" r="4.5" stroke="currentColor" strokeWidth="1.4"/>
            <path d="M9.5 9.5L12 12" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/>
          </svg>
          <input
            type="text"
            placeholder="Search contacts…"
            value={query}
            onChange={e => setQuery(e.target.value)}
            className="w-full pl-8 pr-3 py-2 text-sm bg-white border border-gray-200 rounded-lg outline-none transition-all focus:border-accent focus:ring-2 focus:ring-accent/10 placeholder:text-gray-400"
          />
        </div>

        <select
          value={chainFilter}
          onChange={e => setChainFilter(e.target.value)}
          className="px-3 py-2 text-sm bg-white border border-gray-200 rounded-lg outline-none focus:border-accent focus:ring-2 focus:ring-accent/10 text-gray-600"
        >
          <option value="all">All chains</option>
          {chains.map(c => (
            <option key={c.id} value={c.id}>{c.name}</option>
          ))}
        </select>
      </div>

      {/* Results */}
      {filtered.length === 0 ? (
        <div className="bg-white border border-gray-200 rounded-xl py-16 text-center">
          <div className="w-10 h-10 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-3">
            <svg width="18" height="18" viewBox="0 0 20 20" fill="none" stroke="#9ca3af" strokeWidth="1.6">
              <circle cx="9" cy="7" r="3.5"/>
              <path d="M3 17c0-3.3 2.7-6 6-6h2c3.3 0 6 2.7 6 6"/>
            </svg>
          </div>
          <p className="text-sm font-medium text-gray-500">No contacts found</p>
          <p className="text-xs text-gray-400 mt-1">Try a different search or chain filter</p>
        </div>
      ) : (
        <div className="space-y-6">
          {grouped.map(group => (
            <div key={group.label}>
              <div className="flex items-center gap-2 mb-3">
                <h2 className="text-xs font-semibold text-gray-400 uppercase tracking-widest">{group.label}</h2>
                <div className="flex-1 h-px bg-gray-100" />
                <span className="text-xs text-gray-400">{group.contacts.length}</span>
              </div>

              <div className="bg-white border border-gray-200 rounded-xl overflow-x-auto">
                <div className="divide-y divide-gray-50">
                  {group.contacts.map(c => (
                    <Link
                      key={c.id}
                      to={`/contacts/${c.id}`}
                      className="flex items-center gap-4 px-5 py-3.5 hover:bg-gray-50/70 transition-colors group"
                      onClick={e => deleteId === c.id ? e.preventDefault() : undefined}
                    >
                      {/* Avatar */}
                      <div className="w-9 h-9 rounded-full bg-accent-light flex items-center justify-center flex-shrink-0">
                        <span className="text-xs font-bold text-accent">
                          {c.name.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase()}
                        </span>
                      </div>

                      {/* Name + Role */}
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-semibold text-gray-800 group-hover:text-accent transition-colors truncate">{c.name}</p>
                        <p className="text-xs text-gray-400 truncate">{c.role}</p>
                      </div>

                      {/* Store count — mobile only */}
                      {c.storeIds.length > 0 && (
                        <span className="flex md:hidden items-center text-[10px] font-medium text-gray-400 bg-gray-100 px-1.5 py-0.5 rounded-full flex-shrink-0">
                          {c.storeIds.length}
                        </span>
                      )}

                      {/* Stores */}
                      <div className="hidden md:flex flex-1 min-w-0 flex-wrap gap-x-2 gap-y-0.5">
                        {c.storeIds.length > 0 ? (
                          c.storeIds.map((sid, i) => (
                            <Link
                              key={sid}
                              to={`/stores/${sid}`}
                              onClick={e => e.stopPropagation()}
                              className="text-xs text-gray-500 hover:text-accent transition-colors truncate"
                            >
                              {c.storeNames[i] ?? sid}
                              {i < c.storeIds.length - 1 && <span className="text-gray-300 ml-0.5">,</span>}
                            </Link>
                          ))
                        ) : (
                          <span className="text-xs text-gray-300 italic">Chain-wide</span>
                        )}
                      </div>

                      {/* Contact actions */}
                      <div className="hidden lg:flex items-center gap-1 flex-shrink-0">
                        {c.phone && (
                          <div className="flex items-center rounded-md border border-gray-200 overflow-hidden">
                            <a
                              href={`tel:${c.phone}`}
                              onClick={e => e.stopPropagation()}
                              title={`Call ${c.phone}`}
                              className="flex items-center gap-1 px-2 py-1 text-[11px] text-gray-400 hover:text-accent hover:bg-gray-50 transition-colors border-r border-gray-200"
                            >
                              <svg width="11" height="11" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
                                <path d="M2 3a1 1 0 011-1h2.5a1 1 0 011 1l.5 2.5a1 1 0 01-.3.9L5.4 7.1c.9 1.8 2.7 3.6 4.5 4.5l.7-1.3a1 1 0 01.9-.3l2.5.5a1 1 0 011 1V14a1 1 0 01-1 1h-1C6.4 15 1 9.6 1 3V2a1 1 0 011-1h.5"/>
                              </svg>
                              Call
                            </a>
                            <a
                              href={`sms:${c.phone}`}
                              onClick={e => e.stopPropagation()}
                              title={`Text ${c.phone}`}
                              className="flex items-center gap-1 px-2 py-1 text-[11px] text-gray-400 hover:text-accent hover:bg-gray-50 transition-colors"
                            >
                              <svg width="11" height="11" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
                                <path d="M2 2h12a1 1 0 011 1v7a1 1 0 01-1 1H5l-3 3V3a1 1 0 011-1z"/>
                              </svg>
                              Text
                            </a>
                          </div>
                        )}
                        {c.email && (
                          <a
                            href={`mailto:${c.email}`}
                            onClick={e => e.stopPropagation()}
                            title={c.email}
                            className="flex items-center gap-1 px-2 py-1 text-[11px] text-gray-400 hover:text-accent hover:bg-gray-50 transition-colors rounded-md border border-gray-200"
                          >
                            <svg width="11" height="11" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
                              <rect x="1" y="3" width="14" height="10" rx="1.5"/>
                              <path d="M1 4l7 5 7-5"/>
                            </svg>
                            Email
                          </a>
                        )}
                      </div>

                      {/* Edit + Delete */}
                      <div
                        className="flex-shrink-0 flex items-center gap-1"
                        onClick={e => e.preventDefault()}
                      >
                        <button
                          onClick={e => { e.preventDefault(); navigate(`/contacts/${c.id}`) }}
                          className="px-2.5 py-1 text-xs font-medium text-accent hover:bg-accent-light rounded-md transition-colors"
                        >
                          Edit
                        </button>
                        {deleteId === c.id ? (
                          <>
                            <button
                              onClick={e => { e.preventDefault(); handleDelete(c.id) }}
                              className="px-2 py-1 text-xs font-medium text-white bg-red-500 hover:bg-red-600 rounded-md transition-colors"
                            >
                              Confirm
                            </button>
                            <button
                              onClick={e => { e.preventDefault(); setDeleteId(null) }}
                              className="px-2 py-1 text-xs font-medium text-gray-500 hover:text-gray-900 hover:bg-gray-100 rounded-md transition-colors"
                            >
                              Cancel
                            </button>
                          </>
                        ) : (
                          <button
                            onClick={e => { e.preventDefault(); setDeleteId(c.id) }}
                            className="px-2 py-1 text-xs font-medium text-red-400 hover:text-red-600 hover:bg-red-50 rounded-md transition-colors"
                          >
                            Delete
                          </button>
                        )}
                      </div>

                      <svg className="w-4 h-4 text-gray-300 group-hover:text-gray-400 flex-shrink-0" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
                        <path d="M6 4l4 4-4 4" strokeLinecap="round" strokeLinejoin="round"/>
                      </svg>
                    </Link>
                  ))}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      <AddContactModal
        open={showAdd}
        onClose={() => setShowAdd(false)}
        onSave={handleSave}
      />
      <ImportModal
        open={showImport}
        onClose={() => setShowImport(false)}
        initialType="contacts"
        onSuccess={() => queryClient.invalidateQueries({ queryKey: ['contacts'] })}
      />
    </div>
  )
}
