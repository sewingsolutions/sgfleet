import { useState } from 'react'
import { fmt } from '../../lib/format'
import { useUserStats, useUserSummary, useFleetStats } from '../../hooks/useUserStats'
import { useUserRequests } from '../../hooks/useAudit'
import { useChartTheme } from '../../hooks/useChartTheme'
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Legend,
  Filler,
} from 'chart.js'
import { Line } from 'react-chartjs-2'
import { useGetUsers } from '../../hooks/useUsers'

ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, Title, Tooltip, Legend, Filler)

const ranges = ['1h', '6h', '24h', '7d']
const card = 'bg-gray-50 dark:bg-slate-800 rounded-lg p-3 sm:p-4 border border-gray-200 dark:border-slate-700'

function CC({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className={card}>
      <h3 className="text-xs sm:text-sm text-gray-500 dark:text-gray-400 mb-2 sm:mb-3">{title}</h3>
      <div className="relative w-full overflow-hidden" style={{ height: '200px', maxHeight: '256px' }}>
        {children}
      </div>
    </div>
  )
}

const UserStatCard = ({ u }: { u: { user: string; p50: number; p95: number; c429: number } }) => (
  <div className={`${card} p-2 sm:p-3`}>
    <div className="flex items-center justify-between mb-1">
      <span className="text-xs text-gray-500 dark:text-gray-400 truncate">{u.user}</span>
      <span className={`px-1.5 py-0.5 rounded text-xs ${u.p95 > 10 ? 'bg-red-50 dark:bg-red-900/50 text-red-700 dark:text-red-300' : u.p95 > 1 ? 'bg-amber-50 dark:bg-amber-900/50 text-amber-700 dark:text-amber-300' : 'bg-emerald-50 dark:bg-emerald-900/50 text-emerald-700 dark:text-emerald-300'}`}>
        {u.p95}s
      </span>
    </div>
    <div className="flex items-center justify-between text-xs text-gray-400 dark:text-gray-500">
      <span>p50 {u.p50}s</span>
      <span>{fmt(u.c429)} 429</span>
    </div>
  </div>
)

  const RequestCard = ({ r }: { r: { id: number; status: number; method: string; endpoint: string; latency_ms: number; timestamp: string; error_msg?: string } }) => (
  <div className={`${card} p-2 sm:p-3`}>
    <div className="flex items-center justify-between mb-1">
      <span className="text-xs text-gray-500 dark:text-gray-400 truncate flex-1">{r.endpoint}</span>
      <span className={`px-1.5 py-0.5 rounded text-xs flex-shrink-0 ml-2 ${
        r.status >= 500 ? 'bg-red-50 dark:bg-red-900/50 text-red-700 dark:text-red-300' : 
        r.status >= 400 ? 'bg-amber-50 dark:bg-amber-900/50 text-amber-700 dark:text-amber-300' : 
        'bg-emerald-50 dark:bg-emerald-900/50 text-emerald-700 dark:text-emerald-300'
      }`}>
        {r.status}
      </span>
    </div>
    <div className="flex items-center justify-between text-xs text-gray-400 dark:text-gray-500">
      <span className="flex items-center gap-2">
        <span className="font-mono">{r.method}</span>
        <span>{r.latency_ms >= 1000 ? `${(r.latency_ms / 1000).toFixed(1)}s` : `${r.latency_ms.toFixed(0)}ms`}</span>
      </span>
      <span className="text-gray-400 dark:text-gray-600 max-w-[80px]">{r.timestamp}</span>
    </div>
    {r.error_msg && <p className="text-xs text-red-400/60 mt-1 truncate">{r.error_msg}</p>}
  </div>
)

const dashboards = [
  {
    name: 'SGLang Dashboard',
    desc: 'Model-level metrics: latency, throughput, KV cache, GPU utilization, and more.',
    file: '/admin/dashboards/sglang-dashboard.json',
  },
  {
    name: 'SGLang Gateway Metrics',
    desc: 'Gateway-level metrics: requests, auth failures, rate limits, per-user breakdown.',
    file: '/admin/dashboards/sglang-gateway-metrics.json',
  },
]

function DashboardCard({ name, desc, file }: { name: string; desc: string; file: string }) {
  return (
    <div className={card}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <h4 className="text-sm font-medium text-gray-900 dark:text-white truncate">{name}</h4>
          <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">{desc}</p>
        </div>
        <a
          href={file}
          download
          className="flex-shrink-0 px-3 py-1.5 bg-indigo-600 hover:bg-indigo-700 rounded text-white text-xs transition"
        >
          Download
        </a>
      </div>
    </div>
  )
}

export default function MetricsPage() {
  const { data: users = [], isLoading: loadingUsers } = useGetUsers()
  const [view, setView] = useState<'fleet' | 'user'>('fleet')
  const [selectedId, setSelectedId] = useState<number | undefined>(undefined)
  const [range, setRange] = useState('24h')
  const [filterStatus, setFilterStatus] = useState('all')

  const chartTheme = useChartTheme()
  const fleetQuery = useFleetStats(range)
  const fleet = fleetQuery.data

  const activeId = view === 'user'
    ? (selectedId ?? (users.length > 0 ? users[0].id : undefined))
    : undefined
  const statsQuery = useUserStats(activeId, range)
  const summaryQuery = useUserSummary(activeId || undefined)
  const userRequestsQuery = useUserRequests(activeId)
  const stats = statsQuery.data
  const summary = summaryQuery.data
  const recentRequests = userRequestsQuery.data
  const loading = loadingUsers || (view === 'user' ? statsQuery.isLoading && userRequestsQuery.isLoading : fleetQuery.isLoading)

  const chartOpts = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: { legend: { display: true, position: 'top' as const, labels: { color: chartTheme.legendColor, boxWidth: 12 } } },
    scales: {
      x: { ticks: { color: chartTheme.tickColor, maxTicksLimit: 10 }, grid: { color: chartTheme.gridColor } },
      y: { ticks: { color: chartTheme.tickColor }, grid: { color: chartTheme.gridColor } },
    },
  }

  const makeData = (label: string, data: number[], color: string) => ({
    labels: stats ? stats.labels : fleet?.labels ?? [],
    datasets: [{
      label,
      data,
      borderColor: color,
      backgroundColor: `${color}20`,
      tension: 0.3,
      fill: true,
    }],
  })

  const quotaPercent = summary && summary.daily_quota ? Math.min(100, (summary.today_requests / summary.daily_quota) * 100) : null

  if (loading) return <div className="py-8 text-center text-gray-500 dark:text-gray-400">Loading...</div>
  if (view === 'user' && !activeId) return <div className="py-8 text-center text-gray-500 dark:text-gray-400">No users available</div>
  if (view === 'user' && !stats) return <div className="py-8 text-center text-gray-500 dark:text-gray-400">No stats available</div>
  if (view === 'fleet' && !fleet) return <div className="py-8 text-center text-gray-500 dark:text-gray-400">No fleet data available</div>

  return (
    <div>
      <div className="mb-6">
        <h3 className="text-xs sm:text-sm text-gray-500 dark:text-gray-400 mb-2 sm:mb-3">Grafana Dashboards</h3>
        <p className="text-xs text-gray-400 dark:text-gray-500 mb-3">Download and import these JSON files into your Grafana instance to monitor SGLang and gateway metrics.</p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {dashboards.map((d) => <DashboardCard key={d.name} {...d} />)}
        </div>
      </div>

      <div className="flex flex-col sm:flex-row gap-3 mb-6 items-stretch sm:items-center">
        <div className="flex gap-1 bg-gray-50 dark:bg-slate-800 rounded-lg p-1">
          <button
            onClick={() => setView('fleet')}
            className={`flex-1 sm:flex-none px-3 py-2 rounded-md text-sm font-medium transition ${
              view === 'fleet' ? 'bg-indigo-600 text-gray-900 dark:text-white' : 'text-gray-500 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white'
            }`}
          >
            Fleet
          </button>
          <button
            onClick={() => setView('user')}
            className={`flex-1 sm:flex-none px-3 py-2 rounded-md text-sm font-medium transition ${
              view === 'user' ? 'bg-emerald-600 text-gray-900 dark:text-white' : 'text-gray-500 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white'
            }`}
          >
            Per User
          </button>
        </div>

        <div className="flex gap-2 flex-wrap">
          {ranges.map((r) => (
            <button
              key={r}
              onClick={() => { setRange(r); setFilterStatus('all') }}
              className={`px-3 py-1.5 rounded text-sm transition ${range === r ? 'bg-indigo-600 text-gray-900 dark:text-white' : 'bg-gray-100 dark:bg-slate-700 hover:bg-gray-200 dark:hover:bg-slate-600 text-gray-700 dark:text-gray-300'}`}
            >
              {r}
            </button>
          ))}
        </div>

        {view === 'user' && (
          <div className="flex items-center gap-2 w-full sm:w-auto">
            <label className="text-gray-500 dark:text-gray-400 text-sm whitespace-nowrap">User:</label>
            <select
              value={selectedId}
              onChange={(e) => { setSelectedId(Number(e.target.value)); setFilterStatus('all') }}
              className="flex-1 sm:flex-none px-3 py-1.5 bg-gray-50 dark:bg-slate-800 border border-gray-300 dark:border-slate-600 rounded text-gray-900 dark:text-white text-sm"
            >
              {users.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
            </select>
          </div>
        )}
      </div>

      {view === 'fleet' && fleet && (
        <div key={`fleet-${range}`}>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
            <div className={card}>
              <p className="text-xs sm:text-sm text-gray-500 dark:text-gray-400">Active Users</p>
              <p className="text-lg sm:text-2xl font-bold text-gray-900 dark:text-white">{fleet.users.length}</p>
            </div>
            <div className={card}>
              <p className="text-xs sm:text-sm text-gray-500 dark:text-gray-400">Total Requests</p>
              <p className="text-lg sm:text-2xl font-bold text-gray-900 dark:text-white">{fmt(fleet.total_requests)}</p>
            </div>
            <div className={card}>
              <p className="text-xs sm:text-sm text-gray-500 dark:text-gray-400">Avg Latency</p>
              <p className={`text-lg sm:text-2xl font-bold truncate ${fleet.avg_latency > 5 ? 'text-red-600 dark:text-red-400' : fleet.avg_latency > 1 ? 'text-yellow-600 dark:text-yellow-400' : 'text-emerald-600 dark:text-emerald-400'}`}>
                {fleet.avg_latency.toFixed(2)}s
              </p>
            </div>
            <div className={card}>
              <p className="text-xs sm:text-sm text-gray-500 dark:text-gray-400">429 Rejections</p>
              <p className={`text-lg sm:text-2xl font-bold truncate ${fleet.total_429 > 0 ? 'text-red-600 dark:text-red-400' : 'text-emerald-600 dark:text-emerald-400'}`}>
                {fmt(fleet.total_429)}
              </p>
            </div>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 mb-6">
            <div className={card}>
              <p className="text-xs sm:text-sm text-gray-500 dark:text-gray-400">Prompt Tokens</p>
              <p className="text-lg sm:text-2xl font-bold text-gray-900 dark:text-white truncate">{fmt(fleet.total_prompt_tokens)}</p>
            </div>
            <div className={card}>
              <p className="text-xs sm:text-sm text-gray-500 dark:text-gray-400">Completion Tokens</p>
              <p className="text-lg sm:text-2xl font-bold text-gray-900 dark:text-white truncate">{fmt(fleet.total_completion_tokens)}</p>
            </div>
            <div className={`${card} col-span-2 sm:col-span-1`}>
              <p className="text-xs sm:text-sm text-gray-500 dark:text-gray-400">Total Tokens</p>
              <p className="text-lg sm:text-2xl font-bold text-gray-900 dark:text-white truncate">{fmt(fleet.total_prompt_tokens + fleet.total_completion_tokens)}</p>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-4 sm:gap-6 mb-6">
            <CC title="Latency — Fleet (p50 / p95)">
              <Line
                options={chartOpts}
                data={{
                  labels: fleet.labels,
                  datasets: [
                    {
                      label: 'p50',
                      data: fleet.users.length > 0 ? fleet.labels.map(() => {
                        const sum = fleet.users.reduce((a, u) => a + u.p50, 0)
                        return +(sum / fleet.users.length).toFixed(3)
                      }) : [],
                      borderColor: chartTheme.p50,
                      backgroundColor: `${chartTheme.p50}20`,
                      tension: 0.3,
                      fill: true,
                    },
                    {
                      label: 'p95',
                      data: fleet.users.length > 0 ? fleet.labels.map(() => {
                        const max = Math.max(...fleet.users.map(u => u.p95))
                        return max
                      }) : [],
                      borderColor: chartTheme.p95,
                      backgroundColor: `${chartTheme.p95}20`,
                      tension: 0.3,
                      fill: true,
                    },
                  ],
                }}
              />
            </CC>
            <CC title="429 Rejections over time">
              <Line
                options={{ ...chartOpts, plugins: { ...chartOpts.plugins, legend: { display: false } } }}
                data={{
                  labels: fleet.labels,
                  datasets: [{ label: '429s', data: fleet.count_429, borderColor: chartTheme.c429, backgroundColor: `${chartTheme.c429}20`, tension: 0.3, fill: true }],
                }}
              />
            </CC>
          </div>

          {/* Per-user latency as cards */}
          <div className="mb-6">
            <h3 className="text-xs sm:text-sm text-gray-500 dark:text-gray-400 mb-2 sm:mb-3">Per-User Latency</h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
              {fleet.users.map((u) => <UserStatCard key={u.user} u={u} />)}
            </div>
          </div>
        </div>
      )}

      {view === 'user' && stats !== undefined && (
        <div key={`${selectedId}-${range}`}>
          {summary && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4 mb-4 sm:mb-6">
              <div className={card}>
                <p className="text-xs sm:text-sm text-gray-500 dark:text-gray-400">Total Requests</p>
                <p className="text-lg sm:text-2xl font-bold text-gray-900 dark:text-white">{fmt(summary.total_requests)}</p>
              </div>
              <div className={card}>
                <p className="text-xs sm:text-sm text-gray-500 dark:text-gray-400">Total Cost</p>
                <p className="text-lg sm:text-2xl font-bold text-gray-900 dark:text-white">${summary.total_cost.toFixed(3)}</p>
              </div>
              <div className={`${card} sm:col-span-2`}>
                <p className="text-xs sm:text-sm text-gray-500 dark:text-gray-400">Total Tokens</p>
                <p className="text-lg sm:text-2xl font-bold text-gray-900 dark:text-white">{fmt(summary.total_tokens)}</p>
                <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">P: {fmt(summary.prompt_tokens)} / C: {fmt(summary.completion_tokens)}</p>
              </div>
              <div className={`${card} sm:col-span-2`}>
                <p className="text-xs sm:text-sm text-gray-500 dark:text-gray-400">
                  Today's Requests
                  {summary.daily_quota ? ` / ${fmt(summary.daily_quota)} quota` : ''}
                </p>
                <p className="text-lg sm:text-2xl font-bold text-gray-900 dark:text-white">{fmt(summary.today_requests)}</p>
                {quotaPercent !== null && (
                  <div className="mt-2">
                    <div className="w-full bg-gray-100 dark:bg-slate-700 rounded-full h-2">
                      <div
                        className={`h-2 rounded-full transition-all ${quotaPercent > 90 ? 'bg-red-500' : quotaPercent > 70 ? 'bg-yellow-500' : 'bg-emerald-500'}`}
                        style={{ width: `${quotaPercent}%` }}
                      />
                    </div>
                    <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">{quotaPercent.toFixed(0)}% used</p>
                  </div>
                )}
              </div>
            </div>
          )}

          <div className="grid grid-cols-1 gap-4 sm:gap-6">
            <CC title="Requests / hour">
              <Line options={{ ...chartOpts, plugins: { ...chartOpts.plugins, legend: { display: false } } }} data={makeData('Requests', stats.requests, chartTheme.requests)} />
            </CC>
            <CC title="429 / hour">
              <Line options={{ ...chartOpts, plugins: { ...chartOpts.plugins, legend: { display: false } } }} data={makeData('429s', stats.count_429, chartTheme.c429)} />
            </CC>
            <CC title="Cost / hour ($)">
              <Line options={{ ...chartOpts, plugins: { ...chartOpts.plugins, legend: { display: false } } }} data={makeData('Cost', stats.costs, chartTheme.cost)} />
            </CC>
            <CC title="Latency / hour (s)">
              <Line
                options={chartOpts}
                data={{
                  labels: stats.labels,
                  datasets: [
                    { label: 'p50', data: stats.latency_p50, borderColor: chartTheme.p50, backgroundColor: `${chartTheme.p50}20`, tension: 0.3, fill: true },
                    { label: 'p95', data: stats.latency_p95, borderColor: chartTheme.p95, backgroundColor: `${chartTheme.p95}20`, tension: 0.3, fill: true },
                  ],
                }}
              />
            </CC>
            <CC title="Tokens / hour">
              <Line
                options={chartOpts}
                data={{
                  labels: stats.labels,
                  datasets: [
                    { label: 'Prompt', data: stats.prompt_tokens, borderColor: chartTheme.prompt, backgroundColor: `${chartTheme.prompt}20`, tension: 0.3, fill: true },
                    { label: 'Completion', data: stats.completion_tokens, borderColor: chartTheme.completion, backgroundColor: `${chartTheme.completion}20`, tension: 0.3, fill: true },
                  ],
                }}
              />
            </CC>
          </div>

          {/* Recent Requests as cards - removed table to fix chart bleed */}
          {recentRequests && recentRequests.length > 0 && (
            <div className="mt-4 sm:mt-6">
              <h3 className="text-xs sm:text-sm text-gray-500 dark:text-gray-400 mb-2">Recent Requests ({recentRequests.length} in {range})</h3>
              <div className="flex gap-1 mb-3 flex-wrap">
                {(() => {
                  const counts = { all: recentRequests.length, '2xx': 0, '4xx': 0, '5xx': 0 }
                  recentRequests.forEach((r) => {
                    if (r.status >= 200 && r.status < 300) counts['2xx']++
                    else if (r.status >= 400 && r.status < 500) counts['4xx']++
                    else if (r.status >= 500) counts['5xx']++
                  })
                  return Object.entries(counts).map(([code, count]) => (
                    <button
                      key={code}
                      onClick={() => setFilterStatus(code)}
                      className={`px-2 py-1 rounded text-xs font-medium transition ${
                        filterStatus === code
                          ? 'bg-indigo-600 text-gray-900 dark:text-white'
                          : code === 'all'
                            ? 'bg-gray-100 dark:bg-slate-700 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-slate-600'
                            : 'bg-gray-50 dark:bg-slate-800 text-gray-500 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-slate-600 border border-gray-300 dark:border-slate-600'
                      }`}
                    >
                      {code.toUpperCase()} {count}
                    </button>
                  ))
                })()}
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
                {recentRequests
                  .filter((r) => {
                    if (filterStatus === 'all') return true
                    if (filterStatus === '2xx') return r.status >= 200 && r.status < 300
                    if (filterStatus === '4xx') return r.status >= 400 && r.status < 500
                    if (filterStatus === '5xx') return r.status >= 500
                    return true
                  })
                  .slice(0, 50)
                  .map((r) => <RequestCard key={r.id} r={r} />)}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
