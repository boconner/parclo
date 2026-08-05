import { useState, useRef } from 'react'
import { QRCodeSVG } from 'qrcode.react'
import { Button } from '@/components/ui/Button'
import { toast } from '@/components/ui/Toast'
import type { StorePortalToken } from '@/lib/api'
import contentoLogo from '@/assets/contento.png'

// Admin-only panel that generates and prints a customer-facing QR code. Used for
// both the per-store code (a rep leaves it in-store) and the chain-level code
// (handed to an HQ buyer).
//
// Token hooks are supplied by the caller rather than chosen here, so this stays
// agnostic about which kind of code it is rendering.
//
// Printing opens a standalone window rather than using a CSS print stylesheet,
// so the card prints identically regardless of what else is on the page.

export type PortalKind = 'store' | 'chain'

const COPY: Record<PortalKind, {
  panelTitle: string
  panelHint:  string
  emptyHint:  string
  cardEyebrow: string
  cardHeading: string
  cardSteps:   string
  urlPrefix:   string
}> = {
  store: {
    panelTitle:  'Store QR Code',
    panelHint:   'Lets staff report low stock without an account',
    emptyHint:   'No code yet. Generate one, print it, and leave it with the buyer.',
    cardEyebrow: 'Running low on Contento?',
    cardHeading: 'Scan to tell us',
    cardSteps:   'Point your phone camera at the code.<br/>Takes about 10 seconds — no app or login.',
    urlPrefix:   '/r/',
  },
  chain: {
    panelTitle:  'Chain QR Code',
    panelHint:   'For an HQ buyer covering multiple locations',
    emptyHint:   'No code yet. Generate one and share it with the chain buyer.',
    cardEyebrow: 'Need more Contento?',
    cardHeading: 'Scan to request',
    cardSteps:   'Point your phone camera at the code.<br/>Choose a location or request account-wide.',
    urlPrefix:   '/c/',
  },
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"]/g,
    ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[ch]!)
}

/**
 * Origin-qualified logo URL for the print window.
 *
 * The print window is about:blank, which has no base URL, so the root-relative
 * path Vite emits ("/assets/contento-<hash>.png") would not resolve there. Left
 * as-is when the bundler inlines it as a data: URI or points at another host.
 */
function absoluteLogoUrl(): string {
  if (/^(data:|https?:|blob:)/i.test(contentoLogo)) return contentoLogo
  return `${window.location.origin}${contentoLogo.startsWith('/') ? '' : '/'}${contentoLogo}`
}

export function PortalQrCard({
  kind, title, subtitle, tokenQuery, issue, rotateWarning,
}: {
  kind:     PortalKind
  /** Primary line on the printed card (store name, or chain name). */
  title:    string
  /** Secondary line, e.g. the chain a store belongs to. */
  subtitle: string | null
  tokenQuery: { data?: StorePortalToken; isLoading: boolean; error?: Error | null }
  issue: {
    isPending: boolean
    error?: Error | null
    mutate: (rotate: boolean, opts?: { onSuccess?: () => void }) => void
  }
  rotateWarning: string
}) {
  const [confirmRotate, setConfirmRotate] = useState(false)
  const qrWrapRef = useRef<HTMLDivElement>(null)

  const copy      = COPY[kind]
  const token     = tokenQuery.data?.token ?? null
  const portalUrl = token ? `${window.location.origin}${copy.urlPrefix}${token}` : null

  function handlePrint() {
    const svg = qrWrapRef.current?.querySelector('svg')
    if (!svg || !portalUrl) return

    const svgMarkup = new XMLSerializer().serializeToString(svg)
    const win = window.open('', '_blank', 'width=800,height=900')
    if (!win) {
      toast('Allow pop-ups to print the QR card.', 'error')
      return
    }

    // Names are admin-entered, but these strings are written into a document,
    // so treat them like any other interpolated value.
    const safeTitle    = escapeHtml(title)
    const safeSubtitle = subtitle ? escapeHtml(subtitle) : ''

    win.document.write(`<!doctype html>
<html><head><title>Contento — ${safeSubtitle ? `${safeSubtitle} ` : ''}${safeTitle}</title>
<style>
  @page { margin: 0.5in; }
  body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
         display: flex; align-items: center; justify-content: center;
         min-height: 100vh; margin: 0;
         /* Browsers strip background colours and images when printing unless
            this is set — without it the logo and purple border drop out. */
         -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  .card { width: 4in; border: 2px solid #724fac; border-radius: 16px;
          padding: 28px; text-align: center; }
  .logo { height: 32px; width: auto; margin: 0 auto 18px; display: block; }
  .eyebrow { font-size: 11px; font-weight: 700; letter-spacing: 0.1em;
             text-transform: uppercase; color: #724fac; margin: 0 0 6px; }
  h1 { font-size: 20px; margin: 0 0 4px; color: #111827; }
  .chain { font-size: 15px; font-weight: 700; color: #111827; margin: 0 0 2px; }
  .store { font-size: 13px; color: #6b7280; margin: 0 0 20px; }
  .qr { display: flex; justify-content: center; margin-bottom: 18px; }
  .steps { font-size: 13px; color: #374151; margin: 0 0 16px; line-height: 1.6; }
  .url { font-size: 10px; color: #9ca3af; word-break: break-all; margin: 0; }
  .foot { font-size: 10px; color: #9ca3af; margin: 14px 0 0; }
</style></head>
<body><div class="card">
  <img class="logo" src="${absoluteLogoUrl()}" alt="Contento"
       onerror="this.style.display='none'" />
  <p class="eyebrow">${copy.cardEyebrow}</p>
  <h1>${copy.cardHeading}</h1>
  ${safeSubtitle ? `<p class="chain">${safeSubtitle}</p>` : ''}
  <p class="store">${safeTitle}</p>
  <div class="qr">${svgMarkup}</div>
  <p class="steps">${copy.cardSteps}</p>
  <p class="url">${portalUrl}</p>
  <p class="foot">Powered by ParClo</p>
</div>
<script>
  // Print once the logo has loaded, with a timeout fallback so a slow or
  // blocked image can never leave the user staring at an unprinted card.
  var printed = false;
  function go() { if (printed) return; printed = true; window.print(); }
  window.onload = go;
  setTimeout(go, 3000);
<\/script>
</body></html>`)
    win.document.close()
  }

  async function handleCopy() {
    if (!portalUrl) return
    try {
      await navigator.clipboard.writeText(portalUrl)
      toast('Portal link copied', 'success')
    } catch {
      toast('Could not copy the link', 'error')
    }
  }

  return (
    <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
      <div className="px-5 py-4 border-b border-gray-100">
        <h2 className="text-sm font-semibold text-gray-900">{copy.panelTitle}</h2>
        <p className="text-xs text-gray-400 mt-0.5">{copy.panelHint}</p>
      </div>

      <div className="px-5 py-4">
        {/* Shown in place, not just as a toast — a transient toast is easy to
            miss, which makes a failed generate look like nothing happened. */}
        {(issue.error || tokenQuery.error) && (
          <p className="mb-3 rounded-lg bg-red-50 border border-red-100 px-3 py-2 text-xs text-red-700">
            {(issue.error ?? tokenQuery.error)?.message === 'Forbidden'
              ? 'Your account lacks admin permission on the API. Ask an admin to check your role.'
              : (issue.error ?? tokenQuery.error)?.message}
          </p>
        )}
        {tokenQuery.isLoading ? (
          <p className="text-xs text-gray-400">Loading…</p>
        ) : !token ? (
          <>
            <p className="text-xs text-gray-500 mb-3">{copy.emptyHint}</p>
            <Button
              variant="primary" size="sm"
              disabled={issue.isPending}
              onClick={() => issue.mutate(false)}
            >
              {issue.isPending ? 'Generating…' : 'Generate QR code'}
            </Button>
          </>
        ) : (
          <>
            {/* Tappable as well as scannable: on a phone you can't scan the
                screen you're holding, so opening the portal directly is the
                only way to check what the code actually leads to. The ref stays
                on the wrapper so printing still finds the <svg> inside. */}
            <div ref={qrWrapRef} className="flex flex-col items-center mb-4">
              <a
                href={portalUrl!}
                target="_blank"
                rel="noopener noreferrer"
                aria-label={`Open the ${kind === 'chain' ? 'chain' : 'store'} request form in a new tab`}
                className="p-3 bg-white border border-gray-200 rounded-xl transition-colors
                           hover:border-accent focus:border-accent focus:outline-none
                           focus:ring-2 focus:ring-accent/20"
              >
                {/* Level "M" keeps the code readable if the printed card scuffs */}
                <QRCodeSVG value={portalUrl!} size={148} level="M" marginSize={0} />
              </a>
              <span className="mt-2 text-[11px] text-gray-400">
                <span className="sm:hidden">Tap the code to open the form</span>
                <span className="hidden sm:inline">Scan it, or click to open the form</span>
              </span>
            </div>

            <div className="flex items-center gap-2 mb-3">
              <Button variant="primary" size="sm" onClick={handlePrint}>
                Print card
              </Button>
              <Button variant="ghost" size="sm" onClick={handleCopy}>
                Copy link
              </Button>
            </div>

            <p className="text-[11px] text-gray-500 mb-1">
              Card prints as{' '}
              <span className="font-medium text-gray-700">
                {subtitle ? `${subtitle} · ${title}` : title}
              </span>
            </p>
            {tokenQuery.data?.issuedAt && (
              <p className="text-[10px] text-gray-400">
                Issued {new Date(tokenQuery.data.issuedAt).toLocaleDateString('en-US', {
                  month: 'short', day: 'numeric', year: 'numeric',
                })}
              </p>
            )}

            <div className="mt-4 pt-3 border-t border-gray-100">
              {!confirmRotate ? (
                <button
                  onClick={() => setConfirmRotate(true)}
                  className="text-[11px] text-gray-400 hover:text-red-600"
                >
                  Rotate code
                </button>
              ) : (
                <div className="rounded-lg bg-red-50 border border-red-100 p-3">
                  <p className="text-[11px] text-red-700 mb-2">{rotateWarning}</p>
                  <div className="flex items-center gap-2">
                    <Button
                      variant="danger" size="sm"
                      disabled={issue.isPending}
                      onClick={() => issue.mutate(true, {
                        onSuccess: () => {
                          setConfirmRotate(false)
                          toast('New QR code issued', 'success')
                        },
                      })}
                    >
                      {issue.isPending ? 'Rotating…' : 'Yes, rotate'}
                    </Button>
                    <Button variant="ghost" size="sm" onClick={() => setConfirmRotate(false)}>
                      Cancel
                    </Button>
                  </div>
                </div>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  )
}
