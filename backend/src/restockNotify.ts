import { Resend } from 'resend'
import { esc } from './html.js'

// Notification email for customer-portal restock requests. Kept separate from
// the rep-facing supply-request email because the audience and the framing are
// different: this goes to the rep who owns the store, and it is worded as a
// signal to act on, never as an order to fulfil.

const resend = process.env.RESEND_API_KEY ? new Resend(process.env.RESEND_API_KEY) : null

export const MATERIAL_LABELS: Record<string, string> = {
  shelf_talkers: 'Shelf talkers',
  menus:         'Menus / table tents',
  case_cards:    'Case cards',
  coasters:      'Coasters',
  swag:          'Branded swag',
}

const STOCK_LABELS: Record<string, string> = {
  well_stocked: 'Well stocked',
  getting_low:  'Getting low',
  almost_out:   'Almost out',
  out_of_stock: 'Out of stock',
}

const STOCK_COLORS: Record<string, string> = {
  well_stocked: '#16a34a',
  getting_low:  '#f59e0b',
  almost_out:   '#f97316',
  out_of_stock: '#ef4444',
}

/** Admin fallback recipients, reusing the existing supply-request config. */
function fallbackRecipients(): string[] {
  return (process.env.SUPPLY_REQUEST_EMAILS ?? '')
    .split(',')
    .map(e => e.trim())
    .filter(Boolean)
}

export interface RestockEmailInput {
  storeName:     string
  chainName?:    string | null
  /** True when filed from a chain QR code without naming a location. */
  chainWide?:    boolean
  storeAddress?: string | null
  regionName?:   string | null
  stockLevel:      string
  bottlesLeft?:    number | null
  casesRequested?: number | null
  materials:       string[]
  wantsRepVisit:   boolean
  note?:           string | null
  submitterName?:  string | null
  submitterEmail?: string | null
  submitterRole?:  string | null
  createdAt:       Date
  appUrl?:         string | null
}

/**
 * @param intro optional block placed above the details — used to turn the same
 *              layout into a receipt for the person who submitted the form.
 */
function buildHtml(r: RestockEmailInput, intro = ''): string {
  const stockLabel = STOCK_LABELS[r.stockLevel] ?? r.stockLevel
  const stockColor = STOCK_COLORS[r.stockLevel] ?? '#724fac'
  const submitted  = r.createdAt.toLocaleString('en-US', {
    weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit',
  })

  const materialRows = r.materials
    .map(m => `<li style="margin:0 0 4px;font-size:14px;color:#374151;">${esc(MATERIAL_LABELS[m] ?? m)}</li>`)
    .join('')

  const submitter = [r.submitterName, r.submitterRole].filter(Boolean).join(' · ')

  return `
<!DOCTYPE html>
<html>
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f8fafc;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f8fafc;padding:32px 16px;">
    <tr><td align="center">
      <table width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#fff;border-radius:12px;border:1px solid #e2e8f0;overflow:hidden;">

        <tr>
          <td style="background:#724fac;padding:24px 28px;">
            <p style="margin:0;font-size:11px;font-weight:600;color:rgba(255,255,255,0.7);letter-spacing:0.08em;text-transform:uppercase;">
              Contento · Store Request${r.chainName ? ` · ${esc(r.chainName)}` : ''}
            </p>
            <h1 style="margin:4px 0 0;font-size:20px;font-weight:700;color:#fff;">${esc(r.storeName)}</h1>
          </td>
        </tr>

        <tr>
          <td style="background:${stockColor};padding:12px 28px;">
            <p style="margin:0;font-size:15px;font-weight:700;color:#fff;">
              Stock reported: ${esc(stockLabel)}${r.bottlesLeft != null ? ` — about ${esc(r.bottlesLeft)} bottle(s) left` : ''}
            </p>
            ${r.casesRequested != null && r.casesRequested > 0 ? `
            <p style="margin:6px 0 0;font-size:14px;font-weight:600;color:rgba(255,255,255,0.92);">
              Requesting ${esc(r.casesRequested)} case(s)
            </p>` : ''}
          </td>
        </tr>

        <tr>
          <td style="padding:24px 28px;">
            ${intro}

            <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:20px;background:#f8fafc;border-radius:8px;border:1px solid #e2e8f0;">
              <tr>
                <td style="padding:14px 16px;">
                  <p style="margin:0 0 10px;font-size:11px;font-weight:600;color:#9ca3af;text-transform:uppercase;letter-spacing:0.06em;">
                    ${r.chainWide ? 'Chain' : 'Store'}
                  </p>
                  <p style="margin:0 0 6px;font-size:14px;color:#374151;"><strong>${esc(r.storeName)}</strong></p>
                  ${r.chainName ? `<p style="margin:0 0 6px;font-size:14px;color:#374151;">Chain: ${esc(r.chainName)}</p>` : ''}
                  ${r.chainWide ? `<p style="margin:0 0 6px;font-size:13px;color:#b45309;">Filed from the chain QR code — no single location named.</p>` : ''}
                  ${r.storeAddress ? `<p style="margin:0 0 6px;font-size:14px;color:#374151;">${esc(r.storeAddress)}</p>` : ''}
                  ${r.regionName ? `<p style="margin:0 0 6px;font-size:14px;color:#374151;">Region: ${esc(r.regionName)}</p>` : ''}
                  <p style="margin:0 0 4px;font-size:13px;color:#9ca3af;">Submitted ${esc(submitted)}${submitter ? ` by ${esc(submitter)}` : ''}</p>
                  ${r.submitterEmail ? `<p style="margin:0;font-size:13px;color:#374151;">📧 <a href="mailto:${esc(r.submitterEmail)}" style="color:#724fac;">${esc(r.submitterEmail)}</a></p>` : ''}
                </td>
              </tr>
            </table>

            ${r.wantsRepVisit ? `
            <p style="margin:0 0 16px;padding:10px 14px;background:#eef2ff;border:1px solid #c7d2fe;border-radius:8px;font-size:14px;color:#3730a3;font-weight:600;">
              🚗 They asked for a rep visit.
            </p>` : ''}

            ${materialRows ? `
            <p style="margin:0 0 8px;font-size:11px;font-weight:600;color:#9ca3af;text-transform:uppercase;letter-spacing:0.06em;">POS Materials Requested</p>
            <ul style="margin:0 0 20px;padding-left:20px;">${materialRows}</ul>
            ` : ''}

            ${r.note ? `
            <p style="margin:0 0 8px;font-size:11px;font-weight:600;color:#9ca3af;text-transform:uppercase;letter-spacing:0.06em;">Note From Store</p>
            <p style="margin:0 0 20px;font-size:14px;color:#374151;background:#f8fafc;border:1px solid #e2e8f0;border-radius:8px;padding:12px 14px;">${esc(r.note)}</p>
            ` : ''}

            ${r.appUrl ? `
            <a href="${esc(r.appUrl)}" style="display:inline-block;background:#724fac;color:#fff;font-size:14px;font-weight:600;text-decoration:none;padding:10px 18px;border-radius:8px;">Open in Contento</a>
            ` : ''}
          </td>
        </tr>

        <tr>
          <td style="padding:16px 28px;border-top:1px solid #f1f5f9;background:#f8fafc;">
            <p style="margin:0;font-size:12px;color:#9ca3af;">
              Submitted by retail staff via the in-store QR code. This is a restock
              signal, not an order — route product through the distributor as usual.
            </p>
          </td>
        </tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`
}

/**
 * Emails the internal recipient list about a new request.
 *
 * The store's owning rep is deliberately NOT included — these go to the central
 * list only, so requests are triaged in one place rather than landing in an
 * individual rep's inbox.
 *
 * Never throws: a notification failure must not fail the store's submission.
 */
export async function sendRestockEmail(input: RestockEmailInput): Promise<void> {
  const recipients = fallbackRecipients()
  if (!resend || recipients.length === 0) return

  const from   = process.env.RESEND_FROM_EMAIL ?? 'onboarding@resend.dev'
  const urgent = input.stockLevel === 'out_of_stock'
  // Lead with the chain: "Spec's — Austin" is triageable from a phone lock
  // screen in a way that "Austin" alone is not.
  const label  = input.chainWide
    ? `${input.chainName ?? 'Chain'} (chain-wide)`
    : input.chainName
      ? `${input.chainName} — ${input.storeName}`
      : input.storeName
  const subject = urgent
    ? `⚡ OUT OF STOCK — ${label}`
    : `Store Request — ${label}`

  try {
    await resend.emails.send({ from, to: recipients, subject, html: buildHtml(input) })
  } catch (err) {
    console.error('Restock email send failed:', err)
  }
}

/** Loose sanity check — enough to avoid sending to obvious junk, no more. */
export function looksLikeEmail(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(value)
}

/**
 * Sends the person who submitted the form their own copy, so they have a record
 * of what they asked for and who has it. Same details, receipt-style wording.
 *
 * Never throws, and is a no-op without a usable address.
 */
export async function sendRequesterCopy(input: RestockEmailInput): Promise<void> {
  const to = input.submitterEmail?.trim()
  if (!resend || !to || !looksLikeEmail(to)) return

  const from  = process.env.RESEND_FROM_EMAIL ?? 'onboarding@resend.dev'
  const label = input.chainWide
    ? `${input.chainName ?? 'your chain'} (all locations)`
    : input.chainName
      ? `${input.chainName} — ${input.storeName}`
      : input.storeName

  const receiptIntro = `
    <p style="margin:0 0 14px;font-size:14px;color:#374151;line-height:1.6;">
      Thanks${input.submitterName ? ` ${esc(input.submitterName)}` : ''} — we've received your
      request for <strong>${esc(label)}</strong> and the Contento team has been notified.
      Here's a copy for your records.
    </p>
    <p style="margin:0 0 20px;font-size:13px;color:#9ca3af;line-height:1.6;">
      This is a restock request, not a confirmed order — product is supplied
      through your distributor as usual. No reply is needed.
    </p>`

  try {
    await resend.emails.send({
      from,
      to:      [to],
      subject: `Your Contento request — ${label}`,
      html:    buildHtml(input, receiptIntro),
    })
  } catch (err) {
    console.error('Requester copy send failed:', err)
  }
}
