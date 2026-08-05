import { useState, useMemo, useEffect } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { clsx } from 'clsx'
import { Button } from '@/components/ui/Button'
import { Modal } from '@/components/ui/Modal'
import type { StoreOrder } from '@/types'
import { toast } from '@/components/ui/Toast'
import { useOrders, useStores, useRegions, useCreateOrder, useUpdateOrderStatus, useDeleteOrder } from '@/hooks/useQueries'

interface OrderRow extends StoreOrder {
  storeId:    string
  storeName:  string
  chainId:    string
  chainName:  string
  region:     string
  regionName: string
  rep:        string
}

type StatusFilter = 'all' | StoreOrder['status']

const STATUS_META: Record<StoreOrder['status'], { label: string; dot: string; text: string; bg: string }> = {
  'pending':    { label: 'Pending',    dot: 'bg-amber-400', text: 'text-amber-700', bg: 'bg-amber-50'  },
  'in-transit': { label: 'In Transit', dot: 'bg-blue-400',  text: 'text-blue-700',  bg: 'bg-blue-50'   },
  'delivered':  { label: 'Delivered',  dot: 'bg-green-400', text: 'text-green-700', bg: 'bg-green-50'  },
}

export default function Orders() {
  const location = useLocation()
  const [activeMarket, setActiveMarket]     = useState('all')
  const [activeChain, setActiveChain]       = useState('all')
  const [statusTab, setStatusTab]           = useState<StatusFilter>('all')
  const [showPlaceOrder, setShowPlaceOrder] = useState(false)
  const [confirmDelete, setConfirmDelete]   = useState<string | null>(null)
  const [overrides, setOverrides]           = useState<Record<string, StoreOrder['status']>>({})
  const [newOrders, setNewOrders]           = useState<OrderRow[]>([])

  const [poStore,   setPoStore]   = useState('')
  const [poQty,     setPoQty]     = useState('')
  const [poInvoice, setPoInvoice] = useState('')

  const { data: apiOrders  } = useOrders()
  const { data: apiStores  } = useStores()
  const { data: apiMarkets } = useRegions()
  const createOrder   = useCreateOrder()
  const updateStatus  = useUpdateOrderStatus()
  const deleteOrder   = useDeleteOrder()

  const allStores = apiStores  ?? []
  const markets   = apiMarkets ?? []

  useEffect(() => {
    if ((location.state as { openModal?: boolean } | null)?.openModal) setShowPlaceOrder(true)
  }, [])

  const marketStores = useMemo(
    () => activeMarket === 'all' ? allStores : allStores.filter(s => s.region === activeMarket),
    [allStores, activeMarket]
  )
  const scopedStores = useMemo(
    () => activeChain === 'all' ? marketStores : marketStores.filter(s => s.chainId === activeChain),
    [activeChain, marketStores]
  )

  const allOrders = useMemo<OrderRow[]>(() => {
    if (apiOrders) {
      return apiOrders
        .filter(o => {
          if (activeMarket !== 'all' && o.region !== activeMarket) return false
          if (activeChain !== 'all') {
            const store = allStores.find(s => s.id === o.storeId)
            if (store?.chainId !== activeChain) return false
          }
          return true
        })
        .map(o => {
          const store = allStores.find(s => s.id === o.storeId)
          return {
            ...o,
            chainId:    store?.chainId    ?? '',
            chainName:  store?.chainName  ?? '',
            regionName: store?.regionName ?? o.region,
            rep:        store?.rep        ?? '',
          }
        })
        .sort((a, b) => new Date(b.placedAt).getTime() - new Date(a.placedAt).getTime())
    }
    return [...newOrders]
      .sort((a, b) => new Date(b.placedAt).getTime() - new Date(a.placedAt).getTime())
  }, [apiOrders, allStores, newOrders, scopedStores, overrides, activeMarket, activeChain])

  const filtered = useMemo(
    () => statusTab === 'all' ? allOrders : allOrders.filter(o => o.status === statusTab),
    [allOrders, statusTab]
  )

  const counts = useMemo(() => ({
    all:          allOrders.length,
    pending:      allOrders.filter(o => o.status === 'pending').length,
    inTransit:    allOrders.filter(o => o.status === 'in-transit').length,
    delivered:    allOrders.filter(o => o.status === 'delivered').length,
    inProcessQty: allOrders.filter(o => o.status !== 'delivered').reduce((s, o) => s + o.quantity, 0),
  }), [allOrders])

  const chainOptions = useMemo(() => {
    const seen = new Map<string, string>()
    marketStores.forEach(s => { if (s.chainId && s.chainName) seen.set(s.chainId, s.chainName) })
    return [...seen.entries()].map(([id, name]) => ({ id, name })).sort((a, b) => a.name.localeCompare(b.name))
  }, [marketStores])

  const TABS: { value: StatusFilter; label: string; count: number }[] = [
    { value: 'all',        label: 'All',        count: counts.all       },
    { value: 'pending',    label: 'Pending',    count: counts.pending   },
    { value: 'in-transit', label: 'In Transit', count: counts.inTransit },
    { value: 'delivered',  label: 'Delivered',  count: counts.delivered },
  ]

  function markStatus(id: string, status: StoreOrder['status']) {
    if (apiOrders) {
      updateStatus.mutate({ id, status })
    } else {
      setOverrides(p => ({ ...p, [id]: status }))
    }
    toast(`Marked as ${STATUS_META[status].label}`)
  }

  function handleDelete(id: string) {
    if (apiOrders) {
      deleteOrder.mutate(id, { onSuccess: () => toast('Order deleted') })
    } else {
      setNewOrders(prev => prev.filter(o => o.id !== id))
      toast('Order deleted')
    }
    setConfirmDelete(null)
  }

  function closePlaceOrder() {
    setShowPlaceOrder(false)
    setPoStore(''); setPoQty(''); setPoInvoice('')
  }

  function handlePlaceOrder() {
    if (!poStore || !poQty || !poInvoice) return
    const store = allStores.find(s => s.id === poStore)!
    if (apiOrders !== undefined) {
      createOrder.mutate(
        { storeId: poStore, quantity: Number(poQty), invoiceRef: poInvoice },
        { onSuccess: () => toast(`Order placed for ${store?.name ?? ''}`) }
      )
    } else {
      const order: OrderRow = {
        id: `new-${Date.now()}`, placedAt: new Date().toISOString(),
        quantity: Number(poQty), status: 'pending', invoiceRef: poInvoice,
        storeId: store.id, storeName: store.name, chainId: store.chainId,
        chainName: store.chainName, region: store.region, regionName: store.regionName, rep: store.rep,
      }
      setNewOrders(prev => [order, ...prev])
      toast(`Order placed for ${store.name}`)
    }
    closePlaceOrder()
  }

  return (
    <div className="p-4 lg:p-8">

      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-3 mb-6">
        <div>
          <h1 className="text-xl font-semibold text-gray-900 tracking-tight">Store Orders</h1>
          <p className="text-sm text-gray-400 mt-0.5">
            {activeMarket === 'all'
              ? 'All Regions · Texas'
              : `${markets.find(m => m.slug === activeMarket)?.name} Region`
            }{' · '}Updated just now
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="primary" size="sm" onClick={() => setShowPlaceOrder(true)}>
            <svg width="11" height="11" viewBox="0 0 11 11" fill="none">
              <path d="M5.5 1v9M1 5.5h9" stroke="white" strokeWidth="1.6" strokeLinecap="round"/>
            </svg>
            Place Order
          </Button>
        </div>
      </div>

      {/* SEARCH + FILTERS */}
      <div className="flex items-center gap-3 mb-5 flex-wrap">
        <select
          value={activeMarket}
          onChange={e => { setActiveMarket(e.target.value); setActiveChain('all') }}
          className="px-3 py-1.5 text-sm bg-white border border-gray-200 rounded-lg outline-none focus:border-accent focus:ring-2 focus:ring-accent/10 text-gray-600 transition-all"
        >
          <option value="all">All Regions</option>
          {markets.map(m => <option key={m.slug} value={m.slug}>{m.name}</option>)}
        </select>
        <select
          value={activeChain}
          onChange={e => setActiveChain(e.target.value)}
          className="px-3 py-1.5 text-sm bg-white border border-gray-200 rounded-lg outline-none focus:border-accent focus:ring-2 focus:ring-accent/10 text-gray-600 transition-all"
        >
          <option value="all">All Chains</option>
          {chainOptions.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
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
              {statusTab !== 'all'
                ? `No ${STATUS_META[statusTab as StoreOrder['status']]?.label.toLowerCase()} orders in this view.`
                : 'No orders for the selected filters.'}
            </p>
          </div>
        ) : (
          <table className="w-full">
              <thead>
                <tr className="border-b border-gray-100 bg-gray-50/50">
                  {['Store', 'Chain', 'Region', 'Qty', 'Invoice', 'Placed', 'Status', ''].map(h => (
                    <th key={h} className="text-left text-[10px] font-semibold text-gray-400 uppercase tracking-wider px-5 py-3 whitespace-nowrap">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {filtered.map(o => {
                  const meta = STATUS_META[o.status]
                  return (
                    <tr key={o.id} className="hover:bg-gray-50/70 transition-colors group">
                      <td className="px-5 py-3.5">
                        <Link to={`/stores/${o.storeId}`} className="text-sm font-medium text-gray-900 hover:text-accent transition-colors block leading-tight">
                          {o.storeName}
                        </Link>
                        <p className="text-xs text-gray-400 mt-0.5">{o.rep}</p>
                      </td>
                      <td className="px-5 py-3.5 text-sm text-gray-600 whitespace-nowrap">{o.chainName}</td>
                      <td className="px-5 py-3.5 text-sm text-gray-600 whitespace-nowrap">{o.regionName}</td>
                      <td className="px-5 py-3.5">
                        <span className="text-sm font-semibold text-gray-900">{o.quantity}</span>
                        <span className="text-xs text-gray-400 ml-1">btl</span>
                      </td>
                      <td className="px-5 py-3.5">
                        <span className="text-xs font-mono text-gray-500">{o.invoiceRef}</span>
                      </td>
                      <td className="px-5 py-3.5 text-xs text-gray-400 whitespace-nowrap">
                        {new Date(o.placedAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: '2-digit' })}
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
                        <div className="flex items-center justify-end gap-3">
                          {o.status === 'pending' && (
                            <button
                              onClick={() => markStatus(o.id, 'in-transit')}
                              className="text-xs font-medium text-blue-600 hover:text-blue-800 transition-colors whitespace-nowrap"
                            >
                              Mark In Transit →
                            </button>
                          )}
                          {o.status === 'in-transit' && (
                            <button
                              onClick={() => markStatus(o.id, 'delivered')}
                              className="text-xs font-medium text-green-600 hover:text-green-800 transition-colors whitespace-nowrap"
                            >
                              Mark Delivered →
                            </button>
                          )}
                          {confirmDelete === o.id ? (
                            <span className="inline-flex items-center gap-2 whitespace-nowrap">
                              <span className="text-xs text-gray-500">Delete?</span>
                              <button onClick={() => handleDelete(o.id)} className="text-xs font-semibold text-red-600 hover:underline">Yes</button>
                              <button onClick={() => setConfirmDelete(null)} className="text-xs text-gray-400 hover:text-gray-600">No</button>
                            </span>
                          ) : (
                            <button
                              onClick={() => setConfirmDelete(o.id)}
                              className="text-gray-300 hover:text-red-500 transition-colors opacity-0 group-hover:opacity-100"
                              title="Delete order"
                            >
                              <svg width="13" height="13" viewBox="0 0 14 14" fill="none">
                                <path d="M2.5 3.5h9M5.5 3.5V2.5a1 1 0 011-1h1a1 1 0 011 1v1M3.5 3.5l.5 8a1 1 0 001 1h4a1 1 0 001-1l.5-8" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round"/>
                              </svg>
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

      {/* Place Order Modal */}
      <Modal
        open={showPlaceOrder}
        onClose={closePlaceOrder}
        title="Place Order"
        subtitle="Create a new store order"
        width="sm"
      >
        <div className="px-6 py-5 space-y-4">
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1.5">Store</label>
            <select
              value={poStore}
              onChange={e => setPoStore(e.target.value)}
              className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 outline-none focus:border-accent focus:ring-2 focus:ring-accent/10 bg-white"
            >
              <option value="">Select a store…</option>
              {scopedStores.map(s => (
                <option key={s.id} value={s.id}>{s.name}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1.5">Quantity (bottles)</label>
            <input
              type="number"
              min={1}
              value={poQty}
              onChange={e => setPoQty(e.target.value)}
              placeholder="e.g. 24"
              className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 outline-none focus:border-accent focus:ring-2 focus:ring-accent/10"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1.5">Invoice / PO Reference</label>
            <input
              type="text"
              value={poInvoice}
              onChange={e => setPoInvoice(e.target.value)}
              placeholder="e.g. INV-2500"
              className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 outline-none focus:border-accent focus:ring-2 focus:ring-accent/10"
            />
          </div>
          <div className="flex gap-2 pt-2 border-t border-gray-100">
            <Button variant="ghost" size="sm" className="flex-1" onClick={closePlaceOrder}>Cancel</Button>
            <Button
              variant="primary"
              size="sm"
              className="flex-1"
              disabled={!poStore || !poQty || !poInvoice}
              onClick={handlePlaceOrder}
            >
              Place Order
            </Button>
          </div>
        </div>
      </Modal>

    </div>
  )
}
