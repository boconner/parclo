import { useState, useEffect, useId } from 'react'
import { clsx } from 'clsx'
import { Modal } from '@/components/ui/Modal'
import { Button } from '@/components/ui/Button'
import type { DashboardStore } from '@/types'
import { useRegions, useChains, useReps } from '@/hooks/useQueries'
import { computedStoreName } from '@/lib/exportStores'

interface EditStoreModalProps {
  store: DashboardStore | null
  open: boolean
  onClose: () => void
  onSave: (id: string, updates: {
    name: string
    displayName: string | null
    regionSlug: string
    chainId: string | null
    storeNumber: string | null
    repId: string | null
    address: string | null
  }) => void
}

export function EditStoreModal({ store, open, onClose, onSave }: EditStoreModalProps) {
  const uid = useId()
  const { data: regionsData } = useRegions()
  const { data: chainsData  } = useChains()
  const { data: repsData    } = useReps()

  const regions = regionsData ?? []
  const chains  = chainsData  ?? []
  const reps    = (repsData ?? []).filter(r => r.status === 'active')

  const [name,        setName]        = useState('')
  const [displayName, setDisplayName] = useState('')
  const [regionSlug, setRegionSlug] = useState('')
  const [chainId,    setChainId]    = useState<string | null>(null)
  const [storeNumber, setStoreNumber] = useState('')
  const [repId,      setRepId]      = useState<string | null>(null)
  const [address,    setAddress]    = useState('')
  const [errors,     setErrors]     = useState<Record<string, string>>({})

  useEffect(() => {
    if (open && store) {
      setName(store.name)
      setDisplayName(store.displayName ?? '')
      setRegionSlug(store.region)
      setChainId(store.chainId ?? null)
      setStoreNumber(store.storeNumber ?? '')
      setRepId(store.repId ?? null)
      setAddress(store.address ?? '')
      setErrors({})
    }
  }, [open, store])

  function validate() {
    const e: Record<string, string> = {}
    if (!name.trim()) e['name'] = 'Store name is required'
    return e
  }

  function handleSave(e: React.FormEvent) {
    e.preventDefault()
    const errs = validate()
    setErrors(errs)
    if (Object.keys(errs).length) return
    if (!store) return
    onSave(store.id, {
      name:        name.trim(),
      displayName: displayName.trim() || null,
      regionSlug,
      chainId,
      storeNumber: storeNumber.trim() || null,
      repId,
      address:     address.trim() || null,
    })
  }

  if (!store) return null

  return (
    <Modal open={open} onClose={onClose} title="Edit Store" width="sm">
      <form onSubmit={handleSave} noValidate>
        <div className="px-6 py-5 space-y-4">

          <Field label="Store Name" id={`${uid}-name`} required error={errors['name']}>
            <Input
              id={`${uid}-name`}
              value={name}
              onChange={e => setName(e.target.value)}
              placeholder="e.g. Spec's – Montrose"
              autoFocus
            />
          </Field>

          <Field
            label="Display Name"
            id={`${uid}-displayName`}
            hint="Name used in CSV exports. Leave blank to auto-generate."
          >
            <Input
              id={`${uid}-displayName`}
              value={displayName}
              onChange={e => setDisplayName(e.target.value)}
              placeholder={store ? computedStoreName(store) : 'e.g. Addison'}
            />
          </Field>

          <Field label="Region" id={`${uid}-region`}>
            <select
              id={`${uid}-region`}
              value={regionSlug}
              onChange={e => setRegionSlug(e.target.value)}
              className="w-full px-3 py-2 text-sm bg-white border border-gray-200 rounded-lg outline-none focus:border-accent focus:ring-2 focus:ring-accent/10 transition-all"
            >
              <option value="">No region</option>
              {regions.map(m => (
                <option key={m.slug} value={m.slug}>{m.name}</option>
              ))}
            </select>
          </Field>

          <Field label="Chain" id={`${uid}-chain`}>
            <select
              id={`${uid}-chain`}
              value={chainId ?? ''}
              onChange={e => setChainId(e.target.value || null)}
              className="w-full px-3 py-2 text-sm bg-white border border-gray-200 rounded-lg outline-none focus:border-accent focus:ring-2 focus:ring-accent/10 transition-all"
            >
              <option value="">No chain</option>
              {chains.map(c => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
          </Field>

          {chainId && (
            <Field
              label="Chain Store Number"
              id={`${uid}-storeNumber`}
              hint="The chain's own store ID, used to match live inventory (e.g. store #15)."
            >
              <Input
                id={`${uid}-storeNumber`}
                value={storeNumber}
                onChange={e => setStoreNumber(e.target.value)}
                placeholder="e.g. 15"
              />
            </Field>
          )}

          <Field label="Assigned Rep" id={`${uid}-rep`}>
            <select
              id={`${uid}-rep`}
              value={repId ?? ''}
              onChange={e => setRepId(e.target.value || null)}
              className="w-full px-3 py-2 text-sm bg-white border border-gray-200 rounded-lg outline-none focus:border-accent focus:ring-2 focus:ring-accent/10 transition-all"
            >
              <option value="">No rep</option>
              {reps.map(r => (
                <option key={r.id} value={r.id}>{r.name}</option>
              ))}
            </select>
          </Field>

          <Field label="Address" id={`${uid}-address`} hint="Used to place the store on the map">
            <Input
              id={`${uid}-address`}
              value={address}
              onChange={e => setAddress(e.target.value)}
              placeholder="e.g. 1234 Westheimer Rd, Houston, TX"
            />
          </Field>

        </div>

        <div className="px-6 py-4 border-t border-gray-100 flex items-center justify-between bg-gray-50/50 rounded-b-2xl">
          <p className="text-xs text-gray-400"><span className="text-red-400">*</span> Required</p>
          <div className="flex gap-2">
            <Button type="button" variant="ghost" size="sm" onClick={onClose}>Cancel</Button>
            <Button type="submit" variant="primary" size="sm">Save Changes</Button>
          </div>
        </div>
      </form>
    </Modal>
  )
}

function Field({ label, id, required, error, hint, children }: {
  label: string; id: string; required?: boolean; error?: string; hint?: string; children: React.ReactNode
}) {
  return (
    <div>
      <label htmlFor={id} className="block text-xs font-medium text-gray-600 mb-1.5">
        {label}{required && <span className="text-red-400 ml-0.5">*</span>}
      </label>
      {children}
      {error
        ? <p className="mt-1 text-xs text-red-500">{error}</p>
        : hint && <p className="mt-1 text-xs text-gray-400">{hint}</p>
      }
    </div>
  )
}

function Input({ className, ...props }: React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      {...props}
      className={clsx(
        'w-full px-3 py-2 text-sm bg-white border border-gray-200 rounded-lg outline-none transition-all',
        'focus:border-accent focus:ring-2 focus:ring-accent/10 placeholder:text-gray-400',
        className,
      )}
    />
  )
}
