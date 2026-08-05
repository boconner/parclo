import { useEffect, useState } from 'react'

// Tells the user when a new build is available and lets them load it.
//
// The app precaches its shell via a service worker built with skipWaiting +
// clientsClaim, so a new version installs and takes control immediately — but
// the page already open keeps executing the OLD bundle until it reloads.
// Nothing surfaced that, so an installed PWA (which rarely gets fully closed)
// could sit on a stale build for days while every deploy reported success.
//
// Deliberately a prompt rather than an automatic reload: reps use this in the
// field, and silently reloading mid-visit-log would throw away typed input.

/** How often to ask the browser to re-check for a new service worker. */
const UPDATE_CHECK_MS = 5 * 60 * 1000

export function UpdateBanner() {
  const [updateReady, setUpdateReady] = useState(false)

  useEffect(() => {
    if (!('serviceWorker' in navigator)) return

    // A page loaded with no controller is a first-ever install, not an update —
    // its controllerchange would otherwise show the banner on a fresh visit.
    const hadControllerAtLoad = Boolean(navigator.serviceWorker.controller)

    function onControllerChange() {
      if (hadControllerAtLoad) setUpdateReady(true)
    }
    navigator.serviceWorker.addEventListener('controllerchange', onControllerChange)

    // A long-lived tab or installed PWA may never navigate, so poll for a new
    // worker instead of relying on the browser's own update checks.
    let timer: number | undefined
    navigator.serviceWorker.getRegistration().then(reg => {
      if (!reg) return

      // An update may already be waiting from before this component mounted.
      if (reg.waiting) setUpdateReady(true)

      timer = window.setInterval(() => {
        reg.update().catch(() => {
          // Offline or the check failed — harmless, we retry on the next tick.
        })
      }, UPDATE_CHECK_MS)
    })

    return () => {
      navigator.serviceWorker.removeEventListener('controllerchange', onControllerChange)
      if (timer) window.clearInterval(timer)
    }
  }, [])

  if (!updateReady) return null

  return (
    <div
      role="status"
      className="fixed bottom-4 left-1/2 -translate-x-1/2 z-[100] flex items-center gap-3
                 rounded-xl border border-accent/20 bg-white px-4 py-3 shadow-lg
                 max-w-[calc(100vw-2rem)]"
    >
      <span className="text-sm text-gray-700">A new version of Contento is available.</span>
      <button
        onClick={() => window.location.reload()}
        className="shrink-0 rounded-lg bg-accent px-3 py-1.5 text-xs font-semibold text-white
                   hover:bg-accent-hover transition-colors"
      >
        Reload
      </button>
      <button
        onClick={() => setUpdateReady(false)}
        aria-label="Dismiss"
        className="shrink-0 text-gray-300 hover:text-gray-500 transition-colors"
      >
        <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.6">
          <path d="M3.5 3.5l7 7M10.5 3.5l-7 7" strokeLinecap="round" />
        </svg>
      </button>
    </div>
  )
}
