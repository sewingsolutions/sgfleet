import { Navigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'

export default function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { loading, authenticated, setupComplete, role } = useAuth()

  if (loading) return <div className="min-h-screen bg-slate-900 flex items-center justify-center"><div className="text-gray-400">Loading...</div></div>
  if (!setupComplete) return <Navigate to="/setup" replace />
  if (!authenticated) return <Navigate to="/login" replace />
  if (role !== 'admin') return <Navigate to="/user/" replace />
  return <>{children}</>
}
