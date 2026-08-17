import { useState, useEffect, useRef } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { Sun, Moon, Monitor, X, Menu } from 'lucide-react'
import { useAuth } from '../context/AuthContext'
import { useTheme } from '../context/ThemeContext'
import { api } from '../api/client'
import { useGitLog } from '../hooks/useGitLog'
import { useQuery, useQueries } from '@tanstack/react-query'
import type { ModelHealth } from '../api/types'

const links = [
  { to: '/admin/', label: 'Dashboard' },
  { to: '/admin/users', label: 'Users' },
  { to: '/admin/metrics', label: 'Metrics' },
  { to: '/admin/models', label: 'Models' },

  { to: '/admin/logs', label: 'Logs' },
  { to: '/admin/audit', label: 'Audit' },
  { to: '/admin/settings', label: 'Settings' },
]

const themeOptions = [
  { value: 'light' as const, label: 'Light' },
  { value: 'dark' as const, label: 'Dark' },
  { value: 'system' as const, label: 'System' },
]

const ThemeIcon = ({ theme }: { theme: 'light' | 'dark' | 'system' }) => {
  if (theme === 'light') {
    return <Sun className="w-5 h-5" />
  }
  if (theme === 'dark') {
    return <Moon className="w-5 h-5" />
  }
  return <Monitor className="w-5 h-5" />
}

const ModelStatusDot = ({ status }: { status: string | undefined }) => {
  let color = 'bg-red-500'
  if (status === 'running' || status === 'healthy') color = 'bg-emerald-500'
  else if (status === 'starting' || status === 'loading') color = 'bg-amber-500'
  return <span className={`inline-block w-2 h-2 rounded-full ${color}`} />
}

const useActiveModels = () => {
  const { data: allModels = [] } = useQuery({
    queryKey: ['layout-models'],
    queryFn: api.listModels,
    refetchInterval: 10000,
    refetchOnWindowFocus: true,
  })

  const models = allModels.filter((m) => m.active)
  const modelIds = models.map((m) => m.model_id)

  const healthResults = useQueries({
    queries: modelIds.map((id) => ({
      queryKey: ['layout-model-health', id],
      queryFn: () => api.getModelHealth(id),
      refetchInterval: 10000,
      refetchOnWindowFocus: true,
      retry: false,
    })),
  })

  const healthMap: Record<string, ModelHealth> = {}
  healthResults.forEach((result, index) => {
    if (result.data) {
      healthMap[modelIds[index]] = result.data
    }
  })

  return { models, healthMap }
}

export default function Layout({ children }: { children: React.ReactNode }) {
  const { pathname } = useLocation()
  const { logout } = useAuth()
  const { theme, setTheme } = useTheme()
  const [dropdownOpen, setDropdownOpen] = useState(false)
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)
  const [themeDropdownOpen, setThemeDropdownOpen] = useState(false)
  const [testingModelId, setTestingModelId] = useState<string | null>(null)
  const [testResult, setTestResult] = useState<{ success: boolean; content?: string; error?: string; model?: string } | null>(null)
  const themeDropdownRef = useRef<HTMLDivElement>(null)
  const { models, healthMap } = useActiveModels()
  const { data: gitLog } = useGitLog()
  const versionHash = gitLog?.head || ''

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (themeDropdownRef.current && !themeDropdownRef.current.contains(e.target as Node)) {
        setThemeDropdownOpen(false)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  return (
    <div className="min-h-screen bg-white dark:bg-slate-900 text-gray-900 dark:text-gray-100 flex flex-col">
      <nav className="bg-gray-50 dark:bg-slate-800 border-b border-gray-200 dark:border-slate-700 px-4 sm:px-6 py-4">
        <div className="max-w-[1600px] mx-auto flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Link to="/" className="text-lg sm:text-xl font-bold text-indigo-600 dark:text-indigo-400 hover:text-indigo-700 dark:hover:text-indigo-300 transition">SGFleet</Link>
            <div className="relative hidden sm:block">
              <button
                onClick={() => setDropdownOpen(!dropdownOpen)}
                className="flex items-center gap-1.5 text-sm text-gray-500 dark:text-gray-400 hover:text-indigo-600 dark:hover:text-indigo-400 transition"
              >
                {models.length > 0 ? (
                  <>
                    <span className="flex items-center gap-0.5">
                      {models.length === 1 ? (
                        <>
                          <ModelStatusDot status={healthMap[models[0].model_id]?.status} />
                          <span className="font-medium">{models[0].name}</span>
                        </>
                      ) : (
                        <>
                          {models.slice(0, 2).map((m) => (
                            <span key={m.model_id} className="flex items-center gap-0.5">
                              <ModelStatusDot status={healthMap[m.model_id]?.status} />
                              <span className="font-medium">{m.name}</span>
                            </span>
                          ))}
                          {models.length > 2 && (
                            <span className="text-xs text-gray-400">+{models.length - 2} more</span>
                          )}
                        </>
                      )}
                    </span>
                  </>
                ) : (
                  <span className="text-gray-400 dark:text-gray-500">No model active</span>
                )}
                <span className="text-xs text-gray-400 dark:text-gray-600">&#9662;</span>
              </button>
              {dropdownOpen && (
                <div className="absolute left-0 top-full mt-2 w-72 bg-white dark:bg-slate-900 border border-gray-200 dark:border-slate-700 rounded-lg shadow-xl p-4 z-50">
                  {models.length > 0 ? (
                    <div className="space-y-3">
                      {models.map((m) => {
                        const h = healthMap[m.model_id]
                        const isTesting = testingModelId === m.model_id
                        return (
                          <div key={m.model_id}>
                            <div className="flex items-center gap-1.5 mb-1">
                              <ModelStatusDot status={h?.status} />
                              <p className="text-sm font-medium text-gray-900 dark:text-white">{m.name}</p>
                              {h && (
                                <span className={`text-xs font-mono ml-auto ${
                                  h.status === 'healthy' ? 'text-emerald-600 dark:text-emerald-400' :
                                  h.status === 'loading' ? 'text-amber-600 dark:text-amber-400' :
                                  'text-red-600 dark:text-red-400'
                                }`}>
                                  {h.http_latency_ms}ms {h.status}
                                </span>
                              )}
                              <button
                                onClick={async () => {
                                  setTestingModelId(m.model_id)
                                  setTestResult(null)
                                  const r = await api.testModel(m.model_id)
                                  setTestResult(r)
                                  setTestingModelId(null)
                                }}
                                disabled={isTesting}
                                className="px-1.5 py-0.5 text-xs rounded bg-gray-100 dark:bg-slate-700 hover:bg-gray-200 dark:hover:bg-slate-600 text-gray-600 dark:text-gray-300 transition disabled:opacity-50 ml-1"
                              >
                                {isTesting ? '...' : 'Test'}
                              </button>
                            </div>
                            <dl className="space-y-1 text-xs ml-3">
                              <div className="flex justify-between">
                                <dt className="text-gray-500 dark:text-gray-400">Path</dt>
                                <dd className="text-gray-700 dark:text-gray-300 font-mono truncate ml-4">{m.model_path}</dd>
                              </div>
                              <div className="flex justify-between">
                                <dt className="text-gray-500 dark:text-gray-400">Context</dt>
                                <dd className="text-gray-700 dark:text-gray-300">{m.context_length.toLocaleString()}</dd>
                              </div>
                              <div className="flex justify-between">
                                <dt className="text-gray-500 dark:text-gray-400">Max Output</dt>
                                <dd className="text-gray-700 dark:text-gray-300">{m.max_output_length.toLocaleString()}</dd>
                              </div>
                            </dl>
                            {testResult && testResult.model === m.model_alias && (
                              <div className="relative">
                                <button
                                  onClick={() => setTestResult(null)}
                                  className="absolute top-1 right-1 p-0.5 rounded text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-300 transition z-10"
                                >
                                  <X className="w-3.5 h-3.5" />
                                </button>
                                <div className={`mt-2 p-2 pr-6 rounded text-xs font-mono whitespace-pre-wrap max-h-32 overflow-y-auto ${testResult.success ? 'bg-emerald-50 dark:bg-emerald-900/20 text-emerald-800 dark:text-emerald-300' : 'bg-red-50 dark:bg-red-900/20 text-red-800 dark:text-red-300'}`}>
                                  {testResult.success ? testResult.content : testResult.error}
                                </div>
                              </div>
                            )}
                          </div>
                        )
                      })}
                    </div>
                  ) : (
                    <p className="text-sm text-gray-500 dark:text-gray-400">No active models</p>
                  )}
                </div>
              )}
            </div>
          </div>

          {/* Desktop nav */}
          <div className="hidden md:flex items-center gap-6">
            {links.map(({ to, label }) => {
              const isActive = to === '/admin/' ? pathname === '/admin/' : pathname.startsWith(to)
              return (
                <Link
                  key={to}
                  to={to}
                  className={`transition ${isActive ? 'text-indigo-600 dark:text-indigo-400 font-medium' : 'text-gray-500 dark:text-gray-400 hover:text-indigo-600 dark:hover:text-indigo-400'}`}
                >
                  {label}
                </Link>
              )
            })}

            {/* Theme switch */}
            <div className="relative" ref={themeDropdownRef}>
              <button
                onClick={() => setThemeDropdownOpen(!themeDropdownOpen)}
                className="p-1.5 text-gray-500 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white transition rounded"
                title={`Theme: ${theme}`}
              >
                <ThemeIcon theme={theme} />
              </button>
              {themeDropdownOpen && (
                <div className="absolute right-0 top-full mt-2 w-36 bg-white dark:bg-slate-900 border border-gray-200 dark:border-slate-700 rounded-lg shadow-xl overflow-hidden z-50">
                  {themeOptions.map((opt) => (
                    <button
                      key={opt.value}
                      onClick={() => { setTheme(opt.value); setThemeDropdownOpen(false) }}
                      className={`w-full text-left px-3 py-2 text-sm flex items-center gap-2 transition ${theme === opt.value ? 'bg-gray-100 dark:bg-slate-700 text-gray-900 dark:text-white font-medium' : 'text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-slate-800'}`}
                    >
                      <ThemeIcon theme={opt.value} />
                      {opt.label}
                    </button>
                  ))}
                </div>
              )}
            </div>

            <button onClick={logout} className="text-red-600 dark:text-red-300 hover:text-red-700 dark:hover:text-red-400 text-sm transition">
              Logout
            </button>
          </div>

          {/* Hamburger button */}
          <button
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            className="md:hidden text-gray-500 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white p-1"
          >
            {mobileMenuOpen ? (
              <X className="w-6 h-6" />
            ) : (
              <Menu className="w-6 h-6" />
            )}
          </button>
        </div>

        {/* Mobile menu */}
        {mobileMenuOpen && (
          <div className="md:hidden mt-4 pb-2 border-t border-gray-200 dark:border-slate-700 pt-4 space-y-1">
            {models.length > 0 && (
              <div className="px-2 py-2 mb-2 bg-white dark:bg-slate-900 rounded space-y-1.5">
                {models.map((m) => {
                  const h = healthMap[m.model_id]
                  return (
                    <div key={m.model_id}>
                      <div className="flex items-center gap-1.5">
                        <ModelStatusDot status={h?.status} />
                        <p className="text-sm font-medium text-gray-900 dark:text-white">{m.name}</p>
                      </div>
                      <p className="text-xs text-gray-500 dark:text-gray-400 ml-3">Context: {m.context_length.toLocaleString()}</p>
                      <p className="text-xs text-gray-500 dark:text-gray-400 ml-3">Max Output: {m.max_output_length.toLocaleString()}</p>
                    </div>
                  )
                })}
              </div>
            )}
            {links.map(({ to, label }) => {
              const isActive = to === '/admin/' ? pathname === '/admin/' : pathname.startsWith(to)
              return (
                <Link
                  key={to}
                  to={to}
                  onClick={() => setMobileMenuOpen(false)}
                  className={`block px-2 py-2 rounded transition ${isActive ? 'bg-gray-100 dark:bg-slate-700 text-indigo-600 dark:text-indigo-400 font-medium' : 'text-gray-500 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white hover:bg-gray-100 dark:hover:bg-slate-700'}`}
                >
                  {label}
                </Link>
              )
            })}

            {/* Mobile theme switch */}
            <div className="px-2 py-1">
              <p className="text-xs text-gray-400 dark:text-gray-500 mb-1">Theme</p>
              <div className="flex gap-1">
                {themeOptions.map((opt) => (
                  <button
                    key={opt.value}
                    onClick={() => setTheme(opt.value)}
                    className={`flex-1 flex items-center justify-center gap-1.5 px-2 py-2 rounded text-xs transition ${theme === opt.value ? 'bg-gray-100 dark:bg-slate-700 text-gray-900 dark:text-white font-medium' : 'text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-slate-700'}`}
                  >
                    <ThemeIcon theme={opt.value} />
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>

            <button
              onClick={() => { logout(); setMobileMenuOpen(false) }}
              className="block w-full text-left px-2 py-2 text-red-600 dark:text-red-300 hover:text-red-700 dark:hover:text-red-400 hover:bg-gray-100 dark:hover:bg-slate-700 rounded transition text-sm"
            >
              Logout
            </button>
          </div>
        )}
      </nav>
      <main className="max-w-[1600px] mx-auto px-4 sm:px-6 py-6 sm:py-8 flex-1 w-full">{children}</main>
      <footer className="border-t border-gray-200 dark:border-slate-800 py-3 px-4 sm:px-6">
        <div className="max-w-[1600px] mx-auto flex justify-center">
          <Link to="/admin/version" className="text-xs text-gray-400 dark:text-gray-600 hover:text-indigo-600 dark:hover:text-indigo-400 transition font-mono">
            {versionHash ? `build ${versionHash.slice(0, 7)}` : 'version'}
          </Link>
        </div>
      </footer>
    </div>
  )
}
