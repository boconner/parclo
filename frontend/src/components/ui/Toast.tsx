import { useState, useEffect, useCallback, useRef } from 'react'
import { clsx } from 'clsx'

// ─── types ────────────────────────────────────────────────────────────────────

export type ToastVariant = 'success' | 'error' | 'info'

export interface ToastMessage {
  id:      string
  message: string
  variant: ToastVariant
}

// ─── global event bus (no context needed) ────────────────────────────────────

type Listener = (toast: ToastMessage) => void
const listeners = new Set<Listener>()

export function toast(message: string, variant: ToastVariant = 'success') {
  const t: ToastMessage = { id: `${Date.now()}-${Math.random()}`, message, variant }
  listeners.forEach(l => l(t))
}

// ─── ToastContainer ───────────────────────────────────────────────────────────

export function ToastContainer() {
  const [toasts, setToasts] = useState<ToastMessage[]>([])

  useEffect(() => {
    const add = (t: ToastMessage) => {
      setToasts(prev => [...prev, t])
      setTimeout(() => setToasts(prev => prev.filter(x => x.id !== t.id)), 3500)
    }
    listeners.add(add)
    return () => { listeners.delete(add) }
  }, [])

  if (!toasts.length) return null

  return (
    <div className="fixed bottom-20 lg:bottom-6 right-4 z-[60] flex flex-col gap-2 items-end pointer-events-none">
      {toasts.map(t => <ToastItem key={t.id} toast={t} onDismiss={() => setToasts(prev => prev.filter(x => x.id !== t.id))} />)}
    </div>
  )
}

// ─── ToastItem ────────────────────────────────────────────────────────────────

const VARIANTS: Record<ToastVariant, { icon: React.ReactNode; bg: string; text: string; border: string }> = {
  success: {
    bg: 'bg-white', text: 'text-gray-900', border: 'border-green-100',
    icon: (
      <div className="w-6 h-6 rounded-full bg-green-50 flex items-center justify-center flex-shrink-0">
        <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
          <path d="M2 6.5l2.5 2.5 5.5-5.5" stroke="#10b981" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
        </svg>
      </div>
    ),
  },
  error: {
    bg: 'bg-white', text: 'text-gray-900', border: 'border-red-100',
    icon: (
      <div className="w-6 h-6 rounded-full bg-red-50 flex items-center justify-center flex-shrink-0">
        <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
          <path d="M2 2l8 8M10 2l-8 8" stroke="#ef4444" strokeWidth="1.5" strokeLinecap="round"/>
        </svg>
      </div>
    ),
  },
  info: {
    bg: 'bg-white', text: 'text-gray-900', border: 'border-accent/20',
    icon: (
      <div className="w-6 h-6 rounded-full bg-accent-light flex items-center justify-center flex-shrink-0">
        <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
          <circle cx="6" cy="6" r="5" stroke="#724fac" strokeWidth="1.3"/>
          <path d="M6 5v4M6 3.5v.5" stroke="#724fac" strokeWidth="1.3" strokeLinecap="round"/>
        </svg>
      </div>
    ),
  },
}

function ToastItem({ toast: t, onDismiss }: { toast: ToastMessage; onDismiss: () => void }) {
  const v = VARIANTS[t.variant]
  return (
    <div
      className={clsx(
        'pointer-events-auto flex items-center gap-3 px-4 py-3 rounded-xl border shadow-lg',
        'animate-in slide-in-from-right-4 fade-in-0 duration-200',
        v.bg, v.text, v.border,
      )}
      style={{ minWidth: 240, maxWidth: 340 }}
    >
      {v.icon}
      <p className="text-sm font-medium flex-1">{t.message}</p>
      <button onClick={onDismiss} className="text-gray-300 hover:text-gray-500 transition-colors flex-shrink-0">
        <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
          <path d="M2 2l8 8M10 2l-8 8" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/>
        </svg>
      </button>
    </div>
  )
}
