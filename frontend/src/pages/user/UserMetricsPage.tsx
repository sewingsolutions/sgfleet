import { useState } from 'react'
import UserLayout from '../../components/UserLayout'
import { useMyStats } from '../../hooks/useMyStats'

const Ranges = ['today', '7d', '30d'] as const
type Range = typeof Ranges[number]

export default function UserMetricsPage() {
  const [range, setRange] = useState<Range>('today')
  const { data, isLoading, isError } = useMyStats(range)

  const totalRequests = data?.requests.reduce((a, b) => a + b, 0) ?? 0
  const totalTokens = data?.total_tokens.reduce((a, b) => a + b, 0) ?? 0
  const total429 = data?.count_429.reduce((a, b) => a + b, 0) ?? 0

  const maxRequests = Math.max(...(data?.requests ?? [0]), 1)

  if (isError) {
    return (
      <UserLayout>
        <div className="flex items-center justify-between mb-6">
          <h1 className="text-2xl font-bold">Metrics</h1>
        </div>
        <p className="text-gray-500 dark:text-gray-400">Unable to load metrics.</p>
      </UserLayout>
    )
  }

  return (
    <UserLayout>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold">Metrics</h1>
        <div className="flex gap-1 bg-gray-100 dark:bg-slate-700 rounded-lg p-1">
          {Ranges.map((r) => (
            <button
              key={r}
              onClick={() => setRange(r)}
              className={`px-3 py-1.5 rounded text-sm transition ${range === r ? 'bg-white dark:bg-slate-800 text-gray-900 dark:text-white shadow-sm' : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300'}`}
            >
              {r === 'today' ? 'Today' : r === '7d' ? '7 Days' : '30 Days'}
            </button>
          ))}
        </div>
      </div>

      {isLoading ? (
        <p className="text-gray-500 dark:text-gray-400">Loading...</p>
      ) : (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
            <div className="bg-white dark:bg-slate-800 rounded-lg border border-gray-200 dark:border-slate-700 p-4">
              <p className="text-sm text-gray-500 dark:text-gray-400">Total Requests</p>
              <p className="text-2xl font-bold mt-1">{totalRequests.toLocaleString()}</p>
            </div>
            <div className="bg-white dark:bg-slate-800 rounded-lg border border-gray-200 dark:border-slate-700 p-4">
              <p className="text-sm text-gray-500 dark:text-gray-400">Total Tokens</p>
              <p className="text-2xl font-bold mt-1">{totalTokens.toLocaleString()}</p>
            </div>
            <div className="bg-white dark:bg-slate-800 rounded-lg border border-gray-200 dark:border-slate-700 p-4">
              <p className="text-sm text-gray-500 dark:text-gray-400">Rate Limited (429)</p>
              <p className="text-2xl font-bold mt-1">{total429.toLocaleString()}</p>
            </div>
          </div>

          {data && data.labels.length > 0 && (
            <div className="bg-white dark:bg-slate-800 rounded-lg border border-gray-200 dark:border-slate-700 p-6">
              <h2 className="text-lg font-semibold mb-4">Requests Over Time</h2>
              <div className="h-48 flex items-end gap-1">
                {data.labels.map((label, i) => (
                  <div key={i} className="flex-1 flex flex-col items-center group relative">
                    <div
                      className="w-full bg-indigo-500 dark:bg-indigo-400 rounded-t transition-all hover:bg-indigo-600 dark:hover:bg-indigo-300"
                      style={{ height: `${Math.max(2, (data.requests[i] / maxRequests) * 100)}%` }}
                    />
                    <div className="absolute bottom-full mb-1 left-1/2 -translate-x-1/2 bg-gray-900 dark:bg-gray-100 text-white dark:text-gray-900 text-xs px-2 py-1 rounded opacity-0 group-hover:opacity-100 pointer-events-none whitespace-nowrap z-10">
                      {label.replace(/\n/g, ' ')}: {data.requests[i]}
                    </div>
                  </div>
                ))}
              </div>
              <div className="flex justify-between mt-2 text-xs text-gray-400">
                <span>{data.labels[0]?.replace(/\n/g, ' ')}</span>
                <span>{data.labels[data.labels.length - 1]?.replace(/\n/g, ' ')}</span>
              </div>
            </div>
          )}

          <div className="mt-6 grid grid-cols-1 lg:grid-cols-2 gap-4">
            <div className="bg-white dark:bg-slate-800 rounded-lg border border-gray-200 dark:border-slate-700 p-6">
              <h2 className="text-lg font-semibold mb-3">Tokens (Prompt / Completion)</h2>
              {data && data.labels.length > 0 ? (
                <div className="h-40 flex items-end gap-1">
                  {data.labels.map((_, i) => {
                    const maxTok = Math.max(
                      ...data.prompt_tokens,
                      ...data.completion_tokens,
                      1
                    )
                    return (
                      <div key={i} className="flex-1 flex gap-px items-end">
                        <div
                          className="flex-1 bg-emerald-500 rounded-t"
                          style={{ height: `${Math.max(1, (data.prompt_tokens[i] / maxTok) * 100)}%` }}
                        />
                        <div
                          className="flex-1 bg-amber-500 rounded-t"
                          style={{ height: `${Math.max(1, (data.completion_tokens[i] / maxTok) * 100)}%` }}
                        />
                      </div>
                    )
                  })}
                </div>
              ) : (
                <p className="text-sm text-gray-400">No token data for this period.</p>
              )}
              <div className="flex gap-4 mt-2 text-xs text-gray-500 dark:text-gray-400">
                <span className="flex items-center gap-1"><span className="w-2 h-2 bg-emerald-500 rounded-sm" /> Prompt</span>
                <span className="flex items-center gap-1"><span className="w-2 h-2 bg-amber-500 rounded-sm" /> Completion</span>
              </div>
            </div>

            <div className="bg-white dark:bg-slate-800 rounded-lg border border-gray-200 dark:border-slate-700 p-6">
              <h2 className="text-lg font-semibold mb-3">Latency (p50 / p95)</h2>
              {data && data.labels.length > 0 ? (() => {
                const maxLat = Math.max(...data.latency_p95, 1)
                return (
                  <div className="h-40 flex items-end gap-1">
                    {data.labels.map((_, i) => (
                      <div key={i} className="flex-1 flex gap-px items-end">
                        <div
                          className="flex-1 bg-sky-500 rounded-t"
                          style={{ height: `${Math.max(1, (data.latency_p50[i] / maxLat) * 100)}%` }}
                        />
                        <div
                          className="flex-1 bg-rose-500 rounded-t"
                          style={{ height: `${Math.max(1, (data.latency_p95[i] / maxLat) * 100)}%` }}
                        />
                      </div>
                    ))}
                  </div>
                )
              })() : (
                <p className="text-sm text-gray-400">No latency data. (Requires in-memory metrics for this period.)</p>
              )}
              <div className="flex gap-4 mt-2 text-xs text-gray-500 dark:text-gray-400">
                <span className="flex items-center gap-1"><span className="w-2 h-2 bg-sky-500 rounded-sm" /> p50</span>
                <span className="flex items-center gap-1"><span className="w-2 h-2 bg-rose-500 rounded-sm" /> p95</span>
              </div>
            </div>
          </div>
        </>
      )}
    </UserLayout>
  )
}
