// src/components/layout/AppLayout.tsx
import { useState, useEffect, useMemo, useRef, Children, cloneElement, isValidElement } from 'react'
import { createPortal } from 'react-dom'
import { Outlet, NavLink, useLocation } from 'react-router-dom'
import { clsx } from 'clsx'
import { useUser, useClerk } from '@clerk/clerk-react'
import { BrandMark } from '@/lib/brand'
import { version } from '../../../package.json'
import { useStores, useRestockRequests } from '@/hooks/useQueries'
import { CriticalStoresModal } from '@/components/stores/CriticalStoresModal'
import { ReorderStoresModal } from '@/components/stores/ReorderStoresModal'
import { CommandPalette } from '@/components/ui/CommandPalette'
import { ChangePasswordModal } from '@/components/ui/ChangePasswordModal'
import { useDarkMode } from '@/hooks/useDarkMode'

export default function AppLayout() {
  const { user }    = useUser()
  const { signOut } = useClerk()
  const isAdmin = (user?.publicMetadata as { role?: string })?.role === 'admin'

  const [drawerOpen, setDrawerOpen]     = useState(false)
  const [showLowStock, setShowLowStock] = useState(false)
  const [showReorder, setShowReorder]   = useState(false)
  const [showSearch, setShowSearch]     = useState(false)
  const [showChangePw, setShowChangePw] = useState(false)
  const [showUserMenu, setShowUserMenu] = useState(false)
  const [showNotif, setShowNotif]       = useState(false)
  const userMenuRef = useRef<HTMLDivElement>(null)
  const notifRef    = useRef<HTMLDivElement>(null)
  const { dark, toggle: toggleDark } = useDarkMode()

  const [collapsed, setCollapsed]     = useState(() => {
    try { return localStorage.getItem('sidebar-collapsed') === 'true' } catch { return false }
  })
  // Track whether we're on a large screen so mobile drawer always renders expanded
  const [isLg, setIsLg] = useState(() =>
    typeof window !== 'undefined' ? window.matchMedia('(min-width: 1024px)').matches : false
  )
  const location = useLocation()

  useEffect(() => {
    const mq      = window.matchMedia('(min-width: 1024px)')
    const handler = (e: MediaQueryListEvent) => setIsLg(e.matches)
    mq.addEventListener('change', handler)
    setIsLg(mq.matches)
    return () => mq.removeEventListener('change', handler)
  }, [])

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault()
        setShowSearch(s => !s)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  useEffect(() => { setDrawerOpen(false) }, [location.pathname])

  useEffect(() => {
    function onClickOutside(e: MouseEvent) {
      if (userMenuRef.current && !userMenuRef.current.contains(e.target as Node)) {
        setShowUserMenu(false)
      }
    }
    if (showUserMenu) document.addEventListener('mousedown', onClickOutside)
    return () => document.removeEventListener('mousedown', onClickOutside)
  }, [showUserMenu])

  useEffect(() => {
    function onClickOutside(e: MouseEvent) {
      if (notifRef.current && !notifRef.current.contains(e.target as Node)) {
        setShowNotif(false)
      }
    }
    if (showNotif) document.addEventListener('mousedown', onClickOutside)
    return () => document.removeEventListener('mousedown', onClickOutside)
  }, [showNotif])

  function toggleCollapsed() {
    setCollapsed(c => {
      const next = !c
      try { localStorage.setItem('sidebar-collapsed', String(next)) } catch {}
      return next
    })
  }

  // Only collapse visually on desktop — mobile drawer always shows full labels
  const c = isLg && collapsed

  const { data: allStores } = useStores()

  const criticalStores = useMemo(() =>
    (allStores ?? []).filter(s => s.onShelf <= 3)
      .sort((a, b) => a.onShelf - b.onShelf)
  , [allStores])

  const reorderStores = useMemo(() =>
    (allStores ?? []).filter(s => s.onShelf === 4)
      .sort((a, b) => a.onShelf - b.onShelf)
  , [allStores])

  const lowStockCount  = criticalStores.length
  const reorderCount   = reorderStores.length
  const totalAlerts    = lowStockCount + reorderCount
  const upcomingEvents = 0

  // Unhandled store-portal requests, badged in the sidebar so reps notice them
  // without opening the page.
  const { data: openRequests } = useRestockRequests({ status: 'new_request' })
  const newRequests = openRequests?.length ?? 0

  const sidebar = (
    <div className="flex flex-col h-full">
      <div className="flex-1 overflow-y-auto">

        {/* Main */}
        <SidebarGroup collapsed={c}>
          <SidebarLink collapsed={c} to="/"         label="Dashboard"  end  icon={<Icons.Overview />} />
          <SidebarLink collapsed={c} to="/stores"   label="All Stores"      icon={<Icons.Stores />} />
          <SidebarLink collapsed={c} to="/visits"   label="Visit Log"       icon={<Icons.Visits />} />
          <SidebarLink collapsed={c} to="/calendar" label="Calendar"
            badge={upcomingEvents > 0 ? String(upcomingEvents) : undefined}
            badgeVariant="muted"
            icon={<Icons.Calendar />}
          />
          <SidebarLink collapsed={c} to="/contacts" label="Contacts"        icon={<Icons.Contacts />} />
          <SidebarLink collapsed={c} to="/requests" label="Store Requests"
            badge={newRequests > 0 ? String(newRequests) : undefined}
            badgeVariant="red"
            icon={<Icons.Requests />}
          />
          {isAdmin && <SidebarLink collapsed={c} to="/inventory" label="Inventory"       icon={<Icons.Inventory />} />}
          {isAdmin && <SidebarLink collapsed={c} to="/reports"  label="Reports"         icon={<Icons.Reports />} />}
        </SidebarGroup>

      </div>

      {/* Configuration + collapse toggle */}
      <div className="border-t border-gray-100 pt-3 mt-2 safe-bottom">
        {isAdmin && (
          <SidebarGroup collapsed={c}>
            <SidebarAccordion collapsed={c} label="Configuration" icon={<Icons.Config />} activePaths={['/admin']}>
              <SidebarLink collapsed={c} to="/admin/regions" label="Regions"          icon={<Icons.Markets />} />
              <SidebarLink collapsed={c} to="/admin/chains"  label="Chains"           icon={<Icons.Chains />} />
              <SidebarLink collapsed={c} to="/admin/stores"  label="Stores"           icon={<Icons.AdminStores />} />
              <SidebarLink collapsed={c} to="/admin/reps"    label="Reps"             icon={<Icons.Reps />} />
              <SidebarLink collapsed={c} to="/admin/products" label="Products"        icon={<Icons.Products />} />
              <SidebarLink collapsed={c} to="/admin/branding" label="Branding"        icon={<Icons.Branding />} />
            </SidebarAccordion>
          </SidebarGroup>
        )}

        {/* Dark mode toggle */}
        <button
          onClick={toggleDark}
          title={dark ? 'Switch to light mode' : 'Switch to dark mode'}
          className={clsx(
            'flex items-center rounded-lg text-xs font-medium text-gray-400',
            'hover:bg-gray-50 hover:text-gray-600 transition-colors mt-1',
            c ? 'justify-center p-2 w-full' : 'gap-2 px-2 py-1.5 w-full',
          )}
        >
          <span className="w-[18px] h-[18px] flex-shrink-0 flex items-center justify-center">
            {dark ? (
              <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
                <circle cx="8" cy="8" r="3.5"/>
                <path d="M8 1v1.5M8 13.5V15M1 8h1.5M13.5 8H15M3.1 3.1l1.1 1.1M11.8 11.8l1.1 1.1M3.1 12.9l1.1-1.1M11.8 4.2l1.1-1.1"/>
              </svg>
            ) : (
              <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
                <path d="M13.5 10A6 6 0 016 2.5a6 6 0 100 11 6 6 0 007.5-3.5z"/>
              </svg>
            )}
          </span>
          {!c && <span>{dark ? 'Light mode' : 'Dark mode'}</span>}
        </button>

        {/* Collapse toggle — desktop only */}
        <button
          onClick={toggleCollapsed}
          title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          className={clsx(
            'hidden lg:flex items-center rounded-lg text-xs font-medium text-gray-400',
            'hover:bg-gray-50 hover:text-gray-600 transition-colors mt-1',
            c ? 'justify-center p-2 w-full' : 'gap-2 px-2 py-1.5 w-full',
          )}
        >
          <span className="w-[18px] h-[18px] flex-shrink-0 flex items-center justify-center">
            {collapsed
              ? <svg width="14" height="14" viewBox="0 0 14 14" fill="none"><path d="M5 3l4 4-4 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/></svg>
              : <svg width="14" height="14" viewBox="0 0 14 14" fill="none"><path d="M9 11L5 7l4-4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/></svg>
            }
          </span>
          {!c && <span>Collapse</span>}
        </button>

        {!c && (
          <p className="text-[10px] text-gray-300 px-2 pt-2">v{version}</p>
        )}
      </div>
    </div>
  )

  return (
    <div className="h-dvh flex flex-col overflow-hidden bg-gray-50">

      {/* TOP NAV — flex-none keeps it pinned; safe-top absorbs notch/status bar */}
      <nav className="dm-navbar bg-white border-b border-gray-200 flex-none z-50 safe-top">
        <div className="h-14 flex items-center px-4 lg:px-6 gap-4">

        {/* Hamburger — mobile only */}
        <button
          onClick={() => setDrawerOpen(o => !o)}
          className="lg:hidden p-1.5 rounded-md text-gray-500 hover:bg-gray-100 hover:text-gray-900 transition-colors flex-shrink-0"
          aria-label="Toggle menu"
        >
          <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
            <path d="M2 4h14M2 9h14M2 14h14" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"/>
          </svg>
        </button>

        {/* Logo */}
        <div className="flex items-center flex-shrink-0">
          <BrandMark className="h-7 w-auto" />
        </div>

        <div className="flex-1" />

        {/* Search */}
        <button
          onClick={() => setShowSearch(true)}
          className="flex items-center gap-2 px-3 py-1.5 rounded-lg border border-gray-200 bg-gray-50 hover:bg-gray-100 transition-colors text-sm text-gray-400"
        >
          <svg width="13" height="13" viewBox="0 0 14 14" fill="none">
            <circle cx="6" cy="6" r="4.5" stroke="currentColor" strokeWidth="1.4"/>
            <path d="M9.5 9.5L12 12" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/>
          </svg>
          <span className="hidden sm:block text-xs">Search</span>
          <span className="hidden lg:flex items-center gap-0.5">
            <kbd className="text-[10px] font-medium text-gray-400 bg-white border border-gray-200 px-1 py-0.5 rounded">Ctrl</kbd>
            <kbd className="text-[10px] font-medium text-gray-400 bg-white border border-gray-200 px-1 py-0.5 rounded">K</kbd>
          </span>
        </button>

        {/* Notifications bell */}
        <div ref={notifRef} className="relative flex-shrink-0">
          <button
            onClick={() => setShowNotif(s => !s)}
            className="relative flex items-center justify-center w-8 h-8 rounded-lg hover:bg-gray-100 transition-colors text-gray-500"
            aria-label="Notifications"
            title={totalAlerts > 0 ? `${lowStockCount} critical · ${reorderCount} need attention` : 'No active alerts'}
          >
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
              <path d="M8 1.5a4.5 4.5 0 00-4.5 4.5v2.5L2 10h12l-1.5-1.5V6A4.5 4.5 0 008 1.5z" strokeLinejoin="round"/>
              <path d="M6.5 10v.5a1.5 1.5 0 003 0V10" strokeLinecap="round"/>
            </svg>
            {totalAlerts > 0 && (
              <span className="absolute -top-0.5 -right-0.5 min-w-[16px] h-[16px] rounded-full bg-red-500 text-white text-[9px] font-bold flex items-center justify-center px-0.5">
                {totalAlerts}
              </span>
            )}
          </button>

          {showNotif && (
            <div className="absolute right-0 top-full mt-1.5 w-72 bg-white border border-gray-200 rounded-xl shadow-lg py-1.5 z-50">
              <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-widest px-3 pb-1.5 pt-0.5">
                Inventory Alerts
              </p>
              {totalAlerts === 0 ? (
                <p className="px-3 py-3 text-sm text-gray-400">No active alerts</p>
              ) : (
                <>
                  {lowStockCount > 0 && (
                    <button
                      onClick={() => { setShowNotif(false); setShowLowStock(true) }}
                      className="w-full flex items-center gap-3 px-3 py-2.5 hover:bg-gray-50 transition-colors text-left"
                    >
                      <span className="w-8 h-8 rounded-lg bg-red-50 flex items-center justify-center flex-shrink-0">
                        <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="#ef4444" strokeWidth="1.5">
                          <path d="M8 2L1.5 13h13L8 2z" strokeLinejoin="round"/>
                          <path d="M8 6v3.5M8 11.5v.5" strokeLinecap="round"/>
                        </svg>
                      </span>
                      <div>
                        <p className="text-sm font-semibold text-red-600">{lowStockCount} Critical Store{lowStockCount !== 1 ? 's' : ''}</p>
                        <p className="text-xs text-gray-400">3 or fewer bottles on shelf</p>
                      </div>
                      <svg width="12" height="12" viewBox="0 0 12 12" fill="none" className="ml-auto text-gray-300 flex-shrink-0">
                        <path d="M4 2l4 4-4 4" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"/>
                      </svg>
                    </button>
                  )}
                  {reorderCount > 0 && (
                    <button
                      onClick={() => { setShowNotif(false); setShowReorder(true) }}
                      className="w-full flex items-center gap-3 px-3 py-2.5 hover:bg-gray-50 transition-colors text-left"
                    >
                      <span className="w-8 h-8 rounded-lg bg-amber-50 flex items-center justify-center flex-shrink-0">
                        <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="#f59e0b" strokeWidth="1.5">
                          <path d="M8 2v10M4 5l4-4 4 4" strokeLinecap="round" strokeLinejoin="round"/>
                          <path d="M2 13h12" strokeLinecap="round"/>
                        </svg>
                      </span>
                      <div>
                        <p className="text-sm font-semibold text-amber-600">{reorderCount} Need{reorderCount !== 1 ? '' : 's'} Attention</p>
                        <p className="text-xs text-gray-400">4 bottles on shelf</p>
                      </div>
                      <svg width="12" height="12" viewBox="0 0 12 12" fill="none" className="ml-auto text-gray-300 flex-shrink-0">
                        <path d="M4 2l4 4-4 4" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"/>
                      </svg>
                    </button>
                  )}
                </>
              )}
            </div>
          )}
        </div>

        {/* User menu */}
        <div ref={userMenuRef} className="relative flex-shrink-0">
          <button
            onClick={() => setShowUserMenu(s => !s)}
            className="flex items-center gap-2 rounded-lg p-1 hover:bg-gray-100 transition-colors"
          >
            {user?.imageUrl ? (
              <img src={user.imageUrl} alt="" className="w-8 h-8 rounded-full object-cover" />
            ) : (
              <div className="w-8 h-8 rounded-full bg-accent-light text-accent flex items-center justify-center text-xs font-bold">
                {(user?.firstName?.[0] ?? '') + (user?.lastName?.[0] ?? '') || '?'}
              </div>
            )}
            <svg width="12" height="12" viewBox="0 0 12 12" fill="none" className="text-gray-400">
              <path d="M2 4l4 4 4-4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          </button>

          {showUserMenu && (
            <div className="absolute right-0 top-full mt-1.5 w-48 bg-white border border-gray-200 rounded-xl shadow-lg py-1 z-50">
              <div className="px-3 py-2 border-b border-gray-100">
                <p className="text-xs font-semibold text-gray-800 truncate">
                  {user?.firstName} {user?.lastName}
                </p>
                <p className="text-[11px] text-gray-400 truncate">
                  {user?.primaryEmailAddress?.emailAddress}
                </p>
              </div>
              <button
                onClick={() => { setShowUserMenu(false); setShowChangePw(true) }}
                className="w-full flex items-center gap-2.5 px-3 py-2 text-sm text-gray-600 hover:bg-gray-50 transition-colors"
              >
                <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4">
                  <rect x="3" y="7" width="10" height="8" rx="1.5"/>
                  <path d="M5 7V5a3 3 0 016 0v2"/>
                </svg>
                Change password
              </button>
              <button
                onClick={() => { setShowUserMenu(false); signOut() }}
                className="w-full flex items-center gap-2.5 px-3 py-2 text-sm text-gray-600 hover:bg-gray-50 transition-colors"
              >
                <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4">
                  <path d="M6 2H3a1 1 0 00-1 1v10a1 1 0 001 1h3M10 11l3-3-3-3M13 8H6" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
                Sign out
              </button>
            </div>
          )}
        </div>
        </div>{/* close inner nav div */}
      </nav>

      {/* BODY — flex-1 fills remaining height; overflow-hidden keeps children in-bounds */}
      <div className="flex flex-1 overflow-hidden">

        {/* Mobile overlay */}
        {drawerOpen && (
          <div className="fixed inset-0 bg-black/30 z-40 lg:hidden" onClick={() => setDrawerOpen(false)} />
        )}

        {/* Sidebar */}
        <aside className={clsx(
          'dm-sidebar bg-white border-r border-gray-200 py-4 flex-shrink-0',
          // Desktop: in-flow flex child, fills parent height, scrollable
          'lg:static lg:h-full lg:overflow-y-auto lg:translate-x-0 lg:transition-[width] lg:duration-200 lg:ease-in-out',
          collapsed ? 'lg:w-14 lg:px-2' : 'lg:w-52 lg:px-3',
          // Mobile: fixed drawer
          'fixed top-[calc(3.5rem_+_env(safe-area-inset-top))] bottom-0 z-40 w-52 px-3',
          'transition-transform duration-200 lg:transition-[width]',
          drawerOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0',
        )}>
          {sidebar}
        </aside>

        <main className="flex-1 overflow-y-auto min-w-0 safe-bottom">
          <Outlet />
        </main>
      </div>


      <CriticalStoresModal  open={showLowStock}  onClose={() => setShowLowStock(false)}  stores={criticalStores} />
      <ReorderStoresModal   open={showReorder}   onClose={() => setShowReorder(false)}   stores={reorderStores}  />
      <CommandPalette       open={showSearch}    onClose={() => setShowSearch(false)}    />
      <ChangePasswordModal  open={showChangePw}  onClose={() => setShowChangePw(false)}  />
    </div>
  )
}

// ─── icons ────────────────────────────────────────────────────────────────────

const Icons = {
  Overview:    () => <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5"><rect x="1" y="1" width="6" height="6" rx="1"/><rect x="9" y="1" width="6" height="6" rx="1"/><rect x="1" y="9" width="6" height="6" rx="1"/><rect x="9" y="9" width="6" height="6" rx="1"/></svg>,
  Stores:      () => <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M2 7.5L8 2l6 5.5V14a1 1 0 01-1 1H3a1 1 0 01-1-1V7.5z"/><path d="M5.5 15v-5h5v5"/></svg>,
  Visits:      () => <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M6 9l2 2 4-4"/><rect x="1.5" y="1.5" width="13" height="13" rx="2"/></svg>,
  Calendar:    () => <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5"><rect x="1.5" y="2.5" width="13" height="12" rx="1.5"/><path d="M1.5 6h13M5 1.5v2M11 1.5v2"/></svg>,
  Contacts:    () => <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5"><circle cx="6" cy="6" r="2.5"/><path d="M1 14c0-3 2.2-5 5-5h2c2.8 0 5 2 5 5"/><path d="M11 4.5c1.4.3 2.5 1.5 2.5 2.8"/></svg>,
  Requests:    () => <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M2 4.5A2.5 2.5 0 014.5 2h7A2.5 2.5 0 0114 4.5v5A2.5 2.5 0 0111.5 12H6l-4 2.5v-10z"/><path d="M5.5 6h5M5.5 8.5h3" strokeLinecap="round"/></svg>,
  Reports:     () => <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5"><rect x="1.5" y="1.5" width="13" height="13" rx="1.5"/><path d="M4.5 11V8M8 11V5M11.5 11V8.5" strokeLinecap="round"/></svg>,
  Inventory:   () => <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5"><rect x="1.5" y="3" width="13" height="10" rx="1.5"/><path d="M5 6.5h6M5 9.5h4" strokeLinecap="round"/><path d="M5 1.5v3M11 1.5v3" strokeLinecap="round"/></svg>,
  Markets:     () => <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5"><circle cx="8" cy="8" r="6.5"/><path d="M1.5 8h13M8 1.5c-2 2-3 4-3 6.5s1 4.5 3 6.5M8 1.5c2 2 3 4 3 6.5s-1 4.5-3 6.5" strokeLinecap="round"/></svg>,
  Chains:      () => <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M6.5 9.5a3.5 3.5 0 005 0l2-2a3.5 3.5 0 00-5-5L7 4" strokeLinecap="round"/><path d="M9.5 6.5a3.5 3.5 0 00-5 0l-2 2a3.5 3.5 0 005 5L9 12" strokeLinecap="round"/></svg>,
  AdminStores: () => <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5"><circle cx="8" cy="8" r="2.5"/><path d="M8 1v2M8 13v2M1 8h2M13 8h2M3.1 3.1l1.4 1.4M11.5 11.5l1.4 1.4M3.1 12.9l1.4-1.4M11.5 4.5l1.4-1.4"/></svg>,
  Reps:        () => <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5"><circle cx="8" cy="5.5" r="3"/><path d="M1.5 14.5c0-3.6 3-6.5 6.5-6.5s6.5 2.9 6.5 6.5"/></svg>,
  Config:      () => <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5"><circle cx="8" cy="8" r="2.5"/><path d="M8 1.5v1.2M8 13.3v1.2M1.5 8h1.2M13.3 8h1.2M3.4 3.4l.85.85M11.75 11.75l.85.85M3.4 12.6l.85-.85M11.75 4.25l.85-.85" strokeLinecap="round"/></svg>,
  Products:    () => <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M8 1.5l6 3v7l-6 3-6-3v-7l6-3z"/><path d="M2 4.5l6 3 6-3M8 7.5V14.5"/></svg>,
  Branding:    () => <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M8 1.5a6.5 6.5 0 100 13c1.2 0 1.8-.7 1.8-1.5 0-.9-.7-1.3-.7-2 0-.8.6-1.5 1.6-1.5h1.3A2.5 2.5 0 0014.5 7 6 6 0 008 1.5z"/><circle cx="5" cy="6" r="0.9" fill="currentColor" stroke="none"/><circle cx="8.5" cy="4.5" r="0.9" fill="currentColor" stroke="none"/><circle cx="11.5" cy="6.5" r="0.9" fill="currentColor" stroke="none"/></svg>,
}

// ─── sidebar sub-components ───────────────────────────────────────────────────

type BadgeVariant = 'red' | 'amber' | 'muted'

const badgeStyles: Record<BadgeVariant, string> = {
  red:   'bg-red-50 text-red-500',
  amber: 'bg-amber-50 text-amber-700',
  muted: 'bg-gray-100 text-gray-500',
}

function SidebarGroup({
  label, children, collapsed,
}: {
  label?: string; children: React.ReactNode; collapsed: boolean
}) {
  return (
    <div className="mb-4">
      {label
        ? collapsed
          ? <div className="h-px bg-gray-100 mx-1 mb-2 mt-0.5" />
          : <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-widest px-2 mb-1">{label}</p>
        : null
      }
      <div className="space-y-0.5">{children}</div>
    </div>
  )
}

function SidebarAccordion({
  label, icon, children, collapsed, activePaths = [],
}: {
  label: string; icon: React.ReactNode; children: React.ReactNode
  collapsed: boolean; activePaths?: string[]
}) {
  const location = useLocation()
  const isActive = activePaths.some(p => location.pathname.startsWith(p))
  const [open, setOpen] = useState(isActive)
  const [flyoutOpen, setFlyoutOpen] = useState(false)
  const [flyoutTop, setFlyoutTop] = useState(0)
  const btnRef = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    if (isActive) setOpen(true)
  }, [isActive])

  if (collapsed) {
    const expandedChildren = Children.map(children, child =>
      isValidElement(child) ? cloneElement(child as React.ReactElement<{ collapsed: boolean }>, { collapsed: false }) : child
    )
    return (
      <div>
        <button
          ref={btnRef}
          onMouseEnter={() => {
            const rect = btnRef.current?.getBoundingClientRect()
            if (rect) setFlyoutTop(rect.top)
            setFlyoutOpen(true)
          }}
          onMouseLeave={() => setFlyoutOpen(false)}
          title={label}
          className={clsx(
            'w-full flex justify-center p-2 rounded-lg text-sm font-medium transition-colors',
            isActive ? 'bg-accent-light text-accent' : 'text-gray-500 hover:bg-gray-50 hover:text-gray-900',
          )}
        >
          <span className="w-[18px] h-[18px] flex-shrink-0">{icon}</span>
        </button>
        {flyoutOpen && createPortal(
          <div
            className="fixed z-50 left-14 bg-white border border-gray-200 rounded-xl shadow-lg py-1.5 min-w-[180px]"
            style={{ top: flyoutTop }}
            onMouseEnter={() => setFlyoutOpen(true)}
            onMouseLeave={() => setFlyoutOpen(false)}
          >
            <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-widest px-3 pb-1.5">{label}</p>
            <div className="px-1 space-y-0.5">{expandedChildren}</div>
          </div>,
          document.body
        )}
      </div>
    )
  }

  return (
    <div>
      <button
        onClick={() => setOpen(o => !o)}
        className={clsx(
          'w-full flex items-center gap-2.5 px-2 py-1.5 rounded-lg text-sm font-medium transition-colors',
          isActive ? 'text-gray-700' : 'text-gray-500 hover:bg-gray-50 hover:text-gray-900',
        )}
      >
        <span className="w-[18px] h-[18px] flex-shrink-0">{icon}</span>
        <span className="flex-1 text-left">{label}</span>
        <svg
          width="12" height="12" viewBox="0 0 12 12" fill="none"
          className={clsx('transition-transform duration-150', open && 'rotate-180')}
        >
          <path d="M2 4l4 4 4-4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
        </svg>
      </button>
      {open && (
        <div className="mt-0.5 ml-4 pl-2 border-l border-gray-100 space-y-0.5">
          {children}
        </div>
      )}
    </div>
  )
}

function SidebarLink({
  to, label, icon, badge, badgeVariant = 'muted', end = false, collapsed,
}: {
  to: string; label: string; icon: React.ReactNode
  badge?: string; badgeVariant?: BadgeVariant; end?: boolean; collapsed: boolean
}) {
  return (
    <NavLink
      to={to}
      end={end}
      title={collapsed ? label : undefined}
      className={({ isActive }) => clsx(
        'flex items-center rounded-lg text-sm font-medium transition-colors relative',
        collapsed ? 'justify-center p-2' : 'gap-2.5 px-2 py-1.5',
        isActive ? 'bg-accent-light text-accent' : 'text-gray-500 hover:bg-gray-50 hover:text-gray-900',
      )}
    >
      <span className="w-[18px] h-[18px] flex-shrink-0">{icon}</span>
      {!collapsed && (
        <>
          <span className="flex-1 truncate">{label}</span>
          {badge && (
            <span className={clsx('text-[10px] font-bold px-1.5 py-0.5 rounded-full', badgeStyles[badgeVariant])}>
              {badge}
            </span>
          )}
        </>
      )}
      {collapsed && badge && (
        <span className={clsx(
          'absolute -top-0.5 -right-0.5 min-w-[15px] h-[15px] rounded-full',
          'text-[9px] font-bold flex items-center justify-center px-0.5',
          badgeStyles[badgeVariant],
        )}>
          {badge}
        </span>
      )}
    </NavLink>
  )
}

function SidebarButton({
  label, icon, badge, badgeVariant = 'muted', onClick, collapsed,
}: {
  label: string; icon: React.ReactNode
  badge?: string; badgeVariant?: BadgeVariant; onClick: () => void; collapsed: boolean
}) {
  return (
    <button
      onClick={onClick}
      title={collapsed ? label : undefined}
      className={clsx(
        'w-full flex items-center rounded-lg text-sm font-medium transition-colors relative',
        collapsed ? 'justify-center p-2' : 'gap-2.5 px-2 py-1.5',
        'text-gray-500 hover:bg-gray-50 hover:text-gray-900',
      )}
    >
      <span className="w-[18px] h-[18px] flex-shrink-0">{icon}</span>
      {!collapsed && (
        <>
          <span className="flex-1 text-left">{label}</span>
          {badge && (
            <span className={clsx('text-[10px] font-bold px-1.5 py-0.5 rounded-full', badgeStyles[badgeVariant])}>
              {badge}
            </span>
          )}
        </>
      )}
      {collapsed && badge && (
        <span className={clsx(
          'absolute -top-0.5 -right-0.5 min-w-[15px] h-[15px] rounded-full',
          'text-[9px] font-bold flex items-center justify-center px-0.5',
          badgeStyles[badgeVariant],
        )}>
          {badge}
        </span>
      )}
    </button>
  )
}
