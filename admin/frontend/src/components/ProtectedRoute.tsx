import { Navigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'

export default function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { loading, authenticated } = useAuth()

  if (loading) return <div className="min-h-screen bg-slate-900 flex items-center justify-center"><div className="text-gray-400">Loading...</div></div>
  if (!authenticated) return <Navigate to="/login" replace />
  return <>{children}</>
}
