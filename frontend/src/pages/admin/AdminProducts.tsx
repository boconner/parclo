import { useState, useEffect } from 'react'
import { clsx } from 'clsx'
import { Button } from '@/components/ui/Button'
import { Modal } from '@/components/ui/Modal'
import type { Product } from '@/lib/api'
import { useProducts, useCreateProduct, useUpdateProduct, useDeleteProduct } from '@/hooks/useQueries'

type ProductForm = { name: string; sku: string; sizeLabel: string; unitsPerCase: string }

const emptyForm: ProductForm = { name: '', sku: '', sizeLabel: '', unitsPerCase: '' }

export default function AdminProducts() {
  const [showAdd, setShowAdd]   = useState(false)
  const [editId, setEditId]     = useState<string | null>(null)
  const [deleteId, setDeleteId] = useState<string | null>(null)

  const { data: apiProducts } = useProducts(true)
  const createProduct = useCreateProduct()
  const updateProduct = useUpdateProduct()
  const deleteProduct = useDeleteProduct()

  const products = apiProducts ?? []
  const active   = products.filter(p => p.status === 'active')

  function handleAdd(form: ProductForm) {
    createProduct.mutate({
      name:         form.name.trim(),
      sku:          form.sku.trim() || undefined,
      sizeLabel:    form.sizeLabel.trim() || undefined,
      unitsPerCase: form.unitsPerCase.trim() ? Math.max(1, parseInt(form.unitsPerCase)) : null,
    }, { onSuccess: () => setShowAdd(false) })
  }

  function handleEdit(form: ProductForm) {
    if (!editId) return
    updateProduct.mutate({
      id:           editId,
      name:         form.name.trim(),
      sku:          form.sku.trim() || null,
      sizeLabel:    form.sizeLabel.trim() || null,
      unitsPerCase: form.unitsPerCase.trim() ? Math.max(1, parseInt(form.unitsPerCase)) : null,
    }, { onSuccess: () => setEditId(null) })
  }

  function handleStatus(p: Product) {
    updateProduct.mutate({ id: p.id, status: p.status === 'active' ? 'archived' : 'active' })
  }

  function handleDelete(id: string) {
    deleteProduct.mutate(id, { onSuccess: () => setDeleteId(null) })
  }

  const editing = products.find(p => p.id === editId) ?? null

  return (
    <div className="p-4 lg:p-8">

      {/* HEADER */}
      <div className="flex flex-wrap items-start justify-between gap-3 mb-6">
        <div>
          <h1 className="text-xl font-semibold text-gray-900 tracking-tight">Products</h1>
          <p className="text-sm text-gray-400 mt-0.5">
            {active.length} active product{active.length === 1 ? '' : 's'}
            {products.length > active.length ? ` · ${products.length - active.length} archived` : ''}
          </p>
        </div>
        <Button variant="primary" size="sm" onClick={() => setShowAdd(true)}>
          <svg width="11" height="11" viewBox="0 0 11 11" fill="none">
            <path d="M5.5 1v9M1 5.5h9" stroke="white" strokeWidth="1.6" strokeLinecap="round"/>
          </svg>
          Add Product
        </Button>
      </div>

      {/* PRODUCT TABLE */}
      <div className="bg-white border border-gray-200 rounded-xl overflow-x-auto">
        {products.length === 0 ? (
          <div className="py-16 text-center">
            <p className="text-sm font-medium text-gray-500 mb-1">No products yet</p>
            <p className="text-xs text-gray-400">Add your first product — store shelf levels, orders, and reports all reference it.</p>
          </div>
        ) : (
          <table className="w-full">
            <thead>
              <tr className="border-b border-gray-100 bg-gray-50/50">
                {['Product', 'SKU', 'Size', 'Units / Case', 'Status', 'Actions'].map(h => (
                  <th key={h} className="px-5 py-3 text-left text-[10px] font-semibold text-gray-400 uppercase tracking-wider whitespace-nowrap">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {products.map(p => (
                <tr key={p.id} className={clsx('hover:bg-gray-50/70 transition-colors', p.status === 'archived' && 'opacity-50')}>
                  <td className="px-5 py-3.5">
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-lg bg-accent-light flex items-center justify-center flex-shrink-0">
                        <span className="text-xs font-bold text-accent">{p.name.charAt(0)}</span>
                      </div>
                      <span className="text-sm font-medium text-gray-900">{p.name}</span>
                    </div>
                  </td>
                  <td className="px-5 py-3.5 text-sm text-gray-500 tabular-nums">{p.sku ?? '—'}</td>
                  <td className="px-5 py-3.5 text-sm text-gray-500">{p.sizeLabel ?? '—'}</td>
                  <td className="px-5 py-3.5 text-sm text-gray-500 tabular-nums">{p.unitsPerCase ?? '—'}</td>
                  <td className="px-5 py-3.5">
                    {p.status === 'active'
                      ? <span className="inline-flex items-center gap-1 text-xs font-semibold text-green-600 bg-green-50 px-2 py-0.5 rounded-full">
                          <span className="w-1 h-1 rounded-full bg-green-400" />
                          Active
                        </span>
                      : <span className="text-xs font-medium text-gray-400 bg-gray-100 px-2 py-0.5 rounded-full">Archived</span>
                    }
                  </td>
                  <td className="px-5 py-3.5">
                    <div className="flex items-center justify-end gap-2">
                      <button
                        onClick={() => setEditId(p.id)}
                        className="px-2.5 py-1 text-xs font-medium text-accent hover:bg-accent-light rounded-md transition-colors"
                      >
                        Edit
                      </button>
                      <button
                        onClick={() => handleStatus(p)}
                        className="px-2.5 py-1 text-xs font-medium text-gray-500 hover:text-gray-900 hover:bg-gray-100 rounded-md transition-colors"
                      >
                        {p.status === 'active' ? 'Archive' : 'Restore'}
                      </button>
                      {deleteId === p.id ? (
                        <div className="flex items-center gap-1">
                          <button onClick={() => handleDelete(p.id)} className="px-2.5 py-1 text-xs font-medium text-white bg-red-500 hover:bg-red-600 rounded-md transition-colors">Confirm</button>
                          <button onClick={() => setDeleteId(null)} className="px-2.5 py-1 text-xs font-medium text-gray-500 hover:text-gray-900 hover:bg-gray-100 rounded-md transition-colors">Cancel</button>
                        </div>
                      ) : (
                        <button onClick={() => setDeleteId(p.id)} className="px-2.5 py-1 text-xs font-medium text-red-400 hover:text-red-600 hover:bg-red-50 rounded-md transition-colors">Delete</button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <ProductModal
        open={showAdd}
        title="Add Product"
        subtitle="Store shelf levels, supplier orders, and reports all reference products"
        initial={emptyForm}
        onClose={() => setShowAdd(false)}
        onSave={handleAdd}
        pending={createProduct.isPending}
        saveLabel="Add Product"
      />
      <ProductModal
        open={editId !== null}
        title="Edit Product"
        initial={editing ? {
          name:         editing.name,
          sku:          editing.sku ?? '',
          sizeLabel:    editing.sizeLabel ?? '',
          unitsPerCase: editing.unitsPerCase?.toString() ?? '',
        } : emptyForm}
        onClose={() => setEditId(null)}
        onSave={handleEdit}
        pending={updateProduct.isPending}
        saveLabel="Save"
      />
    </div>
  )
}

// ─── Add / Edit Product Modal ─────────────────────────────────────────────────

function ProductModal({
  open, title, subtitle, initial, onClose, onSave, pending, saveLabel,
}: {
  open: boolean
  title: string
  subtitle?: string
  initial: ProductForm
  onClose: () => void
  onSave: (form: ProductForm) => void
  pending?: boolean
  saveLabel: string
}) {
  const [form, setForm]   = useState<ProductForm>(initial)
  const [error, setError] = useState('')

  useEffect(() => { if (open) { setForm(initial); setError('') } }, [open]) // eslint-disable-line react-hooks/exhaustive-deps

  function patch(updates: Partial<ProductForm>) {
    setForm(f => ({ ...f, ...updates }))
    setError('')
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!form.name.trim()) { setError('Product name is required'); return }
    onSave(form)
  }

  const input = 'w-full px-3 py-2 text-sm bg-white border rounded-lg outline-none transition-all placeholder:text-gray-400 focus:border-accent focus:ring-2 focus:ring-accent/10 border-gray-200'

  return (
    <Modal open={open} onClose={onClose} title={title} subtitle={subtitle} width="sm">
      <form onSubmit={handleSubmit} noValidate>
        <div className="px-6 py-5 space-y-4">
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1.5">
              Product Name<span className="text-red-400 ml-0.5">*</span>
            </label>
            <input
              type="text"
              value={form.name}
              onChange={e => patch({ name: e.target.value })}
              placeholder="e.g. Sangria Vibes"
              className={clsx(input, error && 'border-red-300')}
              autoFocus
            />
            {error && <p className="mt-1 text-xs text-red-500">{error}</p>}
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1.5">SKU</label>
              <input type="text" value={form.sku} onChange={e => patch({ sku: e.target.value })} placeholder="Optional" className={input} />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1.5">Size</label>
              <input type="text" value={form.sizeLabel} onChange={e => patch({ sizeLabel: e.target.value })} placeholder="e.g. 750ml" className={input} />
            </div>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1.5">Units per Case</label>
            <input
              type="number" min={1}
              value={form.unitsPerCase}
              onChange={e => patch({ unitsPerCase: e.target.value })}
              placeholder="e.g. 6"
              className={input}
            />
          </div>
        </div>
        <div className="px-6 py-4 border-t border-gray-100 flex justify-end gap-2 bg-gray-50/50 rounded-b-2xl">
          <Button type="button" variant="ghost" size="sm" onClick={onClose}>Cancel</Button>
          <Button type="submit" variant="primary" size="sm" disabled={pending}>{pending ? 'Saving…' : saveLabel}</Button>
        </div>
      </form>
    </Modal>
  )
}
