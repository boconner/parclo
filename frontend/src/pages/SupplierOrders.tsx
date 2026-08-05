import { useState, useMemo } from 'react'
import { clsx } from 'clsx'
import { Button } from '@/components/ui/Button'
import { Modal } from '@/components/ui/Modal'
import type { SupplierOrder } from '@/types'
import { toast } from '@/components/ui/Toast'
import { useSupplierOrders, useCreateSupplierOrder, useUpdateSupplierOrderStatus, useProducts } from '@/hooks/useQueries'

type StatusFilter = 'all' | SupplierOrder['status']

const STATUS_META: Record<SupplierOrder['status'], { label: string; dot: string; text: string; bg: string }> = {
  'pending':    { label: 'Pending',    dot: 'bg-amber-400', text: 'text-amber-700', bg: 'bg-amber-50'  },
  'in-transit': { label: 'In Transit', dot: 'bg-blue-400',  text: 'text-blue-700',  bg: 'bg-blue-50'   },
  'delivered':  { label: 'Received',   dot: 'bg-green-400', text: 'text-green-700', bg: 'bg-green-50'  },
}

export default function SupplierOrders() {
  const { data: products = [] } = useProducts()
  const [statusTab, setStatusTab]       = useState<StatusFilter>('all')
  const [showNewOrder, setShowNewOrder] = useState(false)

  const [noProduct, setNoProduct] = useState('')
  const [noQty,     setNoQty]     = useState('')
  const [noPO,      setNoPO]      = useState('')

  const { data: apiOrders = [] } = useSupplierOrders()
  const createOrder  = useCreateSupplierOrder()
  const updateStatus = useUpdateSupplierOrderStatus()

  const allOrders = useMemo(() =>
    [...apiOrders].sort((a, b) => new Date(b.orderedAt).getTime() - new Date(a.orderedAt).getTime()),
    [apiOrders]
  )

  const filtered = useMemo(
    () => statusTab === 'all' ? allOrders : allOrders.filter(o => o.status === statusTab),
    [allOrders, statusTab]
  )

  const counts = useMemo(() => ({
    all:          allOrders.length,
    pending:      allOrders.filter(o => o.status === 'pending').length,
    inTransit:    allOrders.filter(o => o.status === 'in-transit').length,
    delivered:    allOrders.filter(o => o.status === 'delivered').length,
    pendingQty:   allOrders.filter(o => o.status === 'pending').reduce((s, o) => s + o.quantity, 0),
    inTransitQty: allOrders.filter(o => o.status === 'in-transit').reduce((s, o) => s + o.quantity, 0),
    ytdQty:       allOrders.reduce((s, o) => s + o.quantity, 0),
  }), [allOrders])

  const TABS: { value: StatusFilter; label: string; count: number }[] = [
    { value: 'all',        label: 'All',        count: counts.all       },
    { value: 'pending',    label: 'Pending',    count: counts.pending   },
    { value: 'in-transit', label: 'In Transit', count: counts.inTransit },
    { value: 'delivered',  label: 'Received',   count: counts.delivered },
  ]

  function markStatus(id: string, status: SupplierOrder['status']) {
    updateStatus.mutate(
      { id, status },
      {
        onSuccess: () => toast(status === 'in-transit' ? 'Marked as shipped' : 'Marked as received'),
      }
    )
  }

  function closeNewOrder() {
    setShowNewOrder(false)
    setNoProduct(''); setNoQty(''); setNoPO('')
  }

  function handleNewOrder() {
    if (!noProduct || !noQty || !noPO) return
    const now = new Date()
    const expected = new Date(now)
    expected.setDate(expected.getDate() + 14)
    createOrder.mutate(
      {
        poNumber:   noPO,
        product:    noProduct,
        quantity:   Number(noQty),
        expectedAt: expected.toISOString(),
      },
      {
        onSuccess: () => {
          toast(`Order placed: ${noProduct}`)
          closeNewOrder()
        },
      }
    )
  }

  return (
    <div className="p-4 lg:p-8">

      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-3 mb-6">
        <div>
          <h1 className="text-xl font-semibold text-gray-900 tracking-tight">Supplier Orders</h1>
          <p className="text-sm text-gray-400 mt-0.5">Supplier orders · Updated just now</p>
        </div>
        <Button variant="primary" size="sm" onClick={() => setShowNewOrder(true)}>
          <svg width="11" height="11" viewBox="0 0 11 11" fill="none">
            <path d="M5.5 1v9M1 5.5h9" stroke="white" strokeWidth="1.6" strokeLinecap="round"/>
          </svg>
          New Order
        </Button>
      </div>

      {/* Status tabs */}
      <div className="flex items-center gap-1.5 mb-5 flex-wrap">
        {TABS.map(tab => (
          <button
            key={tab.value}
            onClick={() => setStatusTab(tab.value)}
            className={clsx(
              'inline-flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-lg border transition-all',
              statusTab === tab.value
                ? 'bg-accent text-white border-accent shadow-sm'
                : 'bg-white text-gray-500 border-gray-200 hover:border-gray-300 hover:text-gray-800'
            )}
          >
            {tab.label}
            <span className={clsx(
              'text-[10px] font-semibold px-1.5 py-0.5 rounded-full min-w-[18px] text-center',
              statusTab === tab.value ? 'bg-white/20 text-white' : 'bg-gray-100 text-gray-500'
            )}>
              {tab.count}
            </span>
          </button>
        ))}
      </div>

      {/* Table */}
      <div className="bg-white border border-gray-200 rounded-xl overflow-x-auto">
        {filtered.length === 0 ? (
          <div className="py-16 text-center">
            <p className="text-sm font-semibold text-gray-700">No orders</p>
            <p className="text-xs text-gray-400 mt-1">
              {allOrders.length === 0 ? 'Place your first supplier order to get started.' : 'No orders match the selected filter.'}
            </p>
          </div>
        ) : (
          <table className="w-full">
              <thead>
                <tr className="border-b border-gray-100 bg-gray-50/50">
                  {['PO Number', 'Product', 'Supplier', 'Qty', 'Ordered', 'Expected', 'Status', ''].map(h => (
                    <th key={h} className="text-left text-[10px] font-semibold text-gray-400 uppercase tracking-wider px-5 py-3 whitespace-nowrap">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {filtered.map(o => {
                  const meta = STATUS_META[o.status]
                  const today = new Date(); today.setHours(0,0,0,0)
                  const expDate = new Date(o.expectedAt); expDate.setHours(0,0,0,0)
                  const isOverdue = o.status === 'in-transit' && expDate < today
                  return (
                    <tr key={o.id} className="hover:bg-gray-50/70 transition-colors group">
                      <td className="px-5 py-3.5">
                        <span className="text-xs font-mono font-medium text-gray-700">{o.poNumber}</span>
                      </td>
                      <td className="px-5 py-3.5">
                        <p className="text-sm font-medium text-gray-900">{o.product}</p>
                        {o.notes && (
                          <p className="text-xs text-gray-400 mt-0.5 max-w-[220px] truncate">{o.notes}</p>
                        )}
                      </td>
                      <td className="px-5 py-3.5 text-sm text-gray-600 whitespace-nowrap">{o.supplier || <span className="text-gray-300">—</span>}</td>
                      <td className="px-5 py-3.5">
                        <span className="text-sm font-semibold text-gray-900">{o.quantity}</span>
                        <span className="text-xs text-gray-400 ml-1">btl</span>
                      </td>
                      <td className="px-5 py-3.5 text-xs text-gray-400 whitespace-nowrap">
                        {new Date(o.orderedAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: '2-digit' })}
                      </td>
                      <td className="px-5 py-3.5 whitespace-nowrap">
                        <span className={clsx('text-xs', isOverdue ? 'text-red-500 font-medium' : 'text-gray-400')}>
                          {isOverdue && '⚠ '}
                          {new Date(o.expectedAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: '2-digit' })}
                        </span>
                      </td>
                      <td className="px-5 py-3.5">
                        <span className={clsx(
                          'inline-flex items-center gap-1.5 text-[11px] font-semibold px-2.5 py-1 rounded-full',
                          meta.bg, meta.text
                        )}>
                          <span className={clsx('w-1.5 h-1.5 rounded-full flex-shrink-0', meta.dot)} />
                          {meta.label}
                        </span>
                      </td>
                      <td className="px-5 py-3.5">
                        <div className="flex justify-end">
                          {o.status === 'pending' && (
                            <button
                              onClick={() => markStatus(o.id, 'in-transit')}
                              className="text-xs font-medium text-blue-600 hover:text-blue-800 transition-colors whitespace-nowrap"
                            >
                              Mark Shipped →
                            </button>
                          )}
                          {o.status === 'in-transit' && (
                            <button
                              onClick={() => markStatus(o.id, 'delivered')}
                              className="text-xs font-medium text-green-600 hover:text-green-800 transition-colors whitespace-nowrap"
                            >
                              Mark Received →
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
        )}
      </div>

      {/* New Order Modal */}
      <Modal
        open={showNewOrder}
        onClose={closeNewOrder}
        title="New Supplier Order"
        subtitle="Place a new supplier order"
        width="sm"
      >
        <div className="px-6 py-5 space-y-4">
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1.5">Product / SKU</label>
            <select
              value={noProduct}
              onChange={e => setNoProduct(e.target.value)}
              className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 outline-none focus:border-accent focus:ring-2 focus:ring-accent/10 bg-white"
            >
              <option value="">Select a product…</option>
              {products.map(p => {
                const label = p.sizeLabel ? `${p.name} ${p.sizeLabel}` : p.name
                return <option key={p.id} value={label}>{label}</option>
              })}
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1.5">Quantity (bottles)</label>
            <input
              type="number"
              min={1}
              value={noQty}
              onChange={e => setNoQty(e.target.value)}
              placeholder="e.g. 120"
              className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 outline-none focus:border-accent focus:ring-2 focus:ring-accent/10"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1.5">PO Number</label>
            <input
              type="text"
              value={noPO}
              onChange={e => setNoPO(e.target.value)}
              placeholder="e.g. PO-2026-043"
              className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 outline-none focus:border-accent focus:ring-2 focus:ring-accent/10"
            />
          </div>
          <div className="flex gap-2 pt-2 border-t border-gray-100">
            <Button variant="ghost" size="sm" className="flex-1" onClick={closeNewOrder}>Cancel</Button>
            <Button
              variant="primary"
              size="sm"
              className="flex-1"
              disabled={!noProduct || !noQty || !noPO || createOrder.isPending}
              onClick={handleNewOrder}
            >
              {createOrder.isPending ? 'Placing…' : 'Place Order'}
            </Button>
          </div>
        </div>
      </Modal>

    </div>
  )
}
