import { useEffect, useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Button } from '@/components/ui/Button'
import { toast } from '@/components/ui/Toast'
import { api, type OrgSettings } from '@/lib/api'
import { applyBrandTheme, DEFAULT_BRAND } from '@/lib/brand'

// Configuration → Branding. Everything customer-visible reads from OrgSettings,
// so this page is what makes a deployment "theirs": name, logo, color, emails.

const emptyForm: OrgSettings = {
  brandName:    DEFAULT_BRAND.brandName,
  logoUrl:      null,
  primaryColor: DEFAULT_BRAND.primaryColor,
  fromEmail:    null,
  supportEmail: null,
  appUrl:       null,
  featureEvents:   true,
  featurePipeline: true,
}

export default function AdminBranding() {
  const qc = useQueryClient()
  const { data: settings } = useQuery({ queryKey: ['org-settings'], queryFn: api.getOrgSettings })

  const [form, setForm]     = useState<OrgSettings>(emptyForm)
  const [dirty, setDirty]   = useState(false)

  useEffect(() => {
    if (settings && !dirty) setForm(settings)
  }, [settings, dirty])

  const save = useMutation({
    mutationFn: (body: OrgSettings) => api.updateOrgSettings(body),
    onSuccess: saved => {
      setDirty(false)
      qc.invalidateQueries({ queryKey: ['org-settings'] })
      // Refresh the live theme and the cached copy the next page-load paints from.
      applyBrandTheme(saved.primaryColor)
      document.title = saved.brandName
      try {
        localStorage.setItem('brand', JSON.stringify({
          brandName: saved.brandName, logoUrl: saved.logoUrl, primaryColor: saved.primaryColor,
        }))
      } catch { /* storage blocked — theme still applied */ }
      toast('Branding saved', 'success')
    },
    onError: (err: Error) => toast(err.message, 'error'),
  })

  function patch(updates: Partial<OrgSettings>) {
    setForm(f => ({ ...f, ...updates }))
    setDirty(true)
  }

  const validColor = /^#[0-9a-fA-F]{6}$/.test(form.primaryColor)
  const input = 'w-full px-3 py-2 text-sm bg-white border border-gray-200 rounded-lg outline-none transition-all placeholder:text-gray-400 focus:border-accent focus:ring-2 focus:ring-accent/10'
  const label = 'block text-xs font-medium text-gray-600 mb-1.5'

  return (
    <div className="p-4 lg:p-8 max-w-2xl">

      <div className="mb-6">
        <h1 className="text-xl font-semibold text-gray-900 tracking-tight">Branding</h1>
        <p className="text-sm text-gray-400 mt-0.5">
          Name, logo, and color shown across the app, store portals, printed QR cards, emails, and reports.
        </p>
      </div>

      <form
        onSubmit={e => { e.preventDefault(); if (validColor && form.brandName.trim()) save.mutate(form) }}
        className="bg-white border border-gray-200 rounded-xl divide-y divide-gray-100"
      >
        <div className="p-5 space-y-4">
          <div>
            <label className={label}>Brand Name<span className="text-red-400 ml-0.5">*</span></label>
            <input type="text" value={form.brandName} onChange={e => patch({ brandName: e.target.value })} className={input} />
            <p className="mt-1 text-xs text-gray-400">Appears everywhere the product speaks for you — "How's your {form.brandName.trim() || '…'} stock?"</p>
          </div>
          <div>
            <label className={label}>Logo URL</label>
            <input
              type="url" value={form.logoUrl ?? ''} placeholder="https://…/logo.png"
              onChange={e => patch({ logoUrl: e.target.value || null })} className={input}
            />
            <p className="mt-1 text-xs text-gray-400">Optional. Without one, the brand name is shown as a wordmark.</p>
          </div>
          <div>
            <label className={label}>Accent Color</label>
            <div className="flex items-center gap-2">
              <input
                type="color"
                value={validColor ? form.primaryColor : DEFAULT_BRAND.primaryColor}
                onChange={e => patch({ primaryColor: e.target.value })}
                className="h-9 w-12 rounded-lg border border-gray-200 bg-white p-1 cursor-pointer"
              />
              <input
                type="text" value={form.primaryColor}
                onChange={e => patch({ primaryColor: e.target.value })}
                className={`${input} max-w-36 font-mono ${validColor ? '' : 'border-red-300'}`}
              />
            </div>
            {!validColor && <p className="mt-1 text-xs text-red-500">Use a 6-digit hex color, e.g. #bf5700</p>}
          </div>
        </div>

        <div className="p-5 space-y-4">
          <div>
            <label className={label}>From Email</label>
            <input
              type="email" value={form.fromEmail ?? ''} placeholder="notifications@yourbrand.com"
              onChange={e => patch({ fromEmail: e.target.value || null })} className={input}
            />
            <p className="mt-1 text-xs text-gray-400">Sender for restock and supply-request emails. Must be verified with your email provider.</p>
          </div>
          <div>
            <label className={label}>Support Email</label>
            <input
              type="email" value={form.supportEmail ?? ''} placeholder="support@yourbrand.com"
              onChange={e => patch({ supportEmail: e.target.value || null })} className={input}
            />
          </div>
          <div>
            <label className={label}>App URL</label>
            <input
              type="url" value={form.appUrl ?? ''} placeholder="https://app.yourbrand.com"
              onChange={e => patch({ appUrl: e.target.value || null })} className={input}
            />
            <p className="mt-1 text-xs text-gray-400">Used for "Open in {form.brandName.trim() || 'the app'}" links in notification emails.</p>
          </div>
        </div>

        <div className="p-5 space-y-3">
          <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Features</p>
          <label className="flex items-start gap-3 cursor-pointer">
            <input
              type="checkbox" checked={form.featureEvents}
              onChange={e => patch({ featureEvents: e.target.checked })}
              className="mt-0.5 h-4 w-4 rounded border-gray-300 text-accent focus:ring-accent/30"
            />
            <span>
              <span className="block text-sm font-medium text-gray-900">Events & tastings calendar</span>
              <span className="block text-xs text-gray-400">Scheduling and closing out in-store events. Off hides the Calendar.</span>
            </span>
          </label>
          <label className="flex items-start gap-3 cursor-pointer">
            <input
              type="checkbox" checked={form.featurePipeline}
              onChange={e => patch({ featurePipeline: e.target.checked })}
              className="mt-0.5 h-4 w-4 rounded border-gray-300 text-accent focus:ring-accent/30"
            />
            <span>
              <span className="block text-sm font-medium text-gray-900">Supply pipeline</span>
              <span className="block text-xs text-gray-400">Production → warehouse → field inventory ledger. Off hides the Inventory page.</span>
            </span>
          </label>
        </div>

        <div className="px-5 py-4 flex items-center justify-end gap-3 bg-gray-50/50 rounded-b-xl">
          {dirty && <span className="text-xs text-gray-400">Unsaved changes</span>}
          <Button type="submit" variant="primary" size="sm" disabled={save.isPending || !dirty || !validColor || !form.brandName.trim()}>
            {save.isPending ? 'Saving…' : 'Save Branding'}
          </Button>
        </div>
      </form>
    </div>
  )
}
