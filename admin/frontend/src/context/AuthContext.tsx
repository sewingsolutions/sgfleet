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
    if (location.pathname === '/login' || location.pathname === '/setup') {
      setAuthenticated(false)
      setLoading(false)
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
