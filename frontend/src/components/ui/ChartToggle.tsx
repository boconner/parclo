import { clsx } from 'clsx'

export type ChartType = 'bar' | 'line' | 'pie'

const BUTTONS: { type: ChartType; title: string; icon: React.ReactNode }[] = [
  {
    type: 'bar', title: 'Bar chart',
    icon: <svg width="13" height="13" viewBox="0 0 13 13" fill="none"><rect x="0.5" y="5"  width="3" height="7.5" rx="1" fill="currentColor"/><rect x="5"   y="2"  width="3" height="10.5" rx="1" fill="currentColor"/><rect x="9.5" y="0"  width="3" height="12.5" rx="1" fill="currentColor"/></svg>,
  },
  {
    type: 'line', title: 'Line chart',
    icon: <svg width="13" height="13" viewBox="0 0 13 13" fill="none"><polyline points="0,10 3.5,5.5 7,8 13,1" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" fill="none"/></svg>,
  },
  {
    type: 'pie', title: 'Pie chart',
    icon: <svg width="13" height="13" viewBox="0 0 13 13" fill="none"><path d="M6.5 6.5V1A5.5 5.5 0 016.5 12 5.5 5.5 0 011 6.5H6.5z" fill="currentColor" opacity=".35"/><path d="M6.5 1a5.5 5.5 0 015.5 5.5H6.5V1z" fill="currentColor"/></svg>,
  },
]

export function ChartToggle({
  value, onChange, types = ['bar', 'line', 'pie'],
}: {
  value:    ChartType
  onChange: (v: ChartType) => void
  types?:   ChartType[]
}) {
  return (
    <div className="flex items-center gap-0.5 bg-gray-100 rounded-lg p-0.5">
      {BUTTONS.filter(b => types.includes(b.type)).map(b => (
        <ToggleBtn key={b.type} active={value === b.type} onClick={() => onChange(b.type)} title={b.title}>
          {b.icon}
        </ToggleBtn>
      ))}
    </div>
  )
}

function ToggleBtn({ active, onClick, title, children }: {
  active: boolean; onClick: () => void; title: string; children: React.ReactNode
}) {
  return (
    <button
      onClick={onClick}
      title={title}
      className={clsx(
        'w-6 h-6 flex items-center justify-center rounded-md transition-all',
        active
          ? 'bg-white text-accent shadow-sm'
          : 'text-gray-400 hover:text-gray-600'
      )}
    >
      {children}
    </button>
  )
}
