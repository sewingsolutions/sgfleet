import { useLogs, useLogLevel, useSetLogLevelMutation } from '../hooks/useLogs'

const levelColors = {
  DEBUG: 'bg-gray-200 dark:bg-slate-700 text-gray-600 dark:text-gray-300',
  INFO: 'bg-blue-100 dark:bg-blue-900/50 text-blue-700 dark:text-blue-300',
  WARNING: 'bg-amber-100 dark:bg-amber-900/50 text-amber-700 dark:text-amber-300',
  ERROR: 'bg-red-100 dark:bg-red-900/50 text-red-700 dark:text-red-300',
}

const card = 'bg-gray-50 dark:bg-slate-800 rounded-lg p-3 sm:p-4 border border-gray-200 dark:border-slate-700'

export default function LogsPage() {
  const { logs, isLoading, filters, setLevel, setUser, setPath, setKeyword, autoRefresh, setAutoRefresh, clearFilters } = useLogs(200)
  const { level: currentLevel } = useLogLevel()
  const { setLevel: setLogLevel, pending: savingLevel } = useSetLogLevelMutation()

  return (
    <div>
      <div className={card + ' mb-3 sm:mb-6'}>
        <h3 className="text-base sm:text-lg text-gray-900 dark:text-white mb-2">Log Level</h3>
        <p className="text-xs sm:text-sm text-gray-500 dark:text-gray-400 mb-3">
          Controls both stdout output and DB persistence. Current: <code className="text-indigo-600 dark:text-indigo-400">{currentLevel}</code>
        </p>
        <div className="flex flex-wrap gap-2 items-center">
          {['DEBUG', 'INFO', 'WARNING', 'ERROR'].map((lvl) => (
            <button
              key={lvl}
              onClick={() => setLogLevel(lvl)}
              disabled={savingLevel || lvl === currentLevel}
              className={`px-3 py-1.5 rounded text-sm font-medium transition ${
                lvl === currentLevel
                  ? 'bg-emerald-600 dark:bg-emerald-700 text-gray-900 dark:text-white cursor-default'
                  : 'bg-indigo-600 hover:bg-indigo-700 dark:bg-indigo-700 dark:hover:bg-indigo-600 text-gray-900 dark:text-white'
              } disabled:opacity-50`}
            >
              {lvl}
            </button>
          ))}
          {savingLevel && <span className="text-xs text-gray-400 animate-pulse">Saving...</span>}
        </div>
      </div>

      <div className={card + ' mb-3 sm:mb-6'}>
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-base sm:text-lg text-gray-900 dark:text-white">Log Viewer</h3>
          <div className="flex items-center gap-2">
            <label className="flex items-center gap-1.5 text-xs text-gray-500 dark:text-gray-400 cursor-pointer">
              <input
                type="checkbox"
                checked={autoRefresh}
                onChange={(e) => setAutoRefresh(e.target.checked)}
                className="rounded border-gray-300 dark:border-slate-600"
              />
              Auto-refresh
            </label>
            <button onClick={clearFilters} className="text-xs text-indigo-600 dark:text-indigo-400 hover:underline">
              Clear
            </button>
          </div>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-2">
          <select
            value={filters.level}
            onChange={(e) => setLevel(e.target.value)}
            className="px-2 py-1.5 bg-gray-100 dark:bg-slate-900 border border-gray-300 dark:border-slate-600 rounded text-xs sm:text-sm text-gray-900 dark:text-white"
          >
            <option value="">All Levels</option>
            <option value="DEBUG">DEBUG</option>
            <option value="INFO">INFO</option>
            <option value="WARNING">WARNING</option>
            <option value="ERROR">ERROR</option>
          </select>
          <input
            placeholder="User..."
            value={filters.user}
            onChange={(e) => setUser(e.target.value)}
            className="px-2 py-1.5 bg-gray-100 dark:bg-slate-900 border border-gray-300 dark:border-slate-600 rounded text-xs sm:text-sm text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-slate-500"
          />
          <input
            placeholder="Path..."
            value={filters.path}
            onChange={(e) => setPath(e.target.value)}
            className="px-2 py-1.5 bg-gray-100 dark:bg-slate-900 border border-gray-300 dark:border-slate-600 rounded text-xs sm:text-sm text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-slate-500"
          />
          <input
            placeholder="Keyword..."
            value={filters.keyword}
            onChange={(e) => setKeyword(e.target.value)}
            className="px-2 py-1.5 bg-gray-100 dark:bg-slate-900 border border-gray-300 dark:border-slate-600 rounded text-xs sm:text-sm text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-slate-500"
          />
          <div className="text-xs text-gray-400 dark:text-gray-500 flex items-center">
            {logs.length} entries
          </div>
        </div>
      </div>

      {isLoading ? (
        <div className="py-8 text-center text-gray-500 dark:text-gray-400">Loading...</div>
      ) : (
        <div className={card + ' overflow-x-auto'}>
          <table className="w-full text-xs sm:text-sm">
            <thead className="text-gray-400 dark:text-gray-500 sticky top-0 bg-gray-50 dark:bg-slate-800">
              <tr>
                <th className="px-2 py-2 text-left">Time</th>
                <th className="px-2 py-2 text-left">Level</th>
                <th className="px-2 py-2 text-left">Method</th>
                <th className="px-2 py-2 text-left">Path</th>
                <th className="px-2 py-2 text-left">Status</th>
                <th className="px-2 py-2 text-left">User</th>
                <th className="px-2 py-2 text-left">Message</th>
              </tr>
            </thead>
            <tbody>
              {logs.length === 0 && (
                <tr><td colSpan={7} className="px-2 py-6 text-center text-gray-400 dark:text-gray-500">No logs found</td></tr>
              )}
              {logs.map((log, i) => (
                <tr key={log.id} className={`border-t border-gray-200 dark:border-slate-700 ${i % 2 ? 'bg-gray-100/50 dark:bg-slate-800/50' : 'bg-white dark:bg-slate-800'}`}>
                  <td className="px-2 py-1.5 font-mono text-gray-500 dark:text-gray-400 whitespace-nowrap text-xs">
                    {log.timestamp ? log.timestamp.replace('T', ' ').substring(0, 19) : ''}
                  </td>
                  <td className="px-2 py-1.5">
                    <span className={`px-2 py-0.5 rounded text-xs font-medium ${levelColors[log.level as keyof typeof levelColors] || 'bg-gray-100 dark:bg-slate-700 text-gray-500'}`}>
                      {log.level}
                    </span>
                  </td>
                  <td className="px-2 py-1.5 text-gray-600 dark:text-gray-300 whitespace-nowrap">
                    {log.method || ''}
                  </td>
                  <td className="px-2 py-1.5 text-gray-600 dark:text-gray-300 whitespace-nowrap font-mono text-xs">
                    {log.path || ''}
                  </td>
                  <td className="px-2 py-1.5 whitespace-nowrap">
                    {log.status != null && (
                      <span className={log.status >= 400 ? 'text-red-600 dark:text-red-400' : 'text-emerald-600 dark:text-emerald-400'}>
                        {log.status}
                      </span>
                    )}
                  </td>
                  <td className="px-2 py-1.5 text-gray-600 dark:text-gray-300 whitespace-nowrap">
                    {log.user || '-'}
                  </td>
                  <td className="px-2 py-1.5 text-gray-700 dark:text-gray-300 max-w-xs truncate" title={log.error || log.message || ''}>
                    {log.error || log.message || ''}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
