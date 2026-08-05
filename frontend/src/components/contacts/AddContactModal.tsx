import { useState, useId, useEffect } from 'react'
import { clsx } from 'clsx'
import { Modal, useModalClose } from '@/components/ui/Modal'
import { Button } from '@/components/ui/Button'
import type { Contact } from '@/types'
import { useChains, useStores } from '@/hooks/useQueries'

interface AddContactModalProps {
  open:    boolean
  onClose: () => void
  onSave:  (contact: Contact) => void
  contact?: Contact      // when provided: edit mode, pre-fills all fields
  // create context only (when opened from a chain or store page)
  defaultChainId?: string
  defaultStoreId?: string
}

interface FormValues {
  name:     string
  role:     string
  phone:    string
  email:    string
  chainId:  string
  storeIds: string[]
  notes:    string
}

const EMPTY: FormValues = { name: '', role: '', phone: '', email: '', chainId: '', storeIds: [], notes: '' }

type Errors = Partial<Record<keyof FormValues, string>>

function valuesFromContact(c: Contact): FormValues {
  return {
    name:     c.name,
    role:     c.role     ?? '',
    phone:    c.phone    ?? '',
    email:    c.email    ?? '',
    chainId:  c.chainId  ?? '',
    storeIds: c.storeIds ?? [],
    notes:    c.notes    ?? '',
  }
}

export function AddContactModal({ open, onClose, onSave, contact, defaultChainId, defaultStoreId }: AddContactModalProps) {
  const uid       = useId()
  const isEdit    = !!contact

  const [values, setValues]   = useState<FormValues>(() =>
    contact ? valuesFromContact(contact) : { ...EMPTY, chainId: defaultChainId ?? '', storeIds: defaultStoreId ? [defaultStoreId] : [] }
  )
  const [errors, setErrors]   = useState<Errors>({})
  const [touched, setTouched] = useState<Partial<Record<keyof FormValues, boolean>>>({})

  // Re-initialise whenever the modal opens
  useEffect(() => {
    if (!open) return
    if (contact) {
      setValues(valuesFromContact(contact))
    } else {
      setValues({ ...EMPTY, chainId: defaultChainId ?? '', storeIds: defaultStoreId ? [defaultStoreId] : [] })
    }
    setErrors({})
    setTouched({})
  }, [open]) // eslint-disable-line react-hooks/exhaustive-deps

  const { data: apiChains } = useChains()
  const { data: apiStores } = useStores()
  const chains = apiChains ?? []
  const storesForChain = values.chainId
    ? (apiStores ?? []).filter(s => s.chainId === values.chainId)
    : []

  function set<K extends keyof FormValues>(key: K, val: FormValues[K]) {
    setValues(v => ({ ...v, [key]: val }))
  }

  function toggleStore(id: string) {
    setValues(v => ({
      ...v,
      storeIds: v.storeIds.includes(id)
        ? v.storeIds.filter(s => s !== id)
        : [...v.storeIds, id],
    }))
  }

  function blur(key: keyof FormValues) {
    setTouched(t => ({ ...t, [key]: true }))
    setErrors(validate({ ...values }))
  }

  function handleChainChange(chainId: string) {
    setValues(v => ({ ...v, chainId, storeIds: [] }))
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setTouched({ name: true })
    const errs = validate(values)
    setErrors(errs)
    if (Object.keys(errs).length) return

    const chain      = chains.find(c => c.id === values.chainId)
    const storeNames = values.storeIds.map(sid => (apiStores ?? []).find(s => s.id === sid)?.name ?? sid)

    onSave({
      id:        contact?.id ?? `c-${Date.now()}`,
      name:      values.name.trim(),
      role:      values.role.trim(),
      phone:     values.phone.trim()  || undefined,
      email:     values.email.trim()  || undefined,
      chainId:   values.chainId       || undefined,
      chainName: chain?.name,
      storeIds:  values.storeIds,
      storeNames,
      notes:     values.notes.trim()  || undefined,
      createdAt: contact?.createdAt   ?? new Date().toISOString(),
    })
    if (!isEdit) {
      reset()
      onClose()
    }
  }

  const isDirty = !isEdit && (
    values.name !== '' || values.role !== '' || values.phone !== '' ||
    values.email !== '' || values.notes !== '' ||
    (values.storeIds.length > 0 && !defaultStoreId)
  )

  function reset() {
    if (contact) {
      setValues(valuesFromContact(contact))
    } else {
      setValues({ ...EMPTY, chainId: defaultChainId ?? '', storeIds: defaultStoreId ? [defaultStoreId] : [] })
    }
    setErrors({})
    setTouched({})
  }

  function handleClose() { reset(); onClose() }
  function err(key: keyof FormValues) { return touched[key] ? errors[key] : undefined }

  return (
    <Modal
      open={open}
      onClose={handleClose}
      title={isEdit ? 'Edit Contact' : 'Add Contact'}
      width="sm"
      confirmDiscard={isDirty}
    >
      <form onSubmit={handleSubmit} noValidate>
        <div className="px-6 py-5 space-y-4">

          {/* Name + Role */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label htmlFor={`${uid}-name`} className="block text-xs font-medium text-gray-600 mb-1.5">
                Name <span className="text-red-400">*</span>
              </label>
              <input
                id={`${uid}-name`}
                type="text"
                placeholder="Full name"
                value={values.name}
                onChange={e => set('name', e.target.value)}
                onBlur={() => blur('name')}
                className={clsx(
                  'w-full px-3 py-2 text-sm bg-white border rounded-lg outline-none transition-all',
                  'focus:border-accent focus:ring-2 focus:ring-accent/10 placeholder:text-gray-400',
                  err('name') ? 'border-red-300' : 'border-gray-200',
                )}
              />
              {err('name') && <p className="mt-1 text-xs text-red-500">{err('name')}</p>}
            </div>
            <div>
              <label htmlFor={`${uid}-role`} className="block text-xs font-medium text-gray-600 mb-1.5">
                Role
              </label>
              <input
                id={`${uid}-role`}
                type="text"
                placeholder="e.g. Store Manager"
                value={values.role}
                onChange={e => set('role', e.target.value)}
                onBlur={() => blur('role')}
                className={clsx(
                  'w-full px-3 py-2 text-sm bg-white border rounded-lg outline-none transition-all',
                  'focus:border-accent focus:ring-2 focus:ring-accent/10 placeholder:text-gray-400',
                  err('role') ? 'border-red-300' : 'border-gray-200',
                )}
              />
              {err('role') && <p className="mt-1 text-xs text-red-500">{err('role')}</p>}
            </div>
          </div>

          {/* Phone + Email */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label htmlFor={`${uid}-phone`} className="block text-xs font-medium text-gray-600 mb-1.5">
                Phone
              </label>
              <input
                id={`${uid}-phone`}
                type="tel"
                placeholder="214-555-0100"
                value={values.phone}
                onChange={e => set('phone', e.target.value)}
                className="w-full px-3 py-2 text-sm bg-white border border-gray-200 rounded-lg outline-none transition-all focus:border-accent focus:ring-2 focus:ring-accent/10 placeholder:text-gray-400"
              />
            </div>
            <div>
              <label htmlFor={`${uid}-email`} className="block text-xs font-medium text-gray-600 mb-1.5">
                Email
              </label>
              <input
                id={`${uid}-email`}
                type="email"
                placeholder="name@company.com"
                value={values.email}
                onChange={e => set('email', e.target.value)}
                className="w-full px-3 py-2 text-sm bg-white border border-gray-200 rounded-lg outline-none transition-all focus:border-accent focus:ring-2 focus:ring-accent/10 placeholder:text-gray-400"
              />
            </div>
          </div>

          {/* Chain */}
          <div>
            <label htmlFor={`${uid}-chain`} className="block text-xs font-medium text-gray-600 mb-1.5">
              Chain
            </label>
            <select
              id={`${uid}-chain`}
              value={values.chainId}
              onChange={e => handleChainChange(e.target.value)}
              disabled={!isEdit && !!defaultChainId}
              className={clsx(
                'w-full px-3 py-2 text-sm bg-white border border-gray-200 rounded-lg outline-none transition-all',
                'focus:border-accent focus:ring-2 focus:ring-accent/10',
                !values.chainId && 'text-gray-400',
                !isEdit && defaultChainId && 'opacity-60 cursor-not-allowed',
              )}
            >
              <option value="">No chain (independent)</option>
              {chains.map(c => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
          </div>

          {/* Store association */}
          {storesForChain.length > 0 && (
            <div>
              <p className="text-xs font-medium text-gray-600 mb-1.5">
                Stores <span className="text-gray-400 font-normal">(optional — leave blank for chain-wide)</span>
              </p>
              <div className="space-y-1 max-h-36 overflow-y-auto border border-gray-200 rounded-lg p-2">
                {storesForChain.map(s => (
                  <label
                    key={s.id}
                    className="flex items-center gap-2.5 px-2 py-1.5 rounded-md hover:bg-gray-50 cursor-pointer"
                  >
                    <input
                      type="checkbox"
                      checked={values.storeIds.includes(s.id)}
                      onChange={() => toggleStore(s.id)}
                      className="w-3.5 h-3.5 rounded border-gray-300 text-accent focus:ring-accent/20 accent-[#724fac]"
                    />
                    <span className="text-sm text-gray-700">{s.name}</span>
                    <span className="text-xs text-gray-400 ml-auto">{s.regionName}</span>
                  </label>
                ))}
              </div>
            </div>
          )}

          {/* Notes */}
          <div>
            <label htmlFor={`${uid}-notes`} className="block text-xs font-medium text-gray-600 mb-1.5">
              Notes <span className="text-gray-400 font-normal">(optional)</span>
            </label>
            <textarea
              id={`${uid}-notes`}
              rows={2}
              placeholder="Relationship context, preferences, or other details…"
              value={values.notes}
              onChange={e => set('notes', e.target.value)}
              className="w-full px-3 py-2 text-sm bg-white border border-gray-200 rounded-lg outline-none transition-all focus:border-accent focus:ring-2 focus:ring-accent/10 placeholder:text-gray-400 resize-none"
            />
          </div>

        </div>

        <ContactModalFooter isEdit={isEdit} />
      </form>
    </Modal>
  )
}

function ContactModalFooter({ isEdit }: { isEdit: boolean }) {
  const requestClose = useModalClose()
  return (
    <div className="px-6 py-4 border-t border-gray-100 flex items-center justify-between bg-gray-50/50 rounded-b-2xl">
      <p className="text-xs text-gray-400"><span className="text-red-400">*</span> Required</p>
      <div className="flex gap-2">
        <Button type="button" variant="ghost" size="sm" onClick={requestClose}>Cancel</Button>
        <Button type="submit" variant="primary" size="sm">{isEdit ? 'Save Changes' : 'Save Contact'}</Button>
      </div>
    </div>
  )
}

function validate(v: FormValues): Errors {
  const e: Errors = {}
  if (!v.name.trim()) e.name = 'Name is required'
  return e
}
