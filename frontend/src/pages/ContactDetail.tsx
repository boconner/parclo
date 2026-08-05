import { useState } from 'react'
import { useParams, Link } from 'react-router-dom'
import { clsx } from 'clsx'
import { Button } from '@/components/ui/Button'
import { AddContactModal } from '@/components/contacts/AddContactModal'
import type { Contact } from '@/types'
import type { StoreVisit } from '@/types'
import { useContact, useUpdateContact, useVisits } from '@/hooks/useQueries'
import { toast } from '@/components/ui/Toast'

function fmt(iso: string) {
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

function timeAgo(iso: string) {
  const diff = Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000)
  if (diff === 0) return 'Today'
  if (diff === 1) return 'Yesterday'
  if (diff < 30)  return `${diff}d ago`
  if (diff < 365) return `${Math.floor(diff / 30)}mo ago`
  return `${Math.floor(diff / 365)}y ago`
}

const ACTION_META: Record<StoreVisit['action'], { label: string; color: string; bg: string }> = {
  'stocked':        { label: 'Stocked',       color: 'text-green-700', bg: 'bg-green-50'     },
  'checked':        { label: 'Checked',        color: 'text-blue-600',  bg: 'bg-blue-50'      },
  'order-placed':   { label: 'Order placed',   color: 'text-accent',    bg: 'bg-accent-light' },
  'issue-reported': { label: 'Issue reported', color: 'text-red-600',   bg: 'bg-red-50'       },
}

interface InteractionEntry {
  visit: StoreVisit
  storeName: string
  storeId: string
}

export default function ContactDetail() {
  const { id } = useParams<{ id: string }>()
  const [showEdit, setShowEdit] = useState(false)

  const { data: apiContact } = useContact(id)
  const { data: contactVisits = [] } = useVisits(id ? { contactId: id } : undefined)
  const updateContact = useUpdateContact()

  const contact = apiContact

  if (!contact) {
    return (
      <div className="p-8 text-center py-24">
        <p className="text-sm font-medium text-gray-500">Contact not found</p>
        <Link to="/contacts" className="mt-2 inline-block text-xs text-accent hover:underline">
          ← Back to Contacts
        </Link>
      </div>
    )
  }

  const interactions: InteractionEntry[] = contactVisits.map(v => ({
    visit: {
      id:          v.id,
      date:        v.date,
      rep:         v.rep,
      onShelf:     v.onShelf,
      action:      v.action,
      notes:       v.notes,
      visitType:   'visit' as const,
      contactId:   v.contactId ?? undefined,
      contactName: v.contactName ?? undefined,
    },
    storeName: v.storeName,
    storeId:   v.storeId,
  }))

  function handleEditSave(updated: Contact) {
    if (apiContact && id) {
      updateContact.mutate(
        { id, name: updated.name, role: updated.role, phone: updated.phone,
          email: updated.email, chainId: updated.chainId, notes: updated.notes,
          storeIds: updated.storeIds },
        {
          onSuccess: () => { toast(`${updated.name} updated`); setShowEdit(false) },
          onError:   (err: Error) => toast(err.message, 'error'),
        }
      )
    }
  }

  return (
    <div className="p-4 lg:p-8">

      {/* Breadcrumb */}
      <nav className="flex items-center gap-2 text-sm mb-6">
        <Link to="/contacts" className="text-gray-400 hover:text-gray-600 transition-colors flex items-center gap-1">
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
            <path d="M9 2L4 7l5 5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
          Contacts
        </Link>
        <span className="text-gray-300">/</span>
        <span className="text-gray-600 font-medium">{contact.name}</span>
      </nav>

      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-4 mb-6">
        <div className="flex items-center gap-4">
          <div className="w-14 h-14 rounded-xl bg-accent-light flex items-center justify-center flex-shrink-0">
            <span className="text-xl font-bold text-accent">
              {contact.name.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase()}
            </span>
          </div>
          <div>
            <h1 className="text-xl font-semibold text-gray-900 tracking-tight">{contact.name}</h1>
            <p className="text-sm text-gray-400 mt-0.5">
              {contact.role}
              {contact.chainName && <> · <Link to={`/stores?chain=${contact.chainId}`} className="hover:text-accent transition-colors">{contact.chainName}</Link></>}
            </p>
            <p className="text-xs text-gray-400 mt-0.5">Added {fmt(contact.createdAt)}</p>
          </div>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {contact.phone && (
            <div className="flex items-center rounded-lg border border-gray-200 overflow-hidden">
              <a
                href={`tel:${contact.phone}`}
                className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-gray-600 hover:bg-gray-50 hover:text-accent transition-colors border-r border-gray-200"
                title={`Call ${contact.phone}`}
              >
                <svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
                  <path d="M2 3a1 1 0 011-1h2.5a1 1 0 011 1l.5 2.5a1 1 0 01-.3.9L5.4 7.1c.9 1.8 2.7 3.6 4.5 4.5l.7-1.3a1 1 0 01.9-.3l2.5.5a1 1 0 011 1V14a1 1 0 01-1 1h-1C6.4 15 1 9.6 1 3V2a1 1 0 011-1h.5"/>
                </svg>
                Call
              </a>
              <a
                href={`sms:${contact.phone}`}
                className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-gray-600 hover:bg-gray-50 hover:text-accent transition-colors"
                title={`Text ${contact.phone}`}
              >
                <svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
                  <path d="M2 2h12a1 1 0 011 1v7a1 1 0 01-1 1H5l-3 3V3a1 1 0 011-1z"/>
                </svg>
                Text
              </a>
            </div>
          )}
          {contact.email && (
            <a href={`mailto:${contact.email}`}>
              <Button variant="ghost" size="sm">
                <svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
                  <rect x="1" y="3" width="14" height="10" rx="1.5"/>
                  <path d="M1 4l7 5 7-5"/>
                </svg>
                Email
              </Button>
            </a>
          )}
          <Button variant="ghost" size="sm" onClick={() => setShowEdit(true)}>Edit</Button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 lg:gap-5">

        {/* LEFT: Interaction history */}
        <div className="lg:col-span-2 space-y-4">

          <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
            <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
              <h2 className="text-sm font-semibold text-gray-900">
                Interaction History
                {interactions.length > 0 && (
                  <span className="ml-2 text-xs font-normal text-gray-400">({interactions.length} visits)</span>
                )}
              </h2>
            </div>

            {interactions.length === 0 ? (
              <div className="py-12 text-center">
                <div className="w-9 h-9 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-3">
                  <svg width="16" height="16" viewBox="0 0 20 20" fill="none" stroke="#9ca3af" strokeWidth="1.6">
                    <path d="M9 12l2 2 4-4"/><rect x="3" y="3" width="14" height="14" rx="2"/>
                  </svg>
                </div>
                <p className="text-sm text-gray-500">No interactions yet</p>
                <p className="text-xs text-gray-400 mt-1">Log a visit and associate this contact to start tracking</p>
              </div>
            ) : (
              <div className="divide-y divide-gray-50">
                {interactions.map(({ visit, storeName, storeId }, i) => {
                  const meta = ACTION_META[visit.action]
                  return (
                    <div key={visit.id} className={clsx('px-5 py-3.5 flex items-start gap-4', i === 0 && 'bg-gray-50/40')}>
                      <div className="flex flex-col items-center gap-1 flex-shrink-0 pt-0.5">
                        <div className={clsx('w-2 h-2 rounded-full', i === 0 ? 'bg-accent' : 'bg-gray-200')} />
                        {i < interactions.length - 1 && <div className="w-px flex-1 min-h-[24px] bg-gray-100" />}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between gap-3 mb-0.5">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className={clsx('text-[10px] font-semibold px-1.5 py-0.5 rounded-full', meta.bg, meta.color)}>
                              {meta.label}
                            </span>
                            <Link to={`/stores/${storeId}`} className="text-xs text-gray-600 hover:text-accent transition-colors font-medium">
                              {storeName}
                            </Link>
                            <span className="text-xs text-gray-400">{visit.rep}</span>
                          </div>
                          <div className="text-right flex-shrink-0">
                            <span className="text-[10px] text-gray-400">{fmt(visit.date)}</span>
                            <span className="text-[10px] text-gray-300 ml-1.5">({timeAgo(visit.date)})</span>
                          </div>
                        </div>
                        <p className="text-xs text-gray-500">{visit.notes}</p>
                        <p className="text-[10px] text-gray-400 mt-0.5">{visit.onShelf} bottles on shelf</p>
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </div>

          {/* Associated stores */}
          {contact.storeIds.length > 0 && (
            <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
              <div className="px-5 py-4 border-b border-gray-100">
                <h2 className="text-sm font-semibold text-gray-900">Associated Stores</h2>
              </div>
              <div className="divide-y divide-gray-50">
                {contact.storeIds.map((storeId, i) => (
                  <Link
                    key={storeId}
                    to={`/stores/${storeId}`}
                    className="flex items-center justify-between px-5 py-3 hover:bg-gray-50/60 transition-colors group"
                  >
                    <div>
                      <p className="text-sm font-medium text-gray-700 group-hover:text-accent transition-colors">
                        {contact.storeNames?.[i] ?? storeId}
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      <svg className="w-4 h-4 text-gray-300" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
                        <path d="M6 4l4 4-4 4" strokeLinecap="round" strokeLinejoin="round"/>
                      </svg>
                    </div>
                  </Link>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* RIGHT: Contact info */}
        <div className="space-y-4">
          <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
            <div className="px-5 py-4 border-b border-gray-100">
              <h2 className="text-sm font-semibold text-gray-900">Contact Info</h2>
            </div>
            <div className="px-5 py-4 space-y-3">
              {contact.role && <InfoRow label="Role" value={contact.role} />}
              {contact.chainName && (
                <InfoRow label="Chain" value={contact.chainName} />
              )}
              {contact.phone && (
                <div className="flex items-center justify-between gap-3">
                  <span className="text-xs text-gray-400 flex-shrink-0">Phone</span>
                  <div className="flex items-center gap-2">
                    <a href={`tel:${contact.phone}`} className="text-xs font-medium text-accent hover:underline">{contact.phone}</a>
                    <span className="text-gray-200">·</span>
                    <a href={`sms:${contact.phone}`} className="text-xs font-medium text-gray-400 hover:text-accent transition-colors flex items-center gap-1">
                      <svg width="10" height="10" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
                        <path d="M2 2h12a1 1 0 011 1v7a1 1 0 01-1 1H5l-3 3V3a1 1 0 011-1z"/>
                      </svg>
                      Text
                    </a>
                  </div>
                </div>
              )}
              {contact.email && (
                <div className="flex items-center justify-between gap-3">
                  <span className="text-xs text-gray-400 flex-shrink-0">Email</span>
                  <a href={`mailto:${contact.email}`} className="text-xs font-medium text-accent hover:underline truncate max-w-[180px]">{contact.email}</a>
                </div>
              )}
              <InfoRow
                label="Scope"
                value={contact.storeIds.length === 0 ? 'Chain-wide' : `${contact.storeIds.length} store${contact.storeIds.length !== 1 ? 's' : ''}`}
              />
            </div>
          </div>

          {contact.notes && (
            <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
              <div className="px-5 py-4 border-b border-gray-100">
                <h2 className="text-sm font-semibold text-gray-900">Notes</h2>
              </div>
              <div className="px-5 py-4">
                <p className="text-sm text-gray-600 leading-relaxed">{contact.notes}</p>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Edit modal (reuses AddContactModal pre-filled) */}
      <AddContactModal
        open={showEdit}
        onClose={() => setShowEdit(false)}
        onSave={handleEditSave}
        contact={contact}
      />
    </div>
  )
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="text-xs text-gray-400 flex-shrink-0">{label}</span>
      <span className="text-xs font-medium text-gray-700 text-right">{value}</span>
    </div>
  )
}
