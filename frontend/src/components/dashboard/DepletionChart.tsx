import { useState } from 'react'
import {
  BarChart, Bar,
  LineChart, Line,
  XAxis, YAxis, Tooltip,
  ResponsiveContainer, CartesianGrid,
} from 'recharts'
import { ChartToggle } from '@/components/ui/ChartToggle'
import type { ChartType } from '@/components/ui/ChartToggle'

const TOOLTIP_STYLE = {
  background: '#fff',
  border: '1px solid #e8eaed',
  borderRadius: 8,
  fontSize: 12,
}

const AXIS_TICK = { fontSize: 10, fill: '#9ca3af' }

export interface WeeklyDepletionBar {
  week:    string
  sold:    number
  ordered: number
}

interface DepletionChartProps {
  regionName?: string
  data: WeeklyDepletionBar[]
  loading?: boolean
}

export function DepletionChart({ regionName, data, loading }: DepletionChartProps) {
  const [chartType, setChartType] = useState<ChartType>('bar')
  // pie doesn't suit time-series depletion data — restrict to bar/line

  // An all-zero chart is indistinguishable from a broken one, so say which it
  // is: the figures come from bottles logged on visits and orders placed.
  const hasFigures = data.some(d => d.sold > 0 || d.ordered > 0)

  return (
    <div>
      <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
        <h2 className="text-sm font-semibold text-gray-900">
          Weekly Depletion{regionName ? ` — ${regionName}` : ''}
        </h2>
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-4">
            <LegendItem color="var(--accent)" label="Bottles sold"   type={chartType} />
            <LegendItem color="#e2e8f0" label="Orders placed"  type={chartType} />
          </div>
          <ChartToggle value={chartType} onChange={setChartType} types={['bar', 'line']} />
        </div>
      </div>

      {loading ? (
        <div className="px-5 py-4 h-28 flex items-center justify-center">
          <p className="text-xs text-gray-400">Loading…</p>
        </div>
      ) : !hasFigures ? (
        <div className="px-5 py-4 h-28 flex items-center justify-center text-center">
          <p className="text-xs text-gray-400 max-w-xs">
            Nothing recorded in the last {data.length} weeks. This chart draws on
            bottles logged on visits and orders placed.
          </p>
        </div>
      ) : (
      <div className="px-5 py-4 h-28">
        <ResponsiveContainer width="100%" height="100%">
          {chartType === 'bar' ? (
            <BarChart key="bar" data={data} barSize={14} barGap={2}>
              <CartesianGrid vertical={false} stroke="#f1f5f9" />
              <XAxis dataKey="week" tick={AXIS_TICK} axisLine={false} tickLine={false} />
              <YAxis hide />
              <Tooltip contentStyle={TOOLTIP_STYLE} cursor={{ fill: '#f8f9fb' }} />
              <Bar dataKey="sold"    name="Bottles sold"   fill="var(--accent)" radius={[3, 3, 0, 0]} />
              <Bar dataKey="ordered" name="Orders placed"  fill="#e2e8f0" radius={[3, 3, 0, 0]} />
            </BarChart>
          ) : (
            <LineChart key="line" data={data} margin={{ top: 4, right: 4, bottom: 0, left: 0 }}>
              <CartesianGrid vertical={false} stroke="#f1f5f9" />
              <XAxis dataKey="week" tick={AXIS_TICK} axisLine={false} tickLine={false} />
              <YAxis hide />
              <Tooltip contentStyle={TOOLTIP_STYLE} cursor={{ stroke: '#e2e8f0' }} />
              <Line dataKey="sold"    name="Bottles sold"  stroke="var(--accent)" strokeWidth={2} dot={{ r: 3, fill: 'var(--accent)' }} activeDot={{ r: 5 }} />
              <Line dataKey="ordered" name="Orders placed" stroke="#94a3b8" strokeWidth={2} dot={{ r: 3, fill: '#94a3b8' }} activeDot={{ r: 5 }} strokeDasharray="4 3" />
            </LineChart>
          )}
        </ResponsiveContainer>
      </div>
      )}
    </div>
  )
}

function LegendItem({ color, label, type }: { color: string; label: string; type: ChartType }) {
  return (
    <div className="flex items-center gap-1.5 text-xs text-gray-500">
      {type === 'bar' ? (
        <div className="w-2.5 h-2.5 rounded-sm flex-shrink-0" style={{ background: color }} />
      ) : (
        <svg width="16" height="8" viewBox="0 0 16 8" fill="none" className="flex-shrink-0">
          <line x1="0" y1="4" x2="16" y2="4" stroke={color === '#e2e8f0' ? '#94a3b8' : color} strokeWidth="2" strokeLinecap="round" strokeDasharray={color === '#e2e8f0' ? '4 3' : undefined} />
        </svg>
      )}
      {label}
    </div>
  )
}
