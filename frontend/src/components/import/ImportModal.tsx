import { useState, useRef, DragEvent } from 'react'
import { clsx } from 'clsx'
import { Modal } from '@/components/ui/Modal'
import { Button } from '@/components/ui/Button'
import { api } from '@/lib/api'

// ─── types ────────────────────────────────────────────────────────────────────

export type EntityType = 'chains' | 'stores' | 'contacts'

interface FieldDef {
  key:      string
  label:    string
  required: boolean
  hint?:    string
}

interface ImportResult {
  created: number
  skipped: number
  errors:  string[]
}

interface PreviewRow {
  rowNum:  number
  values:  Record<string, string>
  missing: string[]
}

// ─── field definitions ────────────────────────────────────────────────────────

const ENTITY_FIELDS: Record<EntityType, FieldDef[]> = {
  chains: [
    { key: 'name', label: 'Name', required: true },
  ],
  stores: [
    { key: 'name',      label: 'Store Name',          required: true  },

    { key: 'market',    label: 'Market',               required: true,  hint: 'Name or slug of an existing market' },
    { key: 'chain',     label: 'Chain',                required: false, hint: 'Chain name — must already exist'    },
    { key: 'address',   label: 'Address (full)',        required: false, hint: 'Full address in one column, e.g. 123 Main St, Houston, TX 77001' },
    { key: 'street',    label: 'Street',               required: false, hint: 'If address is split across columns' },
    { key: 'city',      label: 'City',                 required: false },
    { key: 'state',     label: 'State',                required: false },
    { key: 'zip',       label: 'Zip / Postal Code',    required: false },
    { key: 'onShelf',   label: 'On Shelf',             required: false },
    { key: 'inProcess', label: 'In Process',           required: false },
  ],
  contacts: [
    { key: 'name',   label: 'Name',   required: true  },
    { key: 'role',   label: 'Role',   required: false },
    { key: 'phone',  label: 'Phone',  required: false },
    { key: 'email',  label: 'Email',  required: false },
    { key: 'chain',  label: 'Chain',  required: false, hint: 'Chain name — must already exist'                },
    { key: 'stores', label: 'Stores', required: false, hint: 'Comma-separated store names (must already exist)' },
    { key: 'notes',  label: 'Notes',  required: false },
  ],
}

const ENTITY_LABEL: Record<EntityType, string> = {
  chains:   'Chains',
  stores:   'Stores',
  contacts: 'Contacts',
}

// ─── column auto-detection ────────────────────────────────────────────────────

const FIELD_ALIASES: Record<string, string[]> = {
  name:      ['name', 'store name', 'store', 'contact name', 'chain name', 'full name', 'company'],
  area:      ['area', 'neighborhood', 'location', 'district', 'sub-area', 'sub area', 'subarea'],
  market:    ['market', 'region', 'territory', 'market/region', 'market region'],
  chain:     ['chain', 'chain name', 'retailer', 'banner', 'group'],
  address:   ['address', 'full address', 'store address', 'full street address'],
  street:    ['street', 'street address', 'address 1', 'address1', 'addr1', 'addr 1'],
  city:      ['city', 'town', 'municipality'],
  state:     ['state', 'province', 'st', 'state/province'],
  zip:       ['zip', 'zip code', 'zipcode', 'postal code', 'postal', 'postcode'],
  onShelf:   ['on shelf', 'on-shelf', 'shelf', 'onshelf', 'shelf count', 'current stock', 'inventory', 'qty on shelf', 'qty'],
  inProcess: ['in process', 'in-process', 'inprocess', 'pending', 'on order', 'in transit'],
  role:      ['role', 'title', 'position', 'job title', 'job'],
  phone:     ['phone', 'phone number', 'tel', 'telephone', 'mobile', 'cell', 'cell phone'],
  email:     ['email', 'email address', 'e-mail', 'mail'],
  stores:    ['stores', 'associated stores', 'store names', 'store list', 'locations'],
  notes:     ['notes', 'comments', 'description', 'memo', 'comment'],
}

function autoDetect(headers: string[], fields: FieldDef[]): Record<string, number> {
  const mapping: Record<string, number> = {}
  for (const field of fields) {
    const aliases = FIELD_ALIASES[field.key] ?? [field.key.toLowerCase()]
    for (let i = 0; i < headers.length; i++) {
      if (aliases.includes(headers[i].toLowerCase().trim())) {
        mapping[field.key] = i
        break
      }
    }
  }
  return mapping
}

// ─── helpers ──────────────────────────────────────────────────────────────────

function buildPreview(
  rawRows: string[][],
  mapping: Record<string, number>,
  fields:  FieldDef[],
): PreviewRow[] {
  return rawRows.slice(0, 25).map((row, i) => {
    const values:  Record<string, string> = {}
    const missing: string[] = []
    for (const f of fields) {
      const idx   = mapping[f.key]
      values[f.key] = (idx !== undefined && idx >= 0) ? (row[idx] ?? '').trim() : ''
      if (f.required && !values[f.key]) missing.push(f.label)
    }
    return { rowNum: i + 2, values, missing }
  })
}

// ─── component ────────────────────────────────────────────────────────────────

export function ImportModal({
  open,
  onClose,
  initialType = 'stores',
  onSuccess,
}: {
  open:         boolean
  onClose:      () => void
  initialType?: EntityType
  onSuccess?:   (type: EntityType, created: number) => void
}) {
  const [step, setStep]             = useState<1 | 2 | 3>(1)
  const [entityType, setEntityType] = useState<EntityType>(initialType)
  const [isDragging, setIsDragging] = useState(false)
  const [fileName, setFileName]     = useState('')
  const [rawHeaders, setRawHeaders] = useState<string[]>([])
  const [rawRows, setRawRows]       = useState<string[][]>([])
  const [mapping, setMapping]       = useState<Record<string, number>>({})
  const [submitting, setSubmitting] = useState(false)
  const [result, setResult]         = useState<ImportResult | null>(null)
  const [parseError, setParseError] = useState('')
  const fileInputRef = useRef<HTMLInputElement>(null)

  const fields = ENTITY_FIELDS[entityType]

  function reset() {
    setStep(1)
    setEntityType(initialType)
    setFileName('')
    setRawHeaders([])
    setRawRows([])
    setMapping({})
    setResult(null)
    setParseError('')
  }

  function handleClose() {
    if (result?.created) onSuccess?.(entityType, result.created)
    reset()
    onClose()
  }

  async function handleFile(file: File) {
    setParseError('')
    try {
      const XLSX = await import('xlsx')
      const buffer = await file.arrayBuffer()
      const wb = XLSX.read(buffer, { type: 'array' })
      const ws = wb.Sheets[wb.SheetNames[0]]
      const json = XLSX.utils.sheet_to_json<unknown[]>(ws, { header: 1, defval: '' })
      if (!json.length) { setParseError('File appears to be empty'); return }
      const headers = (json[0] as unknown[]).map(h => String(h ?? '').trim())
      const rows = json
        .slice(1)
        .map(r => (r as unknown[]).map(v => String(v ?? '').trim()))
        .filter(r => r.some(v => v))
      if (!rows.length) { setParseError('No data rows found (file only has a header row)'); return }
      setFileName(file.name)
      setRawHeaders(headers)
      setRawRows(rows)
      setMapping(autoDetect(headers, ENTITY_FIELDS[entityType]))
      setStep(2)
    } catch (e: any) {
      setParseError(e?.message ?? 'Failed to parse file — make sure it\'s a CSV or Excel file')
    }
  }

  function onDrop(e: DragEvent<HTMLDivElement>) {
    e.preventDefault()
    setIsDragging(false)
    const file = e.dataTransfer.files[0]
    if (file) handleFile(file)
  }

  async function handleSubmit() {
    setSubmitting(true)
    setResult(null)
    try {
      const payload = rawRows.map(row => {
        const obj: Record<string, string> = {}
        for (const f of fields) {
          const idx = mapping[f.key]
          if (idx !== undefined && idx >= 0) obj[f.key] = (row[idx] ?? '').trim()
        }
        return obj
      })
      const data = await api.importRecords(entityType, payload)
      setResult(data)
    } catch (e: any) {
      setResult({ created: 0, skipped: 0, errors: [e?.message ?? 'Request failed'] })
    } finally {
      setSubmitting(false)
    }
  }

  const previewRows     = step === 3 ? buildPreview(rawRows, mapping, fields) : []
  const mappedFields    = fields.filter(f => (mapping[f.key] ?? -1) >= 0)
  const requiredMapped  = fields.filter(f => f.required).every(f => (mapping[f.key] ?? -1) >= 0)
  const previewHasIssue = previewRows.some(r => r.missing.length > 0)

  const STEP_LABELS = ['File', 'Map columns', 'Preview & import']

  return (
    <Modal
      open={open}
      onClose={handleClose}
      title={`Import ${ENTITY_LABEL[entityType]}`}
      width="lg"
    >
      <div className="px-6 py-5 space-y-5">

        {/* Step indicator */}
        <div className="flex items-center gap-1.5">
          {STEP_LABELS.map((label, i) => (
            <div key={label} className="flex items-center gap-1.5">
              <div className={clsx(
                'flex items-center gap-1.5 text-xs font-medium px-2.5 py-1 rounded-full transition-colors',
                step === i + 1 ? 'bg-accent text-white'
                  : step > i + 1 ? 'bg-green-100 text-green-700'
                  : 'bg-gray-100 text-gray-400'
              )}>
                {step > i + 1
                  ? <svg width="10" height="10" viewBox="0 0 10 10" fill="none"><path d="M1.5 5l2.5 2.5 4.5-4.5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"/></svg>
                  : <span>{i + 1}</span>
                }
                {label}
              </div>
              {i < 2 && <div className="w-5 h-px bg-gray-200 flex-shrink-0" />}
            </div>
          ))}
        </div>

        {/* ── STEP 1: Entity type + file upload ── */}
        {step === 1 && (
          <div className="space-y-4">

            {/* Entity type selector */}
            <div>
              <p className="text-xs font-medium text-gray-600 mb-2">What are you importing?</p>
              <div className="flex gap-2">
                {(['chains', 'stores', 'contacts'] as EntityType[]).map(type => (
                  <button
                    key={type}
                    onClick={() => setEntityType(type)}
                    className={clsx(
                      'flex-1 py-2.5 rounded-lg text-sm font-medium border transition-all',
                      entityType === type
                        ? 'bg-accent text-white border-accent shadow-sm'
                        : 'bg-white text-gray-600 border-gray-200 hover:border-accent/40 hover:bg-gray-50/50'
                    )}
                  >
                    {ENTITY_LABEL[type]}
                  </button>
                ))}
              </div>
            </div>

            {/* Drop zone */}
            <div
              onDragOver={e => { e.preventDefault(); setIsDragging(true) }}
              onDragLeave={() => setIsDragging(false)}
              onDrop={onDrop}
              onClick={() => fileInputRef.current?.click()}
              className={clsx(
                'border-2 border-dashed rounded-xl p-10 text-center cursor-pointer transition-all select-none',
                isDragging
                  ? 'border-accent bg-accent-light'
                  : 'border-gray-200 hover:border-accent/50 hover:bg-gray-50/40'
              )}
            >
              <div className="w-10 h-10 bg-gray-100 rounded-xl flex items-center justify-center mx-auto mb-3">
                <svg width="18" height="18" viewBox="0 0 20 20" fill="none" stroke="#9ca3af" strokeWidth="1.5">
                  <path d="M4 14v2a1 1 0 001 1h10a1 1 0 001-1v-2M10 3v10M6.5 6.5L10 3l3.5 3.5" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
              </div>
              <p className="text-sm font-medium text-gray-700">Drop a file here, or click to browse</p>
              <p className="text-xs text-gray-400 mt-1">CSV, XLSX, or XLS · first row must be column headers</p>
              <input
                ref={fileInputRef}
                type="file"
                accept=".csv,.xlsx,.xls"
                className="hidden"
                onChange={e => { const f = e.target.files?.[0]; if (f) handleFile(f) }}
              />
            </div>

            {parseError && (
              <p className="text-xs text-red-500 bg-red-50 border border-red-100 rounded-lg px-3 py-2">{parseError}</p>
            )}

            {/* Field reference */}
            <div className="bg-gray-50 rounded-xl p-4">
              <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider mb-2">
                Fields for {ENTITY_LABEL[entityType]}
              </p>
              <div className="flex flex-wrap gap-1.5">
                {fields.map(f => (
                  <span key={f.key} className={clsx(
                    'text-[11px] px-2 py-0.5 rounded-full font-medium',
                    f.required ? 'bg-accent-light text-accent' : 'bg-white border border-gray-200 text-gray-500'
                  )}>
                    {f.label}{f.required && ' *'}
                  </span>
                ))}
              </div>
              <p className="text-[10px] text-gray-400 mt-2.5">
                * required · your column headers don't need to match exactly — you'll map them in the next step
              </p>
              {entityType === 'stores' && (
                <p className="text-[10px] text-amber-600 mt-1">
                  Tip: import Chains first, then Stores — chain names must already exist
                </p>
              )}
            </div>
          </div>
        )}

        {/* ── STEP 2: Column mapping ── */}
        {step === 2 && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <p className="text-xs text-gray-500">
                <span className="font-medium text-gray-700">{fileName}</span>
                {' · '}{rawRows.length} data rows · {rawHeaders.length} columns
              </p>
              <button onClick={() => setStep(1)} className="text-xs text-accent hover:underline">← Change file</button>
            </div>

            <div className="rounded-xl border border-gray-200 overflow-hidden">
              <table className="w-full">
                <thead>
                  <tr className="bg-gray-50 border-b border-gray-200">
                    <th className="px-4 py-2.5 text-left text-[10px] font-semibold text-gray-400 uppercase tracking-wider w-[160px]">Field</th>
                    <th className="px-4 py-2.5 text-left text-[10px] font-semibold text-gray-400 uppercase tracking-wider w-[200px]">Your column</th>
                    <th className="px-4 py-2.5 text-left text-[10px] font-semibold text-gray-400 uppercase tracking-wider">Sample data</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {fields.map(field => {
                    const idx     = mapping[field.key] ?? -1
                    const samples = idx >= 0
                      ? rawRows.slice(0, 3).map(r => r[idx]).filter(Boolean)
                      : []
                    return (
                      <tr key={field.key} className={clsx(field.required && idx < 0 && 'bg-red-50/30')}>
                        <td className="px-4 py-2.5">
                          <div className="flex items-center gap-1">
                            <span className="text-sm font-medium text-gray-700">{field.label}</span>
                            {field.required && <span className="text-red-400 text-xs leading-none">*</span>}
                          </div>
                          {field.hint && <p className="text-[10px] text-gray-400 mt-0.5 leading-tight">{field.hint}</p>}
                        </td>
                        <td className="px-4 py-2.5">
                          <select
                            value={idx}
                            onChange={e => setMapping(prev => ({ ...prev, [field.key]: parseInt(e.target.value) }))}
                            className="w-full text-xs rounded-lg border border-gray-200 px-2 py-1.5 outline-none focus:border-accent focus:ring-1 focus:ring-accent/20 bg-white text-gray-700"
                          >
                            <option value={-1}>— not mapped —</option>
                            {rawHeaders.map((h, i) => (
                              <option key={i} value={i}>{h || `Column ${i + 1}`}</option>
                            ))}
                          </select>
                        </td>
                        <td className="px-4 py-2.5">
                          {samples.length > 0 ? (
                            <div className="flex flex-wrap gap-1">
                              {samples.map((s, i) => (
                                <span key={i} className="text-[10px] bg-gray-100 text-gray-500 px-1.5 py-0.5 rounded max-w-[140px] truncate">{s}</span>
                              ))}
                            </div>
                          ) : (
                            <span className="text-[10px] text-gray-300 italic">no column selected</span>
                          )}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>

            <div className="flex items-center justify-between pt-1">
              <p className={clsx('text-xs', requiredMapped ? 'text-gray-400' : 'text-red-500')}>
                {requiredMapped ? 'All required fields mapped ✓' : 'Map all required (*) fields to continue'}
              </p>
              <div className="flex gap-2">
                <Button variant="ghost" size="sm" onClick={() => setStep(1)}>Back</Button>
                <Button variant="primary" size="sm" onClick={() => setStep(3)} disabled={!requiredMapped}>
                  Preview →
                </Button>
              </div>
            </div>
          </div>
        )}

        {/* ── STEP 3: Preview + submit ── */}
        {step === 3 && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <p className="text-xs text-gray-500">
                Previewing first <span className="font-medium text-gray-700">{Math.min(25, rawRows.length)}</span> of{' '}
                <span className="font-medium text-gray-700">{rawRows.length}</span> rows
                {previewHasIssue && <span className="ml-2 text-red-500">· some rows missing required fields</span>}
              </p>
              {!result && (
                <button onClick={() => setStep(2)} className="text-xs text-accent hover:underline">← Edit mapping</button>
              )}
            </div>

            {/* Preview table */}
            <div className="rounded-xl border border-gray-200 overflow-hidden">
              <div className="overflow-x-auto max-h-60 overflow-y-auto">
                <table className="w-full text-xs min-w-max">
                  <thead className="sticky top-0 bg-gray-50 border-b border-gray-200">
                    <tr>
                      <th className="px-3 py-2 text-left text-[10px] font-semibold text-gray-400 uppercase tracking-wider">#</th>
                      {mappedFields.map(f => (
                        <th key={f.key} className="px-3 py-2 text-left text-[10px] font-semibold text-gray-400 uppercase tracking-wider whitespace-nowrap">
                          {f.label}{f.required && <span className="text-red-400 ml-0.5">*</span>}
                        </th>
                      ))}
                      <th className="px-3 py-2 text-left text-[10px] font-semibold text-gray-400 uppercase tracking-wider">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-50">
                    {previewRows.map(row => (
                      <tr key={row.rowNum} className={clsx(row.missing.length > 0 && 'bg-red-50/50')}>
                        <td className="px-3 py-2 text-gray-400 font-mono">{row.rowNum}</td>
                        {mappedFields.map(f => (
                          <td key={f.key} className={clsx(
                            'px-3 py-2 max-w-[180px] truncate',
                            f.required && !row.values[f.key] ? 'text-red-500 font-medium' : 'text-gray-700'
                          )}>
                            {row.values[f.key] || <span className="text-gray-300 italic">empty</span>}
                          </td>
                        ))}
                        <td className="px-3 py-2 whitespace-nowrap">
                          {row.missing.length > 0
                            ? <span className="text-[10px] text-red-500">Missing: {row.missing.join(', ')}</span>
                            : <span className="text-[10px] text-green-600 font-medium">✓ ready</span>
                          }
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {rawRows.length > 25 && (
                <div className="px-4 py-2 bg-gray-50 border-t border-gray-100 text-[10px] text-gray-400">
                  …and {rawRows.length - 25} more rows not shown
                </div>
              )}
            </div>

            {/* Result panel */}
            {result && (
              <div className={clsx(
                'rounded-xl border p-4',
                result.errors.length > 0 ? 'border-amber-200 bg-amber-50' : 'border-green-200 bg-green-50'
              )}>
                <div className="flex items-center gap-5 mb-2">
                  <div className="text-center">
                    <p className="text-xl font-bold text-green-700">{result.created}</p>
                    <p className="text-[10px] text-green-600 uppercase tracking-wide">created</p>
                  </div>
                  <div className="text-center">
                    <p className="text-xl font-bold text-gray-500">{result.skipped}</p>
                    <p className="text-[10px] text-gray-400 uppercase tracking-wide">skipped</p>
                  </div>
                  {result.errors.length > 0 && (
                    <div className="text-center">
                      <p className="text-xl font-bold text-amber-600">{result.errors.length}</p>
                      <p className="text-[10px] text-amber-500 uppercase tracking-wide">warnings</p>
                    </div>
                  )}
                </div>
                {result.errors.length > 0 && (
                  <ul className="space-y-0.5 max-h-32 overflow-y-auto mt-3 pt-3 border-t border-amber-200">
                    {result.errors.map((e, i) => (
                      <li key={i} className="text-[11px] text-amber-800">· {e}</li>
                    ))}
                  </ul>
                )}
              </div>
            )}

            <div className="flex items-center justify-between pt-1">
              <div className="text-xs text-gray-400">
                {previewHasIssue && !result && 'Rows with missing required fields will be skipped'}
              </div>
              <div className="flex gap-2">
                {result ? (
                  <Button variant="primary" size="sm" onClick={handleClose}>
                    Done
                  </Button>
                ) : (
                  <>
                    <Button variant="ghost" size="sm" onClick={() => setStep(2)}>Back</Button>
                    <Button variant="primary" size="sm" onClick={handleSubmit} disabled={submitting}>
                      {submitting
                        ? 'Importing…'
                        : `Import ${rawRows.length} ${ENTITY_LABEL[entityType]}`}
                    </Button>
                  </>
                )}
              </div>
            </div>
          </div>
        )}

      </div>
    </Modal>
  )
}
