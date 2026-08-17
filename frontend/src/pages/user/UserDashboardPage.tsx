import { Link } from 'react-router-dom'
import UserLayout from '../../components/UserLayout'
import { useMyQuota } from '../../hooks/useMyQuota'
import { useMyModels } from '../../hooks/useMyModels'

export default function UserDashboardPage() {
  const { data: quota, isLoading: quotaLoading } = useMyQuota()
  const { data: modelsRes, isLoading: modelsLoading } = useMyModels()

  const loading = quotaLoading || modelsLoading
  const todayRequests = quota?.today_requests ?? 0
  const totalRequests = quota?.total_requests ?? 0
  const totalTokens = quota?.total_tokens ?? 0
  const dailyQuota = quota?.daily_quota ?? null
  const modelsCount = modelsRes?.models?.length ?? 0

  const formatNum = (n: number) => n.toLocaleString()

  const cards = [
    { label: 'Today\'s Requests', value: loading ? '...' : formatNum(todayRequests), color: 'indigo' },
    { label: 'Total Requests', value: loading ? '...' : formatNum(totalRequests), color: 'emerald' },
    { label: 'Total Tokens', value: loading ? '...' : formatNum(totalTokens), color: 'amber' },
    { label: 'Authorized Models', value: loading ? '...' : modelsCount, color: 'purple' },
  ]

  const colorMap = {
    indigo: 'bg-indigo-50 dark:bg-indigo-900/20 text-indigo-700 dark:text-indigo-300 border-indigo-200 dark:border-indigo-800',
    emerald: 'bg-emerald-50 dark:bg-emerald-900/20 text-emerald-700 dark:text-emerald-300 border-emerald-200 dark:border-emerald-800',
    amber: 'bg-amber-50 dark:bg-amber-900/20 text-amber-700 dark:text-amber-300 border-amber-200 dark:border-amber-800',
    purple: 'bg-purple-50 dark:bg-purple-900/20 text-purple-700 dark:text-purple-300 border-purple-200 dark:border-purple-800',
  }

  return (
    <UserLayout>
      <h1 className="text-2xl font-bold mb-6">Dashboard</h1>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        {cards.map((card) => (
          <div key={card.label} className={`p-4 rounded-lg border ${colorMap[card.color as keyof typeof colorMap]}`}>
            <p className="text-sm opacity-70">{card.label}</p>
            <p className="text-2xl font-bold mt-1">{card.value}</p>
          </div>
        ))}
      </div>

      {dailyQuota != null && (
        <div className="bg-white dark:bg-slate-800 rounded-lg border border-gray-200 dark:border-slate-700 p-6 mb-8">
          <h2 className="text-lg font-semibold mb-3">Daily Quota</h2>
          <div className="flex items-center gap-4">
            <div className="flex-1">
              <div className="h-4 bg-gray-100 dark:bg-slate-700 rounded-full overflow-hidden">
                <div
                  className="h-full bg-indigo-500 rounded-full transition-all"
                  style={{
                    width: `${Math.min(100, (todayRequests / dailyQuota) * 100)}%`,
                  }}
                />
              </div>
              <p className="text-sm text-gray-500 dark:text-gray-400 mt-2">
                {todayRequests} / {formatNum(dailyQuota)} requests today
              </p>
            </div>
          </div>
        </div>
      )}

      <div className="bg-white dark:bg-slate-800 rounded-lg border border-gray-200 dark:border-slate-700 p-6">
        <h2 className="text-lg font-semibold mb-4">Quick Links</h2>
        <div className="grid grid-cols-2 gap-3">
          <Link to="/user/models" className="px-4 py-3 bg-gray-50 dark:bg-slate-700 rounded-lg text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-slate-600 transition text-center">
            View Models
          </Link>
          <Link to="/user/config" className="px-4 py-3 bg-gray-50 dark:bg-slate-700 rounded-lg text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-slate-600 transition text-center">
            Config Generator
          </Link>
          <Link to="/user/metrics" className="px-4 py-3 bg-gray-50 dark:bg-slate-700 rounded-lg text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-slate-600 transition text-center">
            Metrics
          </Link>
          <Link to="/user/quota" className="px-4 py-3 bg-gray-50 dark:bg-slate-700 rounded-lg text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-slate-600 transition text-center">
            Quota Details
          </Link>
        </div>
      </div>
    </UserLayout>
  )
}
