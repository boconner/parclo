// Escaping for values interpolated into notification email HTML.
//
// This matters most for the customer portal: RestockRequest fields are typed by
// unauthenticated retail staff, and those values land in emails our own team
// opens. Anything user-supplied must go through `esc` before it reaches markup.

export function esc(value: unknown): string {
  if (value == null) return ''
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

// Escapes a value that is placed inside an href/src attribute. Blocks
// javascript: and data: URLs, which `esc` alone would happily let through.
export function escUrl(value: unknown): string {
  const raw = String(value ?? '').trim()
  if (!/^(https?:|mailto:|tel:)/i.test(raw)) return ''
  return esc(raw)
}
