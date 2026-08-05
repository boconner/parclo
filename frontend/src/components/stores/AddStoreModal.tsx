import { useState, useId } from 'react'
import { clsx } from 'clsx'
import { Modal } from '@/components/ui/Modal'
import { Button } from '@/components/ui/Button'
import { DashboardStore } from '@/types'
import type { Chain } from '@/types'
import { useRegions, useChains, useReps } from '@/hooks/useQueries'

const MAPBOX_TOKEN = import.meta.env.VITE_MAPBOX_TOKEN

interface AddStoreModalProps {
  open: boolean
  onClose: () => void
  onAdd: (store: DashboardStore) => void
}

interface FormValues {
  name:        string
  displayName: string
  chain:       string
  storeNumber: string
  region:      string
  rep:         string
  address:     string
}

const EMPTY: FormValues = { name: '', displayName: '', chain: '', storeNumber: '', region: '', rep: '', address: '' }

type Errors = Partial<Record<keyof FormValues, string>>

function validate(v: FormValues): Errors {
  const e: Errors = {}
  if (!v.name.trim()) e.name = 'Store name is required'
  return e
}

async function geocode(address: string): Promise<{ lat: number; lng: number } | null> {
  const url = `https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(address)}.json`
    + `?country=US&limit=1&access_token=${MAPBOX_TOKEN}`
  const res = await fetch(url)
  if (!res.ok) return null
  const data = await res.json()
  const feature = data.features?.[0]
  if (!feature) return null
  const [lng, lat] = feature.center
  return { lat, lng }
}

export function AddStoreModal({ open, onClose, onAdd }: AddStoreModalProps) {
  const uid = useId()
  const [values, setValues]     = useState<FormValues>(EMPTY)
  const [errors, setErrors]     = useState<Errors>({})
  const [touched, setTouched]   = useState<Partial<Record<keyof FormValues, boolean>>>({})
  const [geocoding, setGeocoding] = useState(false)
  const [extraChains, setExtraChains] = useState<Chain[]>([])
  const [addingChain, setAddingChain] = useState(false)
  const [newChainName, setNewChainName] = useState('')

  const { data: regionsData } = useRegions()
  const { data: apiChains   } = useChains()
  const { data: apiReps     } = useReps()
  const regions = regionsData ?? []
  const chains  = [...(apiChains ?? []), ...extraChains]
  const repNames = (apiReps ?? []).map(r => r.name).sort()

  function handleAddChain() {
    const name = newChainName.trim()
    if (!name) return
    const id = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
    const chain: Chain = { id, name, _count: { stores: 0 } }
    setExtraChains(prev => [...prev, chain])
    setValues(v => ({ ...v, chain: id }))
    setNewChainName('')
    setAddingChain(false)
  }

  function field(key: keyof FormValues) {
    return {
      id: `${uid}-${key}`,
      value: values[key],
      onChange: (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
        setValues(v => ({ ...v, [key]: e.target.value })),
      onBlur: () => {
        setTouched(t => ({ ...t, [key]: true }))
        setErrors(validate({ ...values, [key]: values[key] }))
      },
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setTouched(Object.fromEntries(Object.keys(EMPTY).map(k => [k, true])))
    const errs = validate(values)
    setErrors(errs)
    if (Object.keys(errs).length) return

    let coords: { lat: number; lng: number } | null = null
    if (values.address.trim()) {
      setGeocoding(true)
      try {
        coords = await geocode(values.address.trim())
      } catch {
        // non-fatal — store is added without coordinates
      } finally {
        setGeocoding(false)
      }
      if (!coords) {
        setErrors(prev => ({ ...prev, address: 'Address not found — check spelling and try again' }))
        return
      }
    }

    const region = regions.find(m => m.slug === values.region)
    const chain  = chains.find(c => c.id === values.chain)
    onAdd({
      id:            `store-${Date.now()}`,
      // A newly created store is always active; deactivation is a later,
      // deliberate action from the store detail page.
      status:        'active',
      deactivatedAt: null,
      name:          values.name.trim(),
      displayName:   values.displayName.trim() || null,
      address:       values.address?.trim() || null,
      region:        values.region,
      regionName:    region?.name ?? '',
      chainId:       chain?.id ?? null,
      chainName:     chain?.name ?? null,
      storeNumber:   values.storeNumber.trim() || null,
      repId:         null,
      rep:           values.rep || null,
      ...(coords && { latitude: coords.lat, longitude: coords.lng }),
      onShelf:       0,
      inProcess:     0,
      daysOfSupply:  null,
      depletionRate: null,
      lastVisit:     null,
      hasAlert:      false,
      alertType:     null,
    })
    reset()
    onClose()
  }

  function reset() {
    setValues(EMPTY)
    setErrors({})
    setTouched({})
  }

  function handleClose() {
    reset()
    onClose()
  }

  function err(key: keyof FormValues) {
    return touched[key] ? errors[key] : undefined
  }

  return (
    <Modal
      open={open}
      onClose={handleClose}
      title="Add Store"
      subtitle="Only store name is required. Other details can be added later."
    >
      <form onSubmit={handleSubmit} noValidate>
        <div className="px-6 py-5 space-y-5">

          {/* Chain — optional */}
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-2">
              Chain
            </label>
            <div className="grid grid-cols-2 gap-2">
              {chains.map(c => (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => setValues(v => ({ ...v, chain: v.chain === c.id ? '' : c.id }))}
                  className={clsx(
                    'flex items-center gap-2.5 px-3 py-2.5 rounded-xl border text-left transition-all',
                    values.chain === c.id
                      ? 'border-accent bg-accent-light'
                      : 'border-gray-200 hover:border-gray-300 bg-white'
                  )}
                >
                  <div className={clsx(
                    'w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0 text-xs font-bold',
                    values.chain === c.id ? 'bg-accent text-white' : 'bg-gray-100 text-gray-500'
                  )}>
                    {c.name.charAt(0)}
                  </div>
                  <span className={clsx(
                    'text-sm font-medium',
                    values.chain === c.id ? 'text-accent' : 'text-gray-700'
                  )}>
                    {c.name}
                  </span>
                </button>
              ))}
            </div>

            {/* Inline new-chain input */}
            {addingChain ? (
              <div className="mt-2 flex items-center gap-2">
                <input
                  type="text"
                  value={newChainName}
                  onChange={e => setNewChainName(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); handleAddChain() } if (e.key === 'Escape') { setAddingChain(false); setNewChainName('') } }}
                  placeholder="New chain name…"
                  autoFocus
                  className="flex-1 px-3 py-1.5 text-sm border border-accent rounded-lg outline-none focus:ring-2 focus:ring-accent/10 placeholder:text-gray-400"
                />
                <button type="button" onClick={handleAddChain} className="text-xs font-semibold text-accent hover:underline px-1">Add</button>
                <button type="button" onClick={() => { setAddingChain(false); setNewChainName('') }} className="text-xs text-gray-400 hover:text-gray-600 px-1">Cancel</button>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => setAddingChain(true)}
                className="mt-2 flex items-center gap-1 text-xs font-medium text-accent hover:underline"
              >
                <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
                  <path d="M5 1v8M1 5h8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
                </svg>
                New chain
              </button>
            )}

            {err('chain') && <p className="mt-1.5 text-xs text-red-500">{err('chain')}</p>}
          </div>

          {/* Chain store number — only relevant when a chain is selected */}
          {values.chain && (
            <Field
              label="Chain Store Number"
              id={`${uid}-storeNumber`}
              error={err('storeNumber')}
              hint="The chain's own store ID, used to match live inventory (e.g. store #15)."
            >
              <Input {...field('storeNumber')} placeholder="e.g. 15" />
            </Field>
          )}

          {/* Store name */}
          <Field label="Store Name" id={`${uid}-name`} required error={err('name')}>
            <Input
              {...field('name')}
              placeholder={values.chain
                ? `e.g. ${chains.find(c => c.id === values.chain)?.name} - Location`
                : 'e.g. Spec\'s - Montrose'}
            />
          </Field>

          {/* Display name — used in CSV exports */}
          <Field
            label="Display Name"
            id={`${uid}-displayName`}
            error={err('displayName')}
            hint="Name used in CSV exports. Leave blank to auto-generate."
          >
            <Input {...field('displayName')} placeholder="e.g. Addison" />
          </Field>

          {/* Region */}
          <Field label="Region" id={`${uid}-region`} error={err('region')}>
            <select
              {...field('region')}
              className={clsx(
                'w-full px-3 py-2 text-sm bg-white border rounded-lg outline-none transition-all',
                'focus:border-accent focus:ring-2 focus:ring-accent/10',
                err('region') ? 'border-red-300' : 'border-gray-200',
                !values.region && 'text-gray-400',
              )}
            >
              <option value="" disabled>Select region…</option>
              {regions.map(m => (
                <option key={m.slug} value={m.slug}>{m.name}</option>
              ))}
            </select>
          </Field>

          {/* Rep */}
          <Field label="Assigned Rep" id={`${uid}-rep`} error={err('rep')}>
            <select
              {...field('rep')}
              className={clsx(
                'w-full px-3 py-2 text-sm bg-white border rounded-lg outline-none transition-all',
                'focus:border-accent focus:ring-2 focus:ring-accent/10',
                err('rep') ? 'border-red-300' : 'border-gray-200',
                !values.rep && 'text-gray-400',
              )}
            >
              <option value="">No rep</option>
              {repNames.map(r => (
                <option key={r} value={r} className="text-gray-900">{r}</option>
              ))}
            </select>
          </Field>

          {/* Address */}
          <Field
            label="Street Address"
            id={`${uid}-address`}
            error={err('address')}
            hint="Used to place the store on the region map"
          >
            <Input
              {...field('address')}
              placeholder="e.g. 1234 Westheimer Rd, Houston, TX"
              autoComplete="street-address"
            />
          </Field>

        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-gray-100 flex items-center justify-end bg-gray-50/50 rounded-b-2xl">
          <div className="flex items-center gap-2">
            <Button type="button" variant="ghost" size="sm" onClick={handleClose} disabled={geocoding}>
              Cancel
            </Button>
            <Button type="submit" variant="primary" size="sm" disabled={geocoding}>
              {geocoding ? (
                <>
                  <svg className="animate-spin" width="11" height="11" viewBox="0 0 11 11" fill="none">
                    <circle cx="5.5" cy="5.5" r="4" stroke="white" strokeWidth="1.5" strokeDasharray="12 6"/>
                  </svg>
                  Locating…
                </>
              ) : 'Add Store'}
            </Button>
          </div>
        </div>
      </form>
    </Modal>
  )
}

// ─── helpers ─────────────────────────────────────────────────────────────────

function Field({
  label, id, required, error, hint, children,
}: {
  label: string; id: string; required?: boolean
  error?: string; hint?: string; children: React.ReactNode
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
