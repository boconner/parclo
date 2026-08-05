import { useState, useEffect, useId } from 'react'
import { clsx } from 'clsx'
import { Modal } from '@/components/ui/Modal'
import { Button } from '@/components/ui/Button'
import type { Rep } from '@/types'
import { useRegions } from '@/hooks/useQueries'

interface EditRepModalProps {
  rep: Rep | null
  open: boolean
  onClose: () => void
  onSave: (id: string, updates: {
    name: string; email: string; phone: string | null
    regionSlug: string; status: string; allRegions: boolean; markets: string[]
  }) => void
}

export function EditRepModal({ rep, open, onClose, onSave }: EditRepModalProps) {
  const uid = useId()
  const { data: regionsData } = useRegions()
  const regions = regionsData ?? []

  const [name,       setName]       = useState('')
  const [email,      setEmail]      = useState('')
  const [phone,      setPhone]      = useState('')
  const [regionSlug, setRegionSlug] = useState('')
  const [status,     setStatus]     = useState<'active' | 'inactive'>('active')
  const [allRegions, setAllRegions] = useState(false)
  const [markets,    setMarkets]    = useState<string[]>([])
  const [errors,     setErrors]     = useState<Record<string, string>>({})

  useEffect(() => {
    if (open && rep) {
      setName(rep.name)
      setEmail(rep.email)
      setPhone(rep.phone ?? '')
      setRegionSlug(rep.region)
      setStatus(rep.status)
      setAllRegions(rep.allRegions)
      const existingMarkets = rep.markets ?? []
      setMarkets(existingMarkets.includes(rep.region) ? existingMarkets : [rep.region, ...existingMarkets])
      setErrors({})
    }
  }, [open, rep])

  function toggleMarket(slug: string) {
    if (slug === regionSlug) return // primary region is always included
    setMarkets(prev =>
      prev.includes(slug) ? prev.filter(s => s !== slug) : [...prev, slug]
    )
  }

  function handleRegionChange(slug: string) {
    setRegionSlug(slug)
    // ensure new primary is in the markets list; drop old primary if it was only there as primary
    setMarkets(prev => {
      const without = prev.filter(s => s !== regionSlug)
      return without.includes(slug) ? without : [...without, slug]
    })
  }

  function validate() {
    const e: Record<string, string> = {}
    if (!name.trim())  e['name']  = 'Name is required'
    if (!email.trim()) e['email'] = 'Email is required'
    else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) e['email'] = 'Enter a valid email'
    if (!regionSlug)   e['region'] = 'Select a primary region'
    return e
  }

  function handleSave(e: React.FormEvent) {
    e.preventDefault()
    const errs = validate()
    setErrors(errs)
    if (Object.keys(errs).length) return
    if (!rep) return
    onSave(rep.id, {
      name:       name.trim(),
      email:      email.trim().toLowerCase(),
      phone:      phone.trim() || null,
      regionSlug,
      status,
      allRegions,
      markets:    allRegions ? [] : markets,
    })
  }

  if (!rep) return null

  return (
    <Modal open={open} onClose={onClose} title="Edit Rep" width="sm">
      <form onSubmit={handleSave} noValidate>
        <div className="px-6 py-5 space-y-4">

          <Field label="Full Name" id={`${uid}-name`} required error={errors['name']}>
            <Input
              id={`${uid}-name`}
              value={name}
              onChange={e => setName(e.target.value)}
              placeholder="e.g. Carlos Martinez"
            />
          </Field>

          <Field label="Email" id={`${uid}-email`} required error={errors['email']}>
            <Input
              id={`${uid}-email`}
              type="email"
              value={email}
              onChange={e => setEmail(e.target.value)}
              placeholder="e.g. carlos@stackline.com"
            />
          </Field>

          <Field label="Phone" id={`${uid}-phone`}>
            <Input
              id={`${uid}-phone`}
              type="tel"
              value={phone}
              onChange={e => setPhone(e.target.value)}
              placeholder="e.g. (512) 555-0100"
            />
          </Field>

          <Field label="Primary Region" id={`${uid}-region`} required error={errors['region']}>
            <select
              id={`${uid}-region`}
              value={regionSlug}
              onChange={e => handleRegionChange(e.target.value)}
              className={clsx(
                'w-full px-3 py-2 text-sm bg-white border rounded-lg outline-none transition-all',
                'focus:border-accent focus:ring-2 focus:ring-accent/10',
                errors['region'] ? 'border-red-300' : 'border-gray-200',
                !regionSlug && 'text-gray-400',
              )}
            >
              <option value="" disabled>Select region…</option>
              {regions.map(m => (
                <option key={m.slug} value={m.slug}>{m.name}</option>
              ))}
            </select>
          </Field>

          <Field label="Status" id={`${uid}-status`}>
            <div className="flex items-center gap-3">
              {(['active', 'inactive'] as const).map(s => (
                <label key={s} className="flex items-center gap-1.5 cursor-pointer">
                  <input
                    type="radio"
                    name={`${uid}-status`}
                    value={s}
                    checked={status === s}
                    onChange={() => setStatus(s)}
                    className="accent-accent"
                  />
                  <span className="text-sm text-gray-700 capitalize">{s}</span>
                </label>
              ))}
            </div>
          </Field>

          {/* Region access */}
          <div>
            <p className="text-xs font-medium text-gray-600 mb-2">Region Access</p>
            <label className="flex items-center gap-2.5 cursor-pointer mb-3">
              <div
                role="switch"
                aria-checked={allRegions}
                onClick={() => setAllRegions(v => !v)}
                className={clsx(
                  'relative w-9 h-5 rounded-full transition-colors cursor-pointer flex-shrink-0',
                  allRegions ? 'bg-accent' : 'bg-gray-200'
                )}
              >
                <span className={clsx(
                  'absolute top-0.5 left-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform',
                  allRegions && 'translate-x-4'
                )} />
              </div>
              <span className="text-sm text-gray-700">Access all regions</span>
            </label>

            {!allRegions && (
              <div className="space-y-1.5 ml-0.5">
                <p className="text-[11px] text-gray-400 mb-2">Select additional regions this rep can see:</p>
                {regions.map(m => {
                  const isPrimary = m.slug === regionSlug
                  return (
                    <label key={m.slug} className={clsx('flex items-center gap-2', isPrimary ? 'cursor-default' : 'cursor-pointer')}>
                      <input
                        type="checkbox"
                        checked={isPrimary || markets.includes(m.slug)}
                        onChange={() => toggleMarket(m.slug)}
                        disabled={isPrimary}
                        className="accent-accent rounded disabled:opacity-60"
                      />
                      <span className="text-sm text-gray-700">{m.name}</span>
                      {isPrimary && <span className="text-[10px] text-accent font-medium">primary</span>}
                    </label>
                  )
                })}
                {regions.length === 0 && (
                  <p className="text-xs text-gray-400 italic">No regions available</p>
                )}
              </div>
            )}
          </div>

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
