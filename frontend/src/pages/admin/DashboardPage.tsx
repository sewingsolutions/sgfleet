import { useQuery } from '@tanstack/react-query'
import { Boxes, TrendingUp, AlertCircle, Users, Clock, EyeOff } from 'lucide-react'
import { api } from '../../api/client'
import type { DashboardStats } from '../../api/types'

const card = 'relative overflow-hidden rounded-xl p-5 sm:p-6 border transition-shadow hover:shadow-md'
const cardBg = 'bg-white dark:bg-slate-800 border-gray-200 dark:border-slate-700'

function StatCard({
  title,
  value,
  icon,
  color,
  subtitle,
}: {
  title: string
  value: string | number
  icon: React.ReactNode
  color: string
  subtitle?: string
}) {
  return (
    <div className={`${card} ${cardBg}`}>
      <div className="flex items-start justify-between">
        <div className="flex-1">
          <p className="text-sm font-medium text-gray-500 dark:text-gray-400">{title}</p>
          <p className="mt-2 text-3xl sm:text-4xl font-bold tracking-tight">{value}</p>
          {subtitle && <p className="mt-1 text-xs text-gray-400 dark:text-gray-500">{subtitle}</p>}
        </div>
        <div className={`flex items-center justify-center w-12 h-12 rounded-lg ${color}`}>
          {icon}
        </div>
      </div>
    </div>
  )
}

function UnicornSVG() {
  return (
    <svg viewBox="0 0 200 200" className="w-48 h-48 sm:w-56 sm:h-56 mx-auto" fill="none" xmlns="http://www.w3.org/2000/svg">
      {/* Spiral horn */}
      <path d="M56 33L62 8" className="stroke-amber-400 dark:stroke-amber-300" strokeWidth="4" strokeLinecap="round" />
      <path d="M59 24L63 20" className="stroke-amber-500 dark:stroke-amber-400" strokeWidth="1.5" strokeLinecap="round" />
      <path d="M61 16L64 13" className="stroke-amber-500 dark:stroke-amber-400" strokeWidth="1.5" strokeLinecap="round" />
      {/* Body + neck as one filled shape */}
      <path d="M68 50C65 60 68 75 72 85C76 95 80 105 95 118L82 128L78 135C72 140 72 148 72 155C65 152 55 150 45 145C45 160 55 170 65 172L75 165C72 155 72 148 72 140C78 135 78 135 82 128L95 118C110 108 125 105 140 102C155 108 162 115 169 122C172 135 172 145 165 158C155 168 145 165 148 155C148 148 148 140 155 132L160 125C162 115 155 108 140 105C125 105 110 115 95 125L82 128C78 120 75 105 72 95C68 85 65 70 68 50Z" className="fill-gray-100 dark:fill-slate-200" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      {/* Legs */}
      <path d="M55 155L52 175" className="stroke-current" strokeWidth="4" strokeLinecap="round" />
      <path d="M70 155L68 175" className="stroke-current" strokeWidth="4" strokeLinecap="round" />
      <path d="M145 155L142 175" className="stroke-current" strokeWidth="4" strokeLinecap="round" />
      <path d="M160 155L158 175" className="stroke-current" strokeWidth="4" strokeLinecap="round" />
      {/* Hooves */}
      <path d="M49 172L55 175" className="stroke-amber-700 dark:stroke-amber-500" strokeWidth="2.5" strokeLinecap="round" />
      <path d="M65 172L71 175" className="stroke-amber-700 dark:stroke-amber-500" strokeWidth="2.5" strokeLinecap="round" />
      <path d="M139 172L145 175" className="stroke-amber-700 dark:stroke-amber-500" strokeWidth="2.5" strokeLinecap="round" />
      <path d="M155 172L161 175" className="stroke-amber-700 dark:stroke-amber-500" strokeWidth="2.5" strokeLinecap="round" />
      {/* Head */}
      <ellipse cx="52" cy="45" rx="14" ry="12" className="fill-gray-100 dark:fill-slate-200" stroke="currentColor" strokeWidth="2" />
      {/* Ear */}
      <path d="M62 36C62 36 65 28 68 30C70 32 66 38 66 38" className="fill-gray-100 dark:fill-slate-200" stroke="currentColor" strokeWidth="1.5" />
      {/* Eye - happy */}
      <path d="M46 43C46 43 48 46 50 43" className="stroke-gray-700 dark:stroke-slate-600" strokeWidth="1.5" strokeLinecap="round" fill="none" />
      {/* Smile */}
      <path d="M40 48C40 48 44 52 48 49" className="stroke-pink-400 dark:stroke-pink-300" strokeWidth="1.5" strokeLinecap="round" fill="none" />
      {/* Blush */}
      <circle cx="42" cy="48" r="3" className="fill-pink-200 dark:fill-pink-400 opacity-50" />
      {/* Mane */}
      <path d="M66 38C72 35 78 38 75 48C72 55 68 52 68 52" className="fill-violet-300 dark:fill-violet-400" stroke="violet" strokeWidth="1" opacity="0.7" />
      <path d="M65 50C72 48 78 52 75 62C72 68 66 64 66 64" className="fill-purple-300 dark:fill-purple-400" stroke="purple" strokeWidth="1" opacity="0.7" />
      <path d="M62 64C68 62 74 66 72 76C69 82 62 78 62 78" className="fill-fuchsia-300 dark:fill-fuchsia-400" stroke="fuchsia" strokeWidth="1" opacity="0.7" />
      <path d="M58 78C64 76 70 80 68 90C65 96 58 92 58 92" className="fill-violet-300 dark:fill-violet-400" stroke="violet" strokeWidth="1" opacity="0.7" />
      <path d="M55 92C60 90 66 94 64 104" className="fill-purple-300 dark:fill-purple-400" stroke="purple" strokeWidth="1" opacity="0.7" />
      {/* Tail */}
      <path d="M172 130C182 128 188 135 185 145C182 155 178 152 178 152" className="fill-fuchsia-300 dark:fill-fuchsia-400" stroke="fuchsia" strokeWidth="1" opacity="0.7" />
      <path d="M172 135C180 135 186 142 184 150" className="fill-violet-300 dark:fill-violet-400" stroke="violet" strokeWidth="1" opacity="0.7" />
      {/* Belly highlight */}
      <path d="M82 130C100 126 130 126 155 130" className="stroke-white dark:stroke-slate-100" strokeWidth="1.5" strokeLinecap="round" opacity="0.5" fill="none" />
    </svg>
  )
}

const formatNumber = (n: number) => n.toLocaleString()

export default function DashboardPage() {
  const { data: stats, isLoading } = useQuery<DashboardStats, Error>({
    queryKey: ['dashboardStats'],
    queryFn: api.getDashboardStats,
    staleTime: 30_000,
  })

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="w-8 h-8 border-2 border-indigo-600 dark:border-indigo-400 border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  if (!stats) {
    return <div className="text-center py-10 text-gray-500">Unable to load dashboard data</div>
  }

  return (
    <div className="space-y-8">
      <div className="text-center">
        <h1 className="text-2xl sm:text-3xl font-bold text-gray-900 dark:text-white">SGFleet inference gateway</h1>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-6">
        <StatCard
          title="Total Models"
          value={stats.total_models}
          color="bg-indigo-50 dark:bg-indigo-900/30 text-indigo-600 dark:text-indigo-400"
          icon={
            <Boxes className="w-6 h-6" />
          }
          subtitle={`${stats.active_models} active`}
        />
        <StatCard
          title="Requests (24h)"
          value={formatNumber(stats.requests_24h)}
          color="bg-emerald-50 dark:bg-emerald-900/30 text-emerald-600 dark:text-emerald-400"
          icon={
            <TrendingUp className="w-6 h-6" />
          }
        />
        <StatCard
          title="Errors (24h)"
          value={formatNumber(stats.errors_24h)}
          color={stats.errors_24h > 0 ? 'bg-red-50 dark:bg-red-900/30 text-red-600 dark:text-red-400' : 'bg-emerald-50 dark:bg-emerald-900/30 text-emerald-600 dark:text-emerald-400'}
          icon={
            <AlertCircle className="w-6 h-6" />
          }
        />
        <StatCard
          title="Total Users"
          value={stats.total_users}
          color="bg-violet-50 dark:bg-violet-900/30 text-violet-600 dark:text-violet-400"
          icon={
            <Users className="w-6 h-6" />
          }
          subtitle={`${stats.active_users} active`}
        />
        <StatCard
          title="Median Latency (24h)"
          value={stats.median_latency_ms > 0 ? `${stats.median_latency_ms}ms` : '—'}
          color="bg-sky-50 dark:bg-sky-900/30 text-sky-600 dark:text-sky-400"
          icon={
            <Clock className="w-6 h-6" />
          }
        />
        <StatCard
          title="Rate Limited (24h)"
          value={formatNumber(stats.rate_limited_24h)}
          color={stats.rate_limited_24h > 0 ? 'bg-orange-50 dark:bg-orange-900/30 text-orange-600 dark:text-orange-400' : 'bg-emerald-50 dark:bg-emerald-900/30 text-emerald-600 dark:text-emerald-400'}
          icon={
            <EyeOff className="w-6 h-6" />
          }
        />
      </div>

      <div className="flex flex-col items-center mt-8">
        <UnicornSVG />
        <p className="mt-4 text-sm font-medium text-gray-400 dark:text-gray-500 italic">Happy coding! 🦄</p>
      </div>
    </div>
  )
}