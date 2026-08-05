// src/components/ui/Skeleton.tsx
import { clsx } from 'clsx'

export function Skeleton({ className, style }: { className?: string; style?: React.CSSProperties }) {
  return (
    <div className={clsx('bg-gray-100 rounded animate-pulse', className)} style={style} />
  )
}

export function SkeletonStatCard() {
  return (
    <div className="bg-white border border-gray-200 rounded-xl px-5 py-4">
      <Skeleton className="h-3 w-24 mb-3" />
      <Skeleton className="h-8 w-16 mb-2" />
      <Skeleton className="h-2.5 w-32" />
    </div>
  )
}

export function SkeletonChainCard() {
  return (
    <div className="bg-white border border-gray-200 rounded-xl p-5">
      <div className="flex items-center gap-3 mb-4">
        <Skeleton className="w-10 h-10 rounded-xl flex-shrink-0" />
        <div className="flex-1">
          <Skeleton className="h-4 w-28 mb-1.5" />
          <Skeleton className="h-3 w-16" />
        </div>
      </div>
      <div className="grid grid-cols-3 gap-3 mb-4">
        {[0, 1, 2].map(i => (
          <div key={i}>
            <Skeleton className="h-2.5 w-12 mb-1.5" />
            <Skeleton className="h-5 w-10" />
          </div>
        ))}
      </div>
      <Skeleton className="h-1.5 w-full rounded-full mb-4" />
      <div className="flex gap-1.5">
        <Skeleton className="h-4 w-14 rounded-full" />
        <Skeleton className="h-4 w-12 rounded-full" />
      </div>
    </div>
  )
}

export function SkeletonTableRow({ cols = 8 }: { cols?: number }) {
  const widths = [140, 80, 64, 40, 40, 72, 56, 56]
  return (
    <tr className="border-b border-gray-50">
      <td className="px-5 py-3.5">
        <div className="flex items-center gap-2.5">
          <Skeleton className="w-7 h-7 rounded-lg flex-shrink-0" />
          <div>
            <Skeleton className="h-3.5 mb-1" style={{ width: 120 }} />
            <Skeleton className="h-2.5" style={{ width: 80 }} />
          </div>
        </div>
      </td>
      {Array.from({ length: cols - 1 }).map((_, i) => (
        <td key={i} className="px-5 py-3.5">
          <Skeleton className="h-3.5 rounded" style={{ width: widths[i + 1] ?? 60 }} />
        </td>
      ))}
    </tr>
  )
}

export function SkeletonStoreDetail() {
  return (
    <div className="p-4 lg:p-8">
      <Skeleton className="h-4 w-32 mb-6" />
      <div className="flex gap-4 mb-6">
        <Skeleton className="w-12 h-12 rounded-xl flex-shrink-0" />
        <div>
          <Skeleton className="h-5 w-48 mb-2" />
          <Skeleton className="h-3.5 w-64" />
        </div>
      </div>
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-6">
        {[0, 1, 2, 3].map(i => <SkeletonStatCard key={i} />)}
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        <div className="lg:col-span-2 space-y-5">
          <Skeleton className="h-56 rounded-xl" />
          <Skeleton className="h-64 rounded-xl" />
        </div>
        <div className="space-y-5">
          <Skeleton className="h-48 rounded-xl" />
          <Skeleton className="h-36 rounded-xl" />
        </div>
      </div>
    </div>
  )
}

export function DashboardSkeleton() {
  return (
    <div className="p-4 lg:p-8 space-y-5">
      <Skeleton className="h-6 w-48" />
      <div className="flex gap-1.5">
        {Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-8 w-24 rounded-lg" />)}
      </div>
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {Array.from({ length: 4 }).map((_, i) => <SkeletonStatCard key={i} />)}
      </div>
      <Skeleton className="h-40 rounded-xl" />
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        <Skeleton className="h-72 rounded-xl" />
        <Skeleton className="h-72 rounded-xl" />
      </div>
    </div>
  )
}
