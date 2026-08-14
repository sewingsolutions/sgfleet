/* eslint-disable react-hooks/set-state-in-effect */
import { createContext, useContext, useState, useEffect, type ReactNode } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import { api } from '../api/client'

interface AuthContextType {
  authenticated: boolean
  loading: boolean
  setupComplete: boolean
  login: (key: string) => Promise<boolean>
  logout: () => Promise<void>
}

const AuthContext = createContext<AuthContextType | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [authenticated, setAuthenticated] = useState(false)
  const [loading, setLoading] = useState(true)
  const [setupComplete, setSetupComplete] = useState(true)
  const navigate = useNavigate()
  const location = useLocation()

  useEffect(() => {
    // Always refresh setup status so a stale `setupComplete=false` from a prior
    // route (e.g. before the wizard was completed) can't bounce the user back
    // to /setup after they log in. This closes a timing bug where finishing
    // the wizard then logging in would redirect straight back to /setup.
    if (location.pathname === '/login' || location.pathname === '/setup') {
      setAuthenticated(false)
      api.getSetupStatus()
        .then((res) => setSetupComplete(res.setup_complete))
        .catch(() => { /* leave prior value */ })
        .finally(() => setLoading(false))
      return
    }
    api.getSetupStatus()
      .then((res) => {
        setSetupComplete(res.setup_complete)
        if (!res.setup_complete) {
          setAuthenticated(false)
          setLoading(false)
          return
        }
        api.checkAuth().then(() => {
          setAuthenticated(true)
          setLoading(false)
        }).catch(() => {
          setAuthenticated(false)
          setLoading(false)
        })
      })
      .catch(() => {
        setSetupComplete(false)
        setAuthenticated(false)
        setLoading(false)
      })
  }, [location.pathname])

  const login = async (key: string): Promise<boolean> => {
    const res = await api.login(key)
    // fetch follows 302 automatically; check final URL
    if (res.url.includes('/admin/') && !res.url.includes('/admin/login')) {
      // Login only succeeds when setup is complete on the backend, so make
      // sure the client-side flag reflects that before we navigate — otherwise
      // ProtectedRoute may see stale `setupComplete=false` and redirect the
      // user back to /setup.
      setSetupComplete(true)
      setAuthenticated(true)
      navigate('/users', { replace: true })
      return true
    }
    return false
  }

  const logout = async () => {
    await api.logout()
    setAuthenticated(false)
    navigate('/login', { replace: true })
  }

  return (
    <AuthContext.Provider value={{ authenticated, loading, setupComplete, login, logout }}>
      {children}
    </AuthContext.Provider>
  )
}

// eslint-disable-next-line react-refresh/only-export-components
export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be inside AuthProvider')
  return ctx
}
