import { BrowserRouter, Routes, Route, Navigate, Outlet } from 'react-router-dom'
import { SignedIn, SignedOut, useUser } from '@clerk/clerk-react'
import AppLayout      from '@/components/layout/AppLayout'
import Dashboard      from '@/pages/Dashboard'
import Stores         from '@/pages/Stores'
import StoreDetail    from '@/pages/StoreDetails'
import Visits         from '@/pages/Visits'
import CalendarPage   from '@/pages/Calendar'
import Reports        from '@/pages/Reports'
import Team           from '@/pages/Team'
import Login          from '@/pages/Login'
import Contacts       from '@/pages/Contacts'
import ContactDetail  from '@/pages/ContactDetail'
import AdminStores    from '@/pages/admin/AdminStores'
import AdminReps      from '@/pages/admin/AdminReps'
import AdminChains    from '@/pages/admin/AdminChains'
import AdminRegions   from '@/pages/admin/AdminRegions'
import AdminProducts  from '@/pages/admin/AdminProducts'
import AdminBranding  from '@/pages/admin/AdminBranding'
import Inventory      from '@/pages/Inventory'
import Requests       from '@/pages/Requests'
import StorePortal    from '@/pages/StorePortal'
import ChainPortal    from '@/pages/ChainPortal'

function RequireAuth() {
  return (
    <>
      <SignedIn><AppLayout /></SignedIn>
      <SignedOut><Navigate to="/login" replace /></SignedOut>
    </>
  )
}

function RequireAdmin() {
  const { user, isLoaded } = useUser()
  if (!isLoaded) return null
  const isAdmin = (user?.publicMetadata as { role?: string })?.role === 'admin'
  return isAdmin ? <Outlet /> : <Navigate to="/" replace />
}

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/login" element={<Login />} />

        {/* Customer-facing portals — intentionally outside RequireAuth.
            /r = one store's QR code, /c = a chain HQ's QR code. */}
        <Route path="/r/:token" element={<StorePortal />} />
        <Route path="/c/:token" element={<ChainPortal />} />

        <Route path="/" element={<RequireAuth />}>
          <Route index                  element={<Dashboard />} />
          <Route path="stores"          element={<Stores />} />
          <Route path="stores/:id"      element={<StoreDetail />} />
          <Route path="visits"          element={<Visits />} />
          <Route path="calendar"        element={<CalendarPage />} />
          {/* Orders routes hidden until feature is ready */}
          {/* <Route path="orders"          element={<Orders />} /> */}
          {/* <Route path="orders/supplier" element={<SupplierOrders />} /> */}
          <Route path="team"            element={<Team />} />
          <Route path="contacts"        element={<Contacts />} />
          <Route path="contacts/:id"    element={<ContactDetail />} />
          <Route path="requests"        element={<Requests />} />

          <Route element={<RequireAdmin />}>
            <Route path="reports"       element={<Reports />} />
            <Route path="inventory"     element={<Inventory />} />
            <Route path="admin/regions" element={<AdminRegions />} />
            <Route path="admin/chains"  element={<AdminChains />} />
            <Route path="admin/stores"  element={<AdminStores />} />
            <Route path="admin/reps"    element={<AdminReps />} />
            <Route path="admin/products" element={<AdminProducts />} />
            <Route path="admin/branding" element={<AdminBranding />} />
            <Route path="admin"         element={<Navigate to="/admin/regions" replace />} />
          </Route>
        </Route>

        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  )
}
