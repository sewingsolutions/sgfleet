/* eslint-disable react-hooks/set-state-in-effect */
import { createContext, useContext, useState, useEffect, type ReactNode } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import { api } from '../api/client'

type Role = 'admin' | 'user' | null

interface AuthContextType {
  authenticated: boolean
  loading: boolean
  setupComplete: boolean
  role: Role
  name: string
  login: (key: string) => Promise<boolean>
  logout: () => Promise<void>
}

const AuthContext = createContext<AuthContextType | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [authenticated, setAuthenticated] = useState(false)
  const [loading, setLoading] = useState(true)
  const [setupComplete, setSetupComplete] = useState(true)
  const [role, setRole] = useState<Role>(null)
  const [name, setName] = useState('')
  const navigate = useNavigate()
  const location = useLocation()

  useEffect(() => {
    if (location.pathname === '/login' || location.pathname === '/setup') {
      setAuthenticated(false)
      setRole(null)
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
          setRole(null)
          setLoading(false)
          return
        }
        api.checkSession().then((session) => {
          if (session.error) {
            setAuthenticated(false)
            setRole(null)
          } else {
            setAuthenticated(true)
            setRole(session.role ?? null)
            setName(session.name ?? '')
          }
          setLoading(false)
        }).catch(() => {
          setAuthenticated(false)
          setRole(null)
          setLoading(false)
        })
      })
      .catch(() => {
        setSetupComplete(false)
        setAuthenticated(false)
        setRole(null)
        setLoading(false)
      })
  }, [location.pathname])

  const login = async (key: string): Promise<boolean> => {
    const res = await api.login(key)
    if (res.url.includes('/admin/') && !res.url.includes('/login')) {
      setSetupComplete(true)
      setAuthenticated(true)
      setRole('admin')
      navigate('/admin/', { replace: true })
      return true
    }
    if (res.url.includes('/user/') && !res.url.includes('/login')) {
      setSetupComplete(true)
      setAuthenticated(true)
      setRole('user')
      navigate('/user/', { replace: true })
      return true
    }
    return false
  }

  const logout = async () => {
    await api.logout()
    setAuthenticated(false)
    setRole(null)
    setName('')
    navigate('/login', { replace: true })
  }

  return (
    <AuthContext.Provider value={{ authenticated, loading, setupComplete, role, name, login, logout }}>
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
