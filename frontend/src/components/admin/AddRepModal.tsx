import { useState, useId } from 'react'
import { clsx } from 'clsx'
import { Modal } from '@/components/ui/Modal'
import { Button } from '@/components/ui/Button'
import { Rep } from '@/types'
import { useRegions } from '@/hooks/useQueries'

interface AddRepModalProps {
  open: boolean
  onClose: () => void
  onAdd: (rep: Rep) => void
}

interface FormValues {
  name:        string
  email:       string
  phone:       string
  allRegions:  boolean
  regionSlugs: string[]
}

const EMPTY: FormValues = { name: '', email: '', phone: '', allRegions: false, regionSlugs: [] }
type Errors = Partial<{ name: string; email: string; phone: string; regions: string }>

function validate(v: FormValues): Errors {
  const e: Errors = {}
  if (!v.name.trim())  e.name  = 'Name is required'
  if (!v.email.trim()) e.email = 'Email is required'
  else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v.email)) e.email = 'Enter a valid email'
  if (v.phone.trim() && !/^[\d\s().+\-]+$/.test(v.phone)) e.phone = 'Enter a valid phone number'
  if (!v.allRegions && v.regionSlugs.length === 0) e.regions = 'Select at least one region'
  return e
}

export function AddRepModal({ open, onClose, onAdd }: AddRepModalProps) {
  const uid = useId()
  const [values, setValues]   = useState<FormValues>(EMPTY)
  const [errors, setErrors]   = useState<Errors>({})
  const [touched, setTouched] = useState<Partial<{ name: boolean; email: boolean; phone: boolean; regions: boolean }>>({})

  const { data: regionsData } = useRegions()
  const regions = regionsData ?? []

  function set<K extends keyof FormValues>(key: K, val: FormValues[K]) {
    setValues(v => ({ ...v, [key]: val }))
  }

  function toggleRegion(slug: string) {
    setValues(v => ({
      ...v,
      regionSlugs: v.regionSlugs.includes(slug)
        ? v.regionSlugs.filter(s => s !== slug)
        : [...v.regionSlugs, slug],
    }))
    setTouched(t => ({ ...t, regions: true }))
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setTouched({ name: true, email: true, phone: true, regions: true })
    const errs = validate(values)
    setErrors(errs)
    if (Object.keys(errs).length) return

    const primarySlug = values.allRegions ? (regions[0]?.slug ?? '') : values.regionSlugs[0]
    const primaryName = regions.find(m => m.slug === primarySlug)?.name ?? ''

    onAdd({
      id:         `rep-${Date.now()}`,
      name:       values.name.trim(),
      email:      values.email.trim().toLowerCase(),
      phone:      values.phone.trim() || null,
      allRegions: values.allRegions,
      markets:    values.allRegions ? regions.map(m => m.slug) : values.regionSlugs,
      region:     primarySlug,
      regionName: primaryName,
      status:     'active',
    })
    reset()
    onClose()
  }

  function reset() {
    setValues(EMPTY)
    setErrors({})
    setTouched({})
  }

  function handleClose() { reset(); onClose() }

  const err = {
    name:    touched.name    ? errors.name    : undefined,
    email:   touched.email   ? errors.email   : undefined,
    phone:   touched.phone   ? errors.phone   : undefined,
    regions: touched.regions ? errors.regions : undefined,
  }

  return (
    <Modal open={open} onClose={handleClose} title="Add Rep" subtitle="Create a new sales rep and assign their territory" width="sm">
      <form onSubmit={handleSubmit} noValidate>
        <div className="px-6 py-5 space-y-4">

          <Field label="Full Name" id={`${uid}-name`} required error={err.name}>
            <Input
              id={`${uid}-name`}
              value={values.name}
              onChange={e => set('name', e.target.value)}
              onBlur={() => { setTouched(t => ({ ...t, name: true })); setErrors(validate(values)) }}
              placeholder="e.g. Carlos Martinez"
            />
          </Field>

          <Field label="Email" id={`${uid}-email`} required error={err.email}>
            <Input
              id={`${uid}-email`}
              type="email"
              value={values.email}
              onChange={e => set('email', e.target.value)}
              onBlur={() => { setTouched(t => ({ ...t, email: true })); setErrors(validate(values)) }}
              placeholder="e.g. carlos@example.com"
            />
          </Field>

          <Field label="Phone" id={`${uid}-phone`} error={err.phone}>
            <Input
              id={`${uid}-phone`}
              type="tel"
              value={values.phone}
              onChange={e => set('phone', e.target.value)}
              onBlur={() => { setTouched(t => ({ ...t, phone: true })); setErrors(validate(values)) }}
              placeholder="e.g. (512) 555-0100"
            />
          </Field>

          {/* Region assignment */}
          <div>
            <p className="text-xs font-medium text-gray-600 mb-2">
              Region Assignment<span className="text-red-400 ml-0.5">*</span>
            </p>

            {/* Toggle */}
            <div className="flex rounded-lg border border-gray-200 overflow-hidden mb-3">
              <button
                type="button"
                onClick={() => { set('allRegions', true); setTouched(t => ({ ...t, regions: true })) }}
                className={clsx(
                  'flex-1 py-1.5 text-xs font-medium transition-colors',
                  values.allRegions
                    ? 'bg-accent text-white'
                    : 'bg-white text-gray-500 hover:bg-gray-50',
                )}
              >
                All Regions
              </button>
              <button
                type="button"
                onClick={() => { set('allRegions', false); setTouched(t => ({ ...t, regions: true })) }}
                className={clsx(
                  'flex-1 py-1.5 text-xs font-medium border-l border-gray-200 transition-colors',
                  !values.allRegions
                    ? 'bg-accent text-white'
                    : 'bg-white text-gray-500 hover:bg-gray-50',
                )}
              >
                Selected Regions
              </button>
            </div>

            {/* Region checkboxes */}
            {!values.allRegions && (
              <div className="space-y-1.5 max-h-36 overflow-y-auto pr-1">
                {regions.length === 0 ? (
                  <p className="text-xs text-gray-400 italic">No regions available</p>
                ) : (
                  regions.map(m => (
                    <label key={m.slug} className="flex items-center gap-2.5 cursor-pointer group">
                      <input
                        type="checkbox"
                        checked={values.regionSlugs.includes(m.slug)}
                        onChange={() => toggleRegion(m.slug)}
                        className="w-3.5 h-3.5 rounded border-gray-300 text-accent accent-[color:var(--accent)] cursor-pointer"
                      />
                      <span className="text-sm text-gray-700 group-hover:text-gray-900">{m.name}</span>
                    </label>
                  ))
                )}
              </div>
            )}

            {values.allRegions && (
              <p className="text-xs text-gray-400">This rep will have access to all current and future regions.</p>
            )}

            {err.regions && <p className="mt-1.5 text-xs text-red-500">{err.regions}</p>}
          </div>

        </div>

        <div className="px-6 py-4 border-t border-gray-100 flex items-center justify-between bg-gray-50/50 rounded-b-2xl">
          <p className="text-xs text-gray-400"><span className="text-red-400">*</span> Required</p>
          <div className="flex gap-2">
            <Button type="button" variant="ghost" size="sm" onClick={handleClose}>Cancel</Button>
            <Button type="submit" variant="primary" size="sm">Add Rep</Button>
          </div>
        </div>
      </form>
    </Modal>
  )
}

function Field({ label, id, required, error, children }: {
  label: string; id: string; required?: boolean; error?: string; children: React.ReactNode
}) {
  return (
    <div>
      <label htmlFor={id} className="block text-xs font-medium text-gray-600 mb-1.5">
        {label}{required && <span className="text-red-400 ml-0.5">*</span>}
      </label>
      {children}
      {error && <p className="mt-1 text-xs text-red-500">{error}</p>}
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
