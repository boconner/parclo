import { Link } from 'react-router-dom'
import { clsx } from 'clsx'
import { useSetupStatus } from '@/hooks/useQueries'
import { useBrand } from '@/lib/brand'

// Getting Started — the out-of-the-box onboarding checklist. Completion is
// derived from data presence (see /api/settings/setup-status), so steps check
// themselves off no matter how the data got there. Each step deep-links into
// the page that does the real work rather than duplicating its form here.

interface Step {
  title: string
  detail: string
  done: boolean
  to: string
  cta: string
}

export default function AdminSetup() {
  const { data: status } = useSetupStatus()
  const brand = useBrand()

  if (!status) {
    return <div className="p-4 lg:p-8"><div className="bg-white border border-gray-200 rounded-xl py-16 text-center text-sm text-gray-400">Loading…</div></div>
  }

  const steps: Step[] = [
    {
      title:  'Make it yours',
      detail: 'Brand name, logo, and accent color — shown across the app, store portals, printed QR cards, and emails.',
      done:   status.brandingConfigured,
      to:     '/admin/branding',
      cta:    'Open Branding',
    },
    {
      title:  'Add your products',
      detail: 'Shelf levels, orders, and reports all reference your product list.',
      done:   status.productCount > 0,
      to:     '/admin/products',
      cta:    'Add Products',
    },
    {
      title:  'Import your stores',
      detail: 'Bring in every account that stocks you — a CSV import handles hundreds at once, with regions and chains created on the fly.',
      done:   status.storeCount > 0,
      to:     '/admin/stores',
      cta:    'Import Stores',
    },
    {
      title:  'Invite your reps',
      detail: 'Each rep gets an email invitation and sees only their own regions and stores.',
      done:   status.repCount > 0,
      to:     '/admin/reps',
      cta:    'Invite Reps',
    },
    {
      title:  'Print store QR codes',
      detail: 'The card a rep leaves at the register — store staff scan it to request restocks, no app or login needed.',
      done:   status.qrIssuedCount > 0,
      to:     '/stores',
      cta:    'Open Stores',
    },
  ]

  const doneCount = steps.filter(s => s.done).length

  return (
    <div className="p-4 lg:p-8 max-w-2xl">

      <div className="mb-6">
        <h1 className="text-xl font-semibold text-gray-900 tracking-tight">Getting Started</h1>
        <p className="text-sm text-gray-400 mt-0.5">
          {status.complete
            ? `${brand.brandName} is fully set up.`
            : `${doneCount} of ${steps.length} steps done — finish these and your team is live.`}
        </p>
      </div>

      {/* Progress */}
      <div className="h-1.5 bg-gray-100 rounded-full mb-6 overflow-hidden">
        <div
          className="h-full bg-accent rounded-full transition-all duration-500"
          style={{ width: `${(doneCount / steps.length) * 100}%` }}
        />
      </div>

      <ol className="space-y-3">
        {steps.map((step, i) => (
          <li
            key={step.title}
            className={clsx(
              'bg-white border rounded-xl p-4 flex items-start gap-4',
              step.done ? 'border-gray-100' : 'border-gray-200',
            )}
          >
            <div className={clsx(
              'w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5',
              step.done ? 'bg-green-100 text-green-600' : 'bg-accent-light text-accent',
            )}>
              {step.done
                ? <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3"><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7"/></svg>
                : <span className="text-xs font-bold">{i + 1}</span>}
            </div>
            <div className="flex-1 min-w-0">
              <p className={clsx('text-sm font-semibold', step.done ? 'text-gray-400 line-through decoration-gray-300' : 'text-gray-900')}>
                {step.title}
              </p>
              <p className="text-xs text-gray-400 mt-0.5 leading-relaxed">{step.detail}</p>
            </div>
            {!step.done && (
              <Link
                to={step.to}
                className="flex-shrink-0 px-3 py-1.5 text-xs font-semibold bg-accent text-white rounded-lg hover:bg-accent-hover transition-colors mt-0.5"
              >
                {step.cta}
              </Link>
            )}
          </li>
        ))}
      </ol>

      {status.complete && (
        <p className="text-xs text-gray-400 mt-6">
          All set. These pages stay available under Configuration whenever you need them.
        </p>
      )}
    </div>
  )
}
