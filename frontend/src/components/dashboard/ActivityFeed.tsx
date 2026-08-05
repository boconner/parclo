import { Link } from 'react-router-dom'
import { useVisits } from '@/hooks/useQueries'

type Action = 'stocked' | 'checked' | 'order-placed' | 'issue-reported'

const ACTION_STYLE: Record<Action, { bg: string; icon: React.ReactNode; verb: string }> = {
  'stocked': {
    bg: 'bg-green-50',
    verb: 'Stocked',
    icon: <svg width="12" height="12" viewBox="0 0 12 12" fill="none"><path d="M2 6.5l2.5 2.5 5.5-5.5" stroke="#10b981" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/></svg>,
  },
  'checked': {
    bg: 'bg-blue-50',
    verb: 'Checked',
    icon: <svg width="12" height="12" viewBox="0 0 12 12" fill="none"><circle cx="6" cy="6" r="4.5" stroke="#3b82f6" strokeWidth="1.3"/><path d="M6 3.5V6l1.5 1.5" stroke="#3b82f6" strokeWidth="1.2" strokeLinecap="round"/></svg>,
  },
  'order-placed': {
    bg: 'bg-accent-light',
    verb: 'Order placed',
    icon: <svg width="12" height="12" viewBox="0 0 12 12" fill="none"><rect x="1" y="2" width="10" height="8" rx="1.5" stroke="#724fac" strokeWidth="1.3"/><path d="M3.5 5h5M3.5 7h3" stroke="#724fac" strokeWidth="1.1" strokeLinecap="round"/></svg>,
  },
  'issue-reported': {
    bg: 'bg-red-50',
    verb: 'Issue reported',
    icon: <svg width="12" height="12" viewBox="0 0 12 12" fill="none"><path d="M6 1L11 10H1L6 1z" stroke="#ef4444" strokeWidth="1.2" strokeLinejoin="round"/><path d="M6 4.5v2.5M6 8.5v.5" stroke="#ef4444" strokeWidth="1.2" strokeLinecap="round"/></svg>,
  },
}

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime()
  const mins = Math.floor(diff / 60_000)
  const hours = Math.floor(diff / 3_600_000)
  const days = Math.floor(diff / 86_400_000)
  if (mins < 60)  return `${mins}m ago`
  if (hours < 24) return `${hours}h ago`
  if (days === 1) return 'Yesterday'
  return `${days}d ago`
}

export function ActivityFeed() {
  const { data: visits } = useVisits()

  const feed = (visits ?? []).slice(0, 8)

  return (
    <div>
      <div className="px-5 py-4 border-b border-gray-100">
        <h2 className="text-sm font-semibold text-gray-900">Recent Activity</h2>
      </div>
      <div className="divide-y divide-gray-50">
        {feed.length === 0 ? (
          <p className="px-5 py-8 text-center text-sm text-gray-400">No recent activity</p>
        ) : (
          feed.map(v => {
            const style = ACTION_STYLE[v.action as Action] ?? ACTION_STYLE['checked']
            return (
              <Link
                key={v.id}
                to={`/stores/${v.storeId}`}
                className="flex gap-3 px-5 py-3 hover:bg-gray-50 transition-colors group"
              >
                <div className={`w-6 h-6 rounded-full ${style.bg} flex items-center justify-center flex-shrink-0 mt-0.5`}>
                  {style.icon}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-xs text-gray-700 leading-relaxed">
                    <span className="font-medium">{v.rep}</span>
                    {' · '}
                    <span className="text-gray-500">{style.verb}</span>
                    {' at '}
                    <span className="font-medium text-gray-900 group-hover:text-accent transition-colors">
                      {v.storeName}
                    </span>
                    {v.onShelf > 0 && (
                      <span className="text-gray-400"> — {v.onShelf} bottles</span>
                    )}
                  </p>
                  <p className="text-[10px] text-gray-400 mt-0.5">{timeAgo(v.date)}</p>
                </div>
              </Link>
            )
          })
        )}
      </div>
    </div>
  )
}
