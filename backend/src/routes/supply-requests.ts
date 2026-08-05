import { Router } from 'express'
import { getAuth } from '@clerk/express'
import { prisma } from '../prisma.js'
import { Resend } from 'resend'
import { esc } from '../html.js'
import { getOrgSettings, type Brand } from '../orgSettings.js'

const router = Router()

const resend = process.env.RESEND_API_KEY ? new Resend(process.env.RESEND_API_KEY) : null

function getRecipients(): string[] {
  return (process.env.SUPPLY_REQUEST_EMAILS ?? '')
    .split(',')
    .map(e => e.trim())
    .filter(Boolean)
}

function buildEmailHtml(brand: Brand, req: {
  repName: string
  repEmail?: string | null
  repPhone?: string | null
  storeName?: string | null
  eventType?: string | null
  eventTitle?: string | null
  eventDate?: Date | null
  needByDate?: Date | null
  urgency: string
  items: string
  notes?: string | null
}): string {
  const items: { label: string; quantity?: number; details?: string }[] = JSON.parse(req.items)
  const dateStr = req.eventDate
    ? new Date(req.eventDate).toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })
    : 'Not specified'
  const needByStr = req.needByDate
    ? new Date(req.needByDate).toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })
    : null
  const typeLabel = req.eventType === 'tasting' ? 'Tasting'
    : req.eventType === 'private_event' ? 'Private Event'
    : req.eventType ?? 'Event'

  // Human-readable event name: private events use title, tastings show store
  const eventName = req.eventType === 'private_event' && req.eventTitle
    ? req.eventTitle
    : req.eventType === 'tasting' && req.storeName
    ? `Tasting at ${req.storeName}`
    : req.storeName ?? typeLabel

  const itemRows = items
    .filter(i => (i.quantity && i.quantity > 0) || i.details)
    .map(i => `
      <tr>
        <td style="padding:8px 12px;border-bottom:1px solid #f1f5f9;font-size:14px;color:#374151;">${esc(i.label)}</td>
        <td style="padding:8px 12px;border-bottom:1px solid #f1f5f9;font-size:14px;color:#374151;text-align:right;">
          ${i.quantity != null ? esc(i.quantity) : esc(i.details ?? '')}
        </td>
      </tr>`).join('')

  return `
<!DOCTYPE html>
<html>
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f8fafc;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f8fafc;padding:32px 16px;">
    <tr><td align="center">
      <table width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#fff;border-radius:12px;border:1px solid #e2e8f0;overflow:hidden;">

        <!-- Header -->
        <tr>
          <td style="background:${esc(brand.primaryColor)};padding:24px 28px;">
            <p style="margin:0;font-size:11px;font-weight:600;color:rgba(255,255,255,0.7);letter-spacing:0.08em;text-transform:uppercase;">${esc(brand.brandName)} · Supply Request</p>
            <h1 style="margin:4px 0 0;font-size:20px;font-weight:700;color:#fff;">${esc(eventName)}</h1>
          </td>
        </tr>

        <!-- Urgency banner -->
        ${req.urgency === 'urgent' ? `
        <tr>
          <td style="background:#fef2f2;padding:10px 28px;border-bottom:1px solid #fee2e2;">
            <p style="margin:0;font-size:13px;font-weight:700;color:#ef4444;">⚡ URGENT — Please respond as soon as possible</p>
          </td>
        </tr>` : ''}

        <!-- Body -->
        <tr>
          <td style="padding:24px 28px;">

            <!-- Event info -->
            <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:20px;background:#f8fafc;border-radius:8px;border:1px solid #e2e8f0;">
              <tr>
                <td style="padding:14px 16px;">
                  <p style="margin:0 0 10px;font-size:11px;font-weight:600;color:#9ca3af;text-transform:uppercase;letter-spacing:0.06em;">Event Details</p>
                  <p style="margin:0 0 6px;font-size:14px;color:#374151;"><strong>Event:</strong> ${esc(eventName)}</p>
                  <p style="margin:0 0 6px;font-size:14px;color:#374151;"><strong>Type:</strong> ${esc(typeLabel)}</p>
                  ${req.storeName ? `<p style="margin:0 0 6px;font-size:14px;color:#374151;"><strong>Store:</strong> ${esc(req.storeName)}</p>` : ''}
                  <p style="margin:0 0 6px;font-size:14px;color:#374151;"><strong>Event Date:</strong> ${esc(dateStr)}</p>
                  ${needByStr ? `<p style="margin:0 0 6px;font-size:14px;color:#374151;"><strong style="color:#ef4444;">Need By:</strong> ${esc(needByStr)}</p>` : ''}
                  <p style="margin:0 0 4px;font-size:14px;color:#374151;"><strong>Requested by:</strong> ${esc(req.repName)}</p>
                  ${req.repEmail ? `<p style="margin:0 0 4px;font-size:14px;color:#374151;">📧 <a href="mailto:${esc(req.repEmail)}" style="color:${esc(brand.primaryColor)};">${esc(req.repEmail)}</a></p>` : ''}
                  ${req.repPhone ? `<p style="margin:0;font-size:14px;color:#374151;">📞 <a href="tel:${esc(req.repPhone)}" style="color:${esc(brand.primaryColor)};">${esc(req.repPhone)}</a></p>` : ''}
                </td>
              </tr>
            </table>

            <!-- Items -->
            <p style="margin:0 0 10px;font-size:11px;font-weight:600;color:#9ca3af;text-transform:uppercase;letter-spacing:0.06em;">Items Requested</p>
            <table width="100%" cellpadding="0" cellspacing="0" style="border:1px solid #e2e8f0;border-radius:8px;overflow:hidden;margin-bottom:20px;">
              <thead>
                <tr style="background:#f8fafc;">
                  <th style="padding:8px 12px;text-align:left;font-size:11px;font-weight:600;color:#9ca3af;text-transform:uppercase;letter-spacing:0.06em;">Item</th>
                  <th style="padding:8px 12px;text-align:right;font-size:11px;font-weight:600;color:#9ca3af;text-transform:uppercase;letter-spacing:0.06em;">Qty / Details</th>
                </tr>
              </thead>
              <tbody>${itemRows || '<tr><td colspan="2" style="padding:12px;font-size:13px;color:#9ca3af;text-align:center;">No items specified</td></tr>'}</tbody>
            </table>

            ${req.notes ? `
            <!-- Notes -->
            <p style="margin:0 0 8px;font-size:11px;font-weight:600;color:#9ca3af;text-transform:uppercase;letter-spacing:0.06em;">Additional Notes</p>
            <p style="margin:0;font-size:14px;color:#374151;background:#f8fafc;border:1px solid #e2e8f0;border-radius:8px;padding:12px 14px;">${esc(req.notes)}</p>
            ` : ''}
          </td>
        </tr>

        <!-- Footer -->
        <tr>
          <td style="padding:16px 28px;border-top:1px solid #f1f5f9;background:#f8fafc;">
            <p style="margin:0;font-size:12px;color:#9ca3af;">Sent from ${esc(brand.brandName)} · Log in to manage supply requests</p>
          </td>
        </tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`
}

// GET /api/supply-requests — admin: list all
router.get('/', async (_req, res) => {
  try {
    const requests = await prisma.supplyRequest.findMany({
      orderBy: { createdAt: 'desc' },
    })
    res.json(requests.map(r => ({ ...r, items: JSON.parse(r.items) })))
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: 'Internal server error' })
  }
})

// POST /api/supply-requests — create + send email
router.post('/', async (req, res) => {
  try {
    const { eventId, eventType, eventDate, needByDate, eventTitle, storeName, items, urgency, notes } = req.body

    const { userId } = getAuth(req)
    let repName  = req.body.repName  ?? 'Unknown'
    let repEmail: string | null = req.body.repEmail ?? null
    let repPhone: string | null = null

    if (userId) {
      const myRep = await prisma.rep.findFirst({
        where:  { clerkUserId: userId },
        select: { name: true, email: true, phone: true },
      })
      if (myRep) {
        repName  = myRep.name
        repEmail = myRep.email
        repPhone = myRep.phone ?? null
      }
    }

    const request = await prisma.supplyRequest.create({
      data: {
        eventId:    eventId    || null,
        eventType:  eventType  || null,
        eventDate:  eventDate  ? new Date(eventDate)  : null,
        needByDate: needByDate ? new Date(needByDate) : null,
        eventTitle: eventTitle || null,
        storeName:  storeName  || null,
        repName,
        repEmail,
        repPhone,
        items:   JSON.stringify(items ?? []),
        urgency: urgency ?? 'normal',
        notes:   notes   || null,
      },
    })

    // Send email notification
    const recipients = getRecipients()
    if (resend && recipients.length > 0) {
      const brand = await getOrgSettings()
      const from  = brand.fromEmail ?? process.env.RESEND_FROM_EMAIL ?? 'onboarding@resend.dev'
      const emailLabel = eventType === 'private_event' && eventTitle
        ? eventTitle
        : eventType === 'tasting' && storeName
        ? `Tasting at ${storeName}`
        : storeName ?? (eventType === 'tasting' ? 'Tasting' : 'Private Event')
      const subject = urgency === 'urgent'
        ? `⚡ URGENT Supply Request — ${emailLabel}`
        : `Supply Request — ${emailLabel}`

      await resend.emails.send({
        from,
        to:      recipients,
        subject,
        html:    buildEmailHtml(brand, request),
      }).catch(err => console.error('Email send failed:', err))
    }

    res.status(201).json({ ...request, items: JSON.parse(request.items) })
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: 'Internal server error' })
  }
})

// PATCH /api/supply-requests/:id — mark fulfilled/pending
router.patch('/:id', async (req, res) => {
  try {
    const { status } = req.body
    const request = await prisma.supplyRequest.update({
      where: { id: req.params['id'] },
      data:  { status },
    })
    res.json({ ...request, items: JSON.parse(request.items) })
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: 'Internal server error' })
  }
})

export default router
