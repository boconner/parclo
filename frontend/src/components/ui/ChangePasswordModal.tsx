import { useState } from 'react'
import { useUser } from '@clerk/clerk-react'
import { Modal } from './Modal'
import { Button } from './Button'
import { toast } from './Toast'
import { clsx } from 'clsx'

interface Props {
  open: boolean
  onClose: () => void
}

export function ChangePasswordModal({ open, onClose }: Props) {
  const { user } = useUser()
  const [current, setCurrent]   = useState('')
  const [next, setNext]         = useState('')
  const [confirm, setConfirm]   = useState('')
  const [pending, setPending]   = useState(false)
  const [errors, setErrors]     = useState<{ current?: string; next?: string; confirm?: string }>({})

  function reset() {
    setCurrent(''); setNext(''); setConfirm(''); setErrors({})
  }

  function handleClose() {
    reset(); onClose()
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    const errs: typeof errors = {}
    if (!current)           errs.current = 'Required'
    if (next.length < 8)    errs.next    = 'Must be at least 8 characters'
    if (next !== confirm)   errs.confirm = 'Passwords do not match'
    if (Object.keys(errs).length) { setErrors(errs); return }

    setPending(true)
    try {
      await user?.updatePassword({ currentPassword: current, newPassword: next })
      toast('Password updated successfully', 'success')
      handleClose()
    } catch (err: unknown) {
      const msg = (err as { errors?: { message: string }[] })?.errors?.[0]?.message
        ?? 'Failed to update password'
      setErrors({ current: msg })
    } finally {
      setPending(false)
    }
  }

  return (
    <Modal open={open} onClose={handleClose} title="Change Password" width="sm">
      <form onSubmit={handleSubmit} noValidate>
        <div className="px-6 py-5 space-y-4">
          <Field
            label="Current password"
            value={current}
            onChange={setCurrent}
            error={errors.current}
            autoFocus
          />
          <Field
            label="New password"
            value={next}
            onChange={setNext}
            error={errors.next}
            hint="At least 8 characters"
          />
          <Field
            label="Confirm new password"
            value={confirm}
            onChange={setConfirm}
            error={errors.confirm}
          />
        </div>
        <div className="px-6 py-4 border-t border-gray-100 flex justify-end gap-2 bg-gray-50/50 rounded-b-2xl">
          <Button type="button" variant="ghost" size="sm" onClick={handleClose}>Cancel</Button>
          <Button type="submit" variant="primary" size="sm" disabled={pending}>
            {pending ? 'Saving…' : 'Update Password'}
          </Button>
        </div>
      </form>
    </Modal>
  )
}

function Field({
  label, value, onChange, error, hint, autoFocus,
}: {
  label: string
  value: string
  onChange: (v: string) => void
  error?: string
  hint?: string
  autoFocus?: boolean
}) {
  const [show, setShow] = useState(false)
  return (
    <div>
      <label className="block text-xs font-medium text-gray-700 mb-1.5">{label}</label>
      <div className="relative">
        <input
          type={show ? 'text' : 'password'}
          value={value}
          onChange={e => onChange(e.target.value)}
          autoFocus={autoFocus}
          className={clsx(
            'w-full px-3 py-2 pr-9 text-sm bg-white border rounded-lg outline-none transition-all placeholder:text-gray-400',
            'focus:border-accent focus:ring-2 focus:ring-accent/10',
            error ? 'border-red-300' : 'border-gray-200',
          )}
        />
        <button
          type="button"
          onClick={() => setShow(s => !s)}
          className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 transition-colors"
          tabIndex={-1}
        >
          {show
            ? <svg width="15" height="15" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4"><path d="M1 8s2.5-5 7-5 7 5 7 5-2.5 5-7 5-7-5-7-5z"/><circle cx="8" cy="8" r="2"/><path d="M2 2l12 12" strokeLinecap="round"/></svg>
            : <svg width="15" height="15" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4"><path d="M1 8s2.5-5 7-5 7 5 7 5-2.5 5-7 5-7-5-7-5z"/><circle cx="8" cy="8" r="2"/></svg>
          }
        </button>
      </div>
      {error && <p className="mt-1 text-xs text-red-500">{error}</p>}
      {hint && !error && <p className="mt-1 text-xs text-gray-400">{hint}</p>}
    </div>
  )
}
