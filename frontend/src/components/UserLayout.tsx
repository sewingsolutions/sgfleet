import { useState, useEffect, useRef } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { useTheme } from '../context/ThemeContext'
import { api } from '../api/client'

const links = [
  { to: '/user/models', label: 'Models' },
  { to: '/user/config', label: 'Config' },
  { to: '/user/metrics', label: 'Metrics' },
  { to: '/user/requests', label: 'Requests' },
  { to: '/user/quota', label: 'Quota' },
]

const themeOptions = [
  { value: 'light' as const, label: 'Light' },
  { value: 'dark' as const, label: 'Dark' },
  { value: 'system' as const, label: 'System' },
]

const ThemeIcon = ({ theme }: { theme: 'light' | 'dark' | 'system' }) => {
  if (theme === 'light') {
    return (
      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 3v1m0 16v1m9-9h-1M4 12H3m15.364-6.364l-.707.707M6.343 17.657l-.707-.707m12.728 0l-.707-.707M6.343 6.343l-.707-.707M16 12a4 4 0 11-8 0 4 4 0 018 0z" />
      </svg>
    )
  }
  if (theme === 'dark') {
    return (
      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20.354 15.354A9 9 0 018.646 3.646 9.003 9.003 0 0012 21a9.003 9.003 0 008.354-5.646z" />
      </svg>
    )
  }
  return (
    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
    </svg>
  )
}

export default function UserLayout({ children }: { children: React.ReactNode }) {
  const { pathname } = useLocation()
  const { logout, name } = useAuth()
  const { theme, setTheme } = useTheme()
  const [themeDropdownOpen, setThemeDropdownOpen] = useState(false)
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)
  const [versionHash, setVersionHash] = useState<string>('')
  const themeDropdownRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    ; (async () => {
      try {
        const res = await api.getGitLog()
        if (res?.head) setVersionHash(res.head)
      } catch { /* ignore */ }
    })()
  }, [])

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
            <Link to="/user/" className="text-lg sm:text-xl font-bold text-indigo-600 dark:text-indigo-400 hover:text-indigo-700 dark:hover:text-indigo-300 transition">SGFleet</Link>
            <span className="text-sm text-gray-500 dark:text-gray-400 hidden sm:inline">/ {name}</span>
          </div>

          {/* Desktop nav */}
          <div className="hidden md:flex items-center gap-6">
            {links.map(({ to, label }) => {
              const isActive = to === '/user/' ? pathname === '/user/' : pathname.startsWith(to)
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

          <button
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            className="md:hidden text-gray-500 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white p-1"
          >
            {mobileMenuOpen ? (
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            ) : (
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
              </svg>
            )}
          </button>
        </div>

        {mobileMenuOpen && (
          <div className="md:hidden mt-4 pb-2 border-t border-gray-200 dark:border-slate-700 pt-4 space-y-1">
            {links.map(({ to, label }) => {
              const isActive = to === '/user/' ? pathname === '/user/' : pathname.startsWith(to)
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
          <span className="text-xs text-gray-400 dark:text-gray-600 font-mono">
            {versionHash ? `${versionHash.slice(0, 7)}` : ''}
          </span>
        </div>
      </footer>
    </div>
  )
}
