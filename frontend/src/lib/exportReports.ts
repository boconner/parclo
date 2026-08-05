import jsPDF from 'jspdf'
import autoTable from 'jspdf-autotable'
import html2canvas from 'html2canvas'
import type { RegionInventoryRow, RepActivityRow, StockoutRow } from '@/lib/reportHooks'
import { getBrandCached, brandSlug, hexToRgb, DEFAULT_BRAND } from '@/lib/brand'

export interface ExportData {
  periodLabel:  string
  marketLabel:  string
  inventory:    RegionInventoryRow[]
  activity:     RepActivityRow[]
  stockouts:    StockoutRow[]
  // optional chart element refs for pie chart capture
  invChartEl?:   HTMLElement | null
  actChartEl?:   HTMLElement | null
  stockChartEl?: HTMLElement | null
}

// ─── color constants ──────────────────────────────────────────────────────────

const ACCENT: [number, number, number] =
  hexToRgb(getBrandCached().primaryColor) ?? hexToRgb(DEFAULT_BRAND.primaryColor)!
const GRAY9   = [17,  24,  39] as [number, number, number]
const GRAY5   = [107, 114, 128] as [number, number, number]
const GRAY1   = [243, 244, 246] as [number, number, number]
const RED     = [239,  68,  68] as [number, number, number]
const AMBER   = [245, 158,  11] as [number, number, number]
const GREEN   = [ 16, 185, 129] as [number, number, number]

// ─── helpers ──────────────────────────────────────────────────────────────────

function toCsv(headers: string[], rows: (string | number | null)[][]): string {
  const escape = (v: string | number | null) => {
    const s = v === null ? '' : String(v)
    return s.includes(',') || s.includes('"') || s.includes('\n')
      ? `"${s.replace(/"/g, '""')}"` : s
  }
  return [headers, ...rows].map(r => r.map(escape).join(',')).join('\n')
}

function download(content: string, filename: string, mime: string) {
  const blob = new Blob([content], { type: mime })
  const url  = URL.createObjectURL(blob)
  const a    = document.createElement('a')
  a.href = url; a.download = filename; a.click()
  URL.revokeObjectURL(url)
}

interface CaptureResult { dataUrl: string; aspectRatio: number }

async function captureElement(el: HTMLElement): Promise<CaptureResult | null> {
  try {
    const canvas = await html2canvas(el, { scale: 2, backgroundColor: '#ffffff', useCORS: true })
    return { dataUrl: canvas.toDataURL('image/png'), aspectRatio: canvas.height / canvas.width }
  } catch {
    return null
  }
}

async function getLogoBase64(url: string): Promise<string | null> {
  try {
    const res = await fetch(url)
    const blob = await res.blob()
    return new Promise(resolve => {
      const reader = new FileReader()
      reader.onload = () => resolve(reader.result as string)
      reader.onerror = () => resolve(null)
      reader.readAsDataURL(blob)
    })
  } catch {
    return null
  }
}

// ─── PDF header builder ───────────────────────────────────────────────────────

async function buildHeader(
  doc: jsPDF,
  marketLabel: string,
  periodLabel: string,
  logoUrl: string,
): Promise<number> {
  const W = doc.internal.pageSize.getWidth()
  doc.setFillColor(...ACCENT)
  doc.rect(0, 0, W, 52, 'F')

  // Logo, or the brand name as a wordmark when none is configured
  const logoData = logoUrl ? await getLogoBase64(logoUrl) : null
  if (logoData) {
    try { doc.addImage(logoData, 'PNG', 30, 8, 90, 28) } catch { /* skip if fails */ }
  } else {
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(16)
    doc.setTextColor(255, 255, 255)
    doc.text(getBrandCached().brandName, 30, 30)
  }

  // Title on right side
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(14)
  doc.setTextColor(255, 255, 255)
  doc.text('Distribution Report', W - 36, 22, { align: 'right' })
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(9)
  doc.text(`${marketLabel}  ·  ${periodLabel}`, W - 36, 34, { align: 'right' })
  doc.setTextColor(...GRAY5)
  doc.text(`Generated ${new Date().toLocaleDateString('en-US', { dateStyle: 'long' })}`, W - 36, 44, { align: 'right' })

  return 68
}

function sectionTitle(doc: jsPDF, title: string, y: number): number {
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(10)
  doc.setTextColor(...GRAY9)
  doc.text(title, 36, y)
  return y + 4
}

// ─── CSV export ───────────────────────────────────────────────────────────────

export function exportCSV({ periodLabel, marketLabel, inventory, activity, stockouts }: ExportData) {
  const sections: string[] = []
  sections.push(`${getBrandCached().brandName} Report — ${marketLabel} — ${periodLabel}`)
  sections.push(`Generated: ${new Date().toLocaleDateString('en-US', { dateStyle: 'long' })}`)
  sections.push('')

  sections.push('INVENTORY BY REGION')
  sections.push(toCsv(
    ['Region', 'Stores', 'On Shelf', 'In Process', 'Avg Days Supply', 'Critical', 'Low', 'Good'],
    inventory.map(r => [r.name, r.storeCount, r.onShelf, r.inProcess, r.avgDays, r.critical, r.low, r.good]),
  ))
  sections.push('')

  sections.push('VISIT ACTIVITY BY REP')
  sections.push(toCsv(
    ['Rep', 'Region', 'Visits', 'Stocked', 'Checked', 'Orders', 'Issues', 'Last Visit'],
    activity.map(r => [
      r.rep, r.regionName, r.visits, r.stocked, r.checked, r.ordered, r.issues,
      new Date(r.lastVisit).toLocaleDateString('en-US'),
    ]),
  ))
  sections.push('')

  sections.push('PROJECTED STOCKOUTS')
  sections.push(toCsv(
    ['Store', 'Region', 'Rep', 'On Shelf', 'Rate (btl/day)', 'Days Left', 'Projected Empty', 'Urgency'],
    stockouts.map(r => {
      const urgency = r.daysLeft < 7 ? 'Critical' : r.daysLeft < 10 ? 'Low' : 'Good'
      return [r.storeName, r.regionName, r.rep, r.onShelf, r.depletionRate, r.daysLeft,
              r.projectedDate.toLocaleDateString('en-US'), urgency]
    }),
  ))

  download(sections.join('\n'), `${brandSlug()}-report-${Date.now()}.csv`, 'text/csv;charset=utf-8;')
}

// ─── full PDF export ──────────────────────────────────────────────────────────

export async function exportPDF(data: ExportData, logoUrl: string) {
  const { periodLabel, marketLabel, inventory, activity, stockouts,
          invChartEl, actChartEl, stockChartEl } = data

  // Capture any pie charts before building doc (DOM reads must happen first)
  const [invImg, actImg, stockImg] = await Promise.all([
    invChartEl   ? captureElement(invChartEl)   : Promise.resolve(null),
    actChartEl   ? captureElement(actChartEl)   : Promise.resolve(null),
    stockChartEl ? captureElement(stockChartEl) : Promise.resolve(null),
  ])

  const doc = new jsPDF({ orientation: 'landscape', unit: 'pt', format: 'letter' })
  const W   = doc.internal.pageSize.getWidth()
  const H   = doc.internal.pageSize.getHeight()
  let   y   = await buildHeader(doc, marketLabel, periodLabel, logoUrl)

  function maybeNewPage() {
    if (y > H - 80) { doc.addPage(); y = 36 }
  }

  function addChartImage(capture: CaptureResult | null) {
    if (!capture) return
    const imgW = W - 72
    const imgH = Math.min(imgW * capture.aspectRatio, H * 0.6)
    maybeNewPage()
    if (y + imgH > H - 36) { doc.addPage(); y = 36 }
    doc.addImage(capture.dataUrl, 'PNG', 36, y, imgW, imgH)
    y += imgH + 16
  }

  // Section 1: Inventory
  y = sectionTitle(doc, 'Inventory by Region', y)
  if (invImg?.dataUrl) {
    addChartImage(invImg)
  } else {
    autoTable(doc, {
      startY: y, margin: { left: 36, right: 36 },
      head: [['Region', 'Stores', 'On Shelf', 'In Process', 'Avg Days Supply', 'Critical', 'Low', 'Good']],
      body: inventory.map(r => [r.name, r.storeCount, r.onShelf, r.inProcess,
        r.avgDays !== null ? `${r.avgDays}d` : '—', r.critical, r.low, r.good]),
      headStyles: { fillColor: ACCENT, textColor: [255, 255, 255], fontStyle: 'bold', fontSize: 8 },
      bodyStyles: { fontSize: 8, textColor: GRAY9 },
      alternateRowStyles: { fillColor: GRAY1 },
      columnStyles: {
        2: { halign: 'right' }, 3: { halign: 'right' }, 4: { halign: 'right' },
        5: { halign: 'right', textColor: RED }, 6: { halign: 'right', textColor: AMBER },
        7: { halign: 'right', textColor: GREEN },
      },
      didParseCell(data) {
        if (data.section === 'body' && data.column.index === 4 && data.cell.raw !== '—') {
          const d = parseInt(String(data.cell.raw))
          data.cell.styles.textColor = d < 7 ? RED : d < 10 ? AMBER : GREEN
        }
      },
    })
    y = (doc as any).lastAutoTable.finalY + 20
  }

  // Section 2: Visit Activity
  maybeNewPage()
  y = sectionTitle(doc, 'Visit Activity by Rep', y)
  if (actImg?.dataUrl) {
    addChartImage(actImg)
  } else {
    autoTable(doc, {
      startY: y, margin: { left: 36, right: 36 },
      head: [['Rep', 'Region', 'Visits', 'Stocked', 'Checked', 'Orders', 'Issues', 'Last Visit']],
      body: activity.map(r => [r.rep, r.regionName, r.visits, r.stocked, r.checked, r.ordered, r.issues,
        new Date(r.lastVisit).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })]),
      headStyles: { fillColor: ACCENT, textColor: [255, 255, 255], fontStyle: 'bold', fontSize: 8 },
      bodyStyles: { fontSize: 8, textColor: GRAY9 },
      alternateRowStyles: { fillColor: GRAY1 },
      columnStyles: {
        2: { halign: 'right' }, 3: { halign: 'right', textColor: GREEN },
        4: { halign: 'right' }, 5: { halign: 'right', textColor: ACCENT },
        6: { halign: 'right', textColor: RED },
      },
    })
    y = (doc as any).lastAutoTable.finalY + 20
  }

  // Section 3: Stockouts
  maybeNewPage()
  y = sectionTitle(doc, 'Projected Stockouts', y)
  if (stockImg?.dataUrl) {
    addChartImage(stockImg)
  } else {
    autoTable(doc, {
      startY: y, margin: { left: 36, right: 36 },
      head: [['Store', 'Region', 'Rep', 'On Shelf', 'Rate (btl/day)', 'Days Left', 'Projected Empty', 'Urgency']],
      body: stockouts.map(r => {
        const urgency = r.daysLeft < 7 ? 'Critical' : r.daysLeft < 10 ? 'Low' : 'Good'
        return [r.storeName, r.regionName, r.rep, r.onShelf, r.depletionRate, `${r.daysLeft}d`,
                r.projectedDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }), urgency]
      }),
      headStyles: { fillColor: ACCENT, textColor: [255, 255, 255], fontStyle: 'bold', fontSize: 8 },
      bodyStyles: { fontSize: 8, textColor: GRAY9 },
      alternateRowStyles: { fillColor: GRAY1 },
      columnStyles: { 3: { halign: 'right' }, 4: { halign: 'right' }, 5: { halign: 'right' } },
      didParseCell(data) {
        if (data.section === 'body') {
          if (data.column.index === 5) {
            const d = parseInt(String(data.cell.raw))
            data.cell.styles.textColor = d < 7 ? RED : d < 10 ? AMBER : GREEN
            data.cell.styles.fontStyle = 'bold'
          }
          if (data.column.index === 7) {
            const v = String(data.cell.raw)
            data.cell.styles.textColor = v === 'Critical' ? RED : v === 'Low' ? AMBER : GREEN
            data.cell.styles.fontStyle = 'bold'
          }
        }
      },
    })
  }

  doc.save(`${brandSlug()}-report-${Date.now()}.pdf`)
}

// ─── individual section PDF export ───────────────────────────────────────────

export async function exportSectionPDF(
  title: string,
  chartEl: HTMLElement | null,
  tableRows: (string | number | null)[][],
  headers: string[],
  logoUrl: string,
  periodLabel: string,
  marketLabel: string,
) {
  const capture = chartEl ? await captureElement(chartEl) : null

  const doc = new jsPDF({ orientation: 'landscape', unit: 'pt', format: 'letter' })
  const W   = doc.internal.pageSize.getWidth()
  const H   = doc.internal.pageSize.getHeight()
  let   y   = await buildHeader(doc, marketLabel, periodLabel, logoUrl)

  y = sectionTitle(doc, title, y)

  if (capture?.dataUrl) {
    const imgW = W - 72
    const imgH = Math.min(imgW * capture.aspectRatio, H * 0.6)
    doc.addImage(capture.dataUrl, 'PNG', 36, y, imgW, imgH)
  } else {
    autoTable(doc, {
      startY: y, margin: { left: 36, right: 36 },
      head: [headers],
      body: tableRows,
      headStyles: { fillColor: ACCENT, textColor: [255, 255, 255], fontStyle: 'bold', fontSize: 8 },
      bodyStyles: { fontSize: 8, textColor: GRAY9 },
      alternateRowStyles: { fillColor: GRAY1 },
    })
  }

  doc.save(`${brandSlug()}-${title.toLowerCase().replace(/\s+/g, '-')}-${Date.now()}.pdf`)
}
