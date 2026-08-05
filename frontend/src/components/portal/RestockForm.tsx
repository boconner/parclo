import { useState } from 'react'
import type { ReactNode } from 'react'
import type { StockLevel } from '@/lib/api'
import { BrandMark, useBrand } from '@/lib/brand'

// Shared UI for both customer-facing portals (per-store /r/:token and
// chain-level /c/:token). The two differ only in their header and in whether a
// location has to be chosen, so everything else lives here.
//
// Designed for a phone held one-handed behind a counter: big tap targets, one
// screen, no horizontal scroll.

// Three faces instead of a wordy radio list: it reads at a glance, is one tap,
// and works for staff who'd rather not parse "almost out" vs "out of stock".
const STOCK_OPTIONS: {
  value: StockLevel; face: string; label: string; selected: string
}[] = [
  { value: 'well_stocked', face: '🙂', label: 'Good',     selected: 'border-green-500 bg-green-50' },
  { value: 'getting_low',  face: '😐', label: 'Low',      selected: 'border-amber-500 bg-amber-50' },
  { value: 'out_of_stock', face: '🙁', label: 'Out',      selected: 'border-red-500 bg-red-50' },
]

export interface RestockFormValues {
  stockLevel:     StockLevel
  bottlesLeft:    number | null
  casesRequested: number | null
  materials:      string[]
  wantsRepVisit:  boolean
  note:           string | null
  submitterName:  string | null
  submitterEmail: string | null
  website:        string
}

export function PortalShell({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-screen bg-gray-50">
      <header className="h-14 flex items-center justify-center border-b border-gray-200 bg-white">
        <BrandMark className="h-7 w-auto" />
      </header>
      <main className="max-w-md mx-auto px-5 py-8">
        {children}
        <p className="text-[11px] text-gray-300 text-center mt-10">
          Powered by <span className="font-medium text-gray-400">Parclo</span>
        </p>
      </main>
    </div>
  )
}

export function PortalSuccess({ copySentTo }: { copySentTo?: string | null }) {
  const brand = useBrand()
  return (
    <PortalShell>
      <div className="text-center py-12">
        <div className="w-14 h-14 rounded-full bg-green-100 flex items-center justify-center mx-auto mb-4">
          <svg className="w-7 h-7 text-green-600" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
          </svg>
        </div>
        <h1 className="text-lg font-semibold text-gray-900">Thanks — we've got it</h1>
        <p className="text-sm text-gray-500 mt-2 max-w-xs mx-auto">
          The {brand.brandName} team has been notified and will follow up.
        </p>
        {copySentTo && (
          <p className="text-sm text-gray-500 mt-2 max-w-xs mx-auto">
            A copy is on its way to <span className="font-medium text-gray-700">{copySentTo}</span>.
          </p>
        )}
        <p className="text-xs text-gray-400 mt-6">You can close this page.</p>
      </div>
    </PortalShell>
  )
}

export function PortalNotFound() {
  const brand = useBrand()
  return (
    <PortalShell>
      <div className="text-center py-12">
        <h1 className="text-lg font-semibold text-gray-900">This code isn't active</h1>
        <p className="text-sm text-gray-500 mt-2 max-w-xs mx-auto">
          The QR code may have been replaced. Please ask your {brand.brandName} rep for a new one.
        </p>
      </div>
    </PortalShell>
  )
}

export function RestockForm({
  header, locationPicker, materials, canSubmit = true,
  isPending, error, onSubmit,
}: {
  header:          ReactNode
  /** Chain portal only — lets HQ name one of the chain's locations. */
  locationPicker?: ReactNode
  materials:       { value: string; label: string }[]
  /** Extra gate beyond stock level, e.g. a required location choice. */
  canSubmit?:      boolean
  isPending:       boolean
  error:           string | null
  onSubmit:        (values: RestockFormValues) => void
}) {
  const brand = useBrand()
  const [stockLevel,     setStockLevel]     = useState<StockLevel | null>(null)
  const [bottlesLeft,    setBottlesLeft]    = useState('')
  const [casesRequested, setCasesRequested] = useState('')
  const [chosenMaterials, setChosenMaterials] = useState<string[]>([])
  const [wantsRepVisit,  setWantsRepVisit]  = useState(false)
  const [note,           setNote]           = useState('')
  const [submitterName,  setSubmitterName]  = useState('')
  const [submitterEmail, setSubmitterEmail] = useState('')
  // Honeypot — hidden from real users, bots fill it in.
  const [website,        setWebsite]        = useState('')

  function toggleMaterial(value: string) {
    setChosenMaterials(prev =>
      prev.includes(value) ? prev.filter(m => m !== value) : [...prev, value])
  }

  return (
    <form
      onSubmit={e => {
        e.preventDefault()
        if (!stockLevel || !canSubmit) return
        onSubmit({
          stockLevel,
          bottlesLeft:    bottlesLeft    === '' ? null : Number(bottlesLeft),
          casesRequested: casesRequested === '' ? null : Number(casesRequested),
          materials:      chosenMaterials,
          wantsRepVisit,
          note:           note.trim() || null,
          submitterName:  submitterName.trim() || null,
          submitterEmail: submitterEmail.trim() || null,
          website,
        })
      }}
      className="space-y-7"
    >
      {header}
      {locationPicker}

      <fieldset>
        <legend className="text-sm font-semibold text-gray-900 mb-3">
          How's your {brand.brandName} stock?
        </legend>
        <div className="grid grid-cols-3 gap-2">
          {STOCK_OPTIONS.map(opt => (
            <label key={opt.value} className="block cursor-pointer">
              <input
                type="radio"
                name="stockLevel"
                value={opt.value}
                checked={stockLevel === opt.value}
                onChange={() => setStockLevel(opt.value)}
                className="sr-only peer"
              />
              <div
                className={`flex flex-col items-center gap-1 rounded-xl border-2 bg-white py-4
                            transition-colors ${
                  stockLevel === opt.value ? opt.selected : 'border-gray-200'
                }`}
              >
                <span className="text-3xl leading-none" aria-hidden="true">{opt.face}</span>
                <span className="text-xs font-semibold text-gray-900">{opt.label}</span>
              </div>
            </label>
          ))}
        </div>
      </fieldset>

      {/* Two counts side by side — keeps the form to one screen on a phone */}
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label htmlFor="bottlesLeft" className="block text-sm font-semibold text-gray-900 mb-2">
            Bottles on shelf
          </label>
          <input
            id="bottlesLeft"
            type="number"
            inputMode="numeric"
            min={0}
            max={999}
            value={bottlesLeft}
            onChange={e => setBottlesLeft(e.target.value)}
            placeholder="e.g. 2"
            className="w-full rounded-xl border-2 border-gray-200 px-4 py-3 text-sm focus:border-accent focus:outline-none"
          />
        </div>
        <div>
          <label htmlFor="casesRequested" className="block text-sm font-semibold text-gray-900 mb-2">
            Cases needed
          </label>
          <input
            id="casesRequested"
            type="number"
            inputMode="numeric"
            min={0}
            max={999}
            value={casesRequested}
            onChange={e => setCasesRequested(e.target.value)}
            placeholder="e.g. 3"
            className="w-full rounded-xl border-2 border-gray-200 px-4 py-3 text-sm focus:border-accent focus:outline-none"
          />
        </div>
      </div>

      {/* POS materials — the part the brand can fulfil directly */}
      <fieldset>
        <legend className="text-sm font-semibold text-gray-900 mb-3">
          Need anything else? <span className="font-normal text-gray-400">(optional)</span>
        </legend>
        <div className="space-y-2">
          {materials.map(m => (
            <label key={m.value} className="flex items-center gap-3 rounded-xl border-2 border-gray-200 bg-white p-3.5 cursor-pointer has-[:checked]:border-accent has-[:checked]:bg-accent-light">
              <input
                type="checkbox"
                checked={chosenMaterials.includes(m.value)}
                onChange={() => toggleMaterial(m.value)}
                className="w-5 h-5 rounded border-gray-300 text-accent focus:ring-accent"
              />
              <span className="text-sm text-gray-900">{m.label}</span>
            </label>
          ))}
          <label className="flex items-center gap-3 rounded-xl border-2 border-gray-200 bg-white p-3.5 cursor-pointer has-[:checked]:border-accent has-[:checked]:bg-accent-light">
            <input
              type="checkbox"
              checked={wantsRepVisit}
              onChange={e => setWantsRepVisit(e.target.checked)}
              className="w-5 h-5 rounded border-gray-300 text-accent focus:ring-accent"
            />
            <span className="text-sm text-gray-900">Have a rep stop by</span>
          </label>
        </div>
      </fieldset>

      <div>
        <label htmlFor="note" className="block text-sm font-semibold text-gray-900 mb-2">
          Anything we should know? <span className="font-normal text-gray-400">(optional)</span>
        </label>
        <textarea
          id="note"
          rows={3}
          maxLength={1000}
          value={note}
          onChange={e => setNote(e.target.value)}
          placeholder="Display moved, big order coming up, etc."
          className="w-full rounded-xl border-2 border-gray-200 px-4 py-3 text-sm focus:border-accent focus:outline-none resize-none"
        />
      </div>

      <div className="space-y-3">
        <div>
          <label htmlFor="submitterName" className="block text-sm font-semibold text-gray-900 mb-2">
            Your name <span className="font-normal text-gray-400">(optional)</span>
          </label>
          <input
            id="submitterName"
            type="text"
            maxLength={120}
            autoComplete="name"
            value={submitterName}
            onChange={e => setSubmitterName(e.target.value)}
            placeholder="So we know who to thank"
            className="w-full rounded-xl border-2 border-gray-200 px-4 py-3 text-sm focus:border-accent focus:outline-none"
          />
        </div>
        <div>
          <label htmlFor="submitterEmail" className="block text-sm font-semibold text-gray-900 mb-2">
            Your email <span className="font-normal text-gray-400">(optional)</span>
          </label>
          <input
            id="submitterEmail"
            type="email"
            maxLength={254}
            autoComplete="email"
            inputMode="email"
            value={submitterEmail}
            onChange={e => setSubmitterEmail(e.target.value)}
            placeholder="you@store.com"
            className="w-full rounded-xl border-2 border-gray-200 px-4 py-3 text-sm focus:border-accent focus:outline-none"
          />
          {/* States the benefit rather than just asking for the address */}
          <p className="text-xs text-gray-400 mt-1.5">
            We'll send you a copy of this request.
          </p>
        </div>
      </div>

      {/* Honeypot: off-screen rather than display:none, which some bots skip */}
      <div aria-hidden="true" className="absolute left-[-9999px] w-px h-px overflow-hidden">
        <label htmlFor="website">Website</label>
        <input
          id="website"
          type="text"
          tabIndex={-1}
          autoComplete="off"
          value={website}
          onChange={e => setWebsite(e.target.value)}
        />
      </div>

      {error && (
        <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-xl px-4 py-3">
          {error}
        </p>
      )}

      <button
        type="submit"
        disabled={!stockLevel || !canSubmit || isPending}
        className="w-full rounded-xl bg-accent hover:bg-accent-hover disabled:bg-gray-300 disabled:cursor-not-allowed text-white text-sm font-semibold py-4 transition-colors"
      >
        {isPending ? 'Sending…' : 'Send to my rep'}
      </button>

      <p className="text-xs text-gray-400 text-center leading-relaxed">
        This lets your {brand.brandName} rep know you're running low — it isn't an order.
        Product is supplied through your distributor as usual.
      </p>
    </form>
  )
}
