import { useState } from 'react'
import { useAuth } from '../context/AuthContext'

export default function UserLoginPage() {
  const [key, setKey] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const { login } = useAuth()

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError('')
    try {
      const ok = await login(key)
      if (!ok) {
        setError('Invalid API token')
      }
    } catch {
      setError('Invalid API token')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-white dark:bg-slate-900">
      <div className="w-full max-w-md">
        <div className="bg-gray-50 dark:bg-slate-800 rounded-lg p-8 border border-gray-200 dark:border-slate-700">
          <h1 className="text-2xl font-bold text-indigo-600 dark:text-indigo-400 mb-2">SGFleet</h1>
          <p className="text-gray-500 dark:text-gray-400 mb-6">Enter your API token:</p>

          {error && (
            <div className="bg-red-50 text-red-700 dark:bg-red-900/50 dark:text-red-300 px-4 py-3 rounded mb-4 text-sm">{error}</div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            <input
              type="text"
              value={key}
              onChange={(e) => setKey(e.target.value)}
              className="w-full px-3 py-3 bg-white dark:bg-slate-900 border border-gray-300 dark:border-slate-600 rounded text-gray-900 dark:text-white focus:outline-none focus:border-indigo-500 text-sm font-mono"
              placeholder="sk-xxxxxxxxx..."
              autoFocus
              required
            />
            <button
              type="submit"
              disabled={loading}
              className="w-full px-4 py-3 bg-indigo-600 hover:bg-indigo-700 rounded text-gray-900 dark:text-white font-medium transition disabled:opacity-50"
            >
              {loading ? 'Signing in...' : 'Sign In'}
            </button>
          </form>

          <p className="mt-6 text-xs text-gray-400 dark:text-gray-500">
            Get your token from your SGFleet admin, or check your <code className="font-mono">.opencode.json</code> config.
          </p>
        </div>
      </div>
    </div>
  )
}
