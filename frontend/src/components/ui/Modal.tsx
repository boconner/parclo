import { useEffect, useRef, useState, useCallback, createContext, useContext } from 'react'
import { clsx } from 'clsx'

const ModalCloseContext = createContext<(() => void) | null>(null)

/** Returns the modal's guarded close function (respects confirmDiscard). */
export function useModalClose() {
  const fn = useContext(ModalCloseContext)
  if (!fn) throw new Error('useModalClose must be used inside a Modal')
  return fn
}

interface ModalProps {
  open: boolean
  onClose: () => void
  title: string
  subtitle?: string
  children: React.ReactNode
  width?: 'sm' | 'md' | 'lg'
  /** When true, attempting to close shows an inline "Discard changes?" prompt */
  confirmDiscard?: boolean
}

const widthClass = { sm: 'max-w-md', md: 'max-w-xl', lg: 'max-w-2xl' }

export function Modal({ open, onClose, title, subtitle, children, width = 'md', confirmDiscard = false }: ModalProps) {
  const panelRef = useRef<HTMLDivElement>(null)
  const [showConfirm, setShowConfirm] = useState(false)
  const [shake, setShake]             = useState(false)

  // Reset confirm state whenever the modal opens/closes
  useEffect(() => { if (!open) setShowConfirm(false) }, [open])

  const requestClose = useCallback(() => {
    if (confirmDiscard) {
      setShowConfirm(true)
      // Brief shake to draw attention
      setShake(true)
      setTimeout(() => setShake(false), 400)
    } else {
      onClose()
    }
  }, [confirmDiscard, onClose])

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault()
        if (showConfirm) { setShowConfirm(false) } else { requestClose() }
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, showConfirm, requestClose])

  // Lock body scroll while open
  useEffect(() => {
    document.body.style.overflow = open ? 'hidden' : ''
    return () => { document.body.style.overflow = '' }
  }, [open])

  if (!open) return null

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center sm:p-4">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-gray-900/40 backdrop-blur-[2px]"
        onClick={requestClose}
      />

      {/* Panel */}
      <div
        ref={panelRef}
        className={clsx(
          'relative bg-white w-full flex flex-col',
          'rounded-t-2xl sm:rounded-2xl shadow-xl',
          'animate-in fade-in-0 slide-in-from-bottom-4 sm:zoom-in-95 duration-150',
          'sm:' + widthClass[width],
          shake && 'animate-shake',
        )}
        style={{ maxHeight: '92dvh' }}
      >
        {/* Header */}
        <div className="flex items-start justify-between px-6 pt-5 pb-4 border-b border-gray-100 flex-shrink-0">
          <div>
            <h2 className="text-base font-semibold text-gray-900">{title}</h2>
            {subtitle && <p className="text-xs text-gray-400 mt-0.5">{subtitle}</p>}
          </div>
          <button
            onClick={requestClose}
            className="ml-4 text-gray-400 hover:text-gray-600 transition-colors rounded-lg p-1 hover:bg-gray-100 flex-shrink-0"
          >
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
              <path d="M3 3l10 10M13 3L3 13" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"/>
            </svg>
          </button>
        </div>

        {/* Discard confirmation banner */}
        {showConfirm && (
          <div className="flex items-center justify-between gap-3 px-6 py-3 bg-red-50 border-b border-red-100 flex-shrink-0">
            <div className="flex items-center gap-2">
              <svg width="14" height="14" viewBox="0 0 16 16" fill="none" className="text-red-500 flex-shrink-0">
                <path d="M8 2L1.5 13.5h13L8 2z" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round"/>
                <path d="M8 6v4M8 11.5v.5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/>
              </svg>
              <span className="text-xs font-medium text-red-800">You have unsaved changes. Discard them?</span>
            </div>
            <div className="flex items-center gap-2 flex-shrink-0">
              <button
                onClick={() => setShowConfirm(false)}
                className="text-xs font-medium text-red-700 hover:text-red-900 px-2.5 py-1 rounded-md hover:bg-red-100 transition-colors"
              >
                Keep editing
              </button>
              <button
                onClick={onClose}
                className="text-xs font-medium text-white bg-red-500 hover:bg-red-600 px-2.5 py-1 rounded-md transition-colors"
              >
                Discard
              </button>
            </div>
          </div>
        )}

        {/* Scrollable body */}
        <ModalCloseContext.Provider value={requestClose}>
          <div className="overflow-y-auto flex-1">
            {children}
          </div>
        </ModalCloseContext.Provider>
      </div>
    </div>
  )
}
