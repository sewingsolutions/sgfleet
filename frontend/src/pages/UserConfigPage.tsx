import { useState } from 'react'
import UserLayout from '../components/UserLayout'
import { api } from '../api/client'

export default function UserConfigPage() {
  const [loading, setLoading] = useState(true)
  const [config, setConfig] = useState<{ key: string; json: string } | null>(null)
  const [error, setError] = useState('')
  const [copied, setCopied] = useState(false)

  const generate = async () => {
    setLoading(true)
    setError('')
    try {
      const res = await api.user.generateConfig('opencode')
      if (res.error) {
        setError(res.error)
      } else {
        setConfig({ key: res.api_key, json: res.config_json })
        setCopied(false)
      }
    } catch (e: unknown) {
      setError(typeof e === 'string' ? e : (e as Error)?.message || 'Failed to generate config')
    } finally {
      setLoading(false)
    }
  }

  return (
    <UserLayout>
      <h1 className="text-2xl font-bold mb-6">Config Generator</h1>

      <div className="bg-white dark:bg-slate-800 rounded-lg border border-gray-200 dark:border-slate-700 p-6">
        <p className="text-gray-600 dark:text-gray-400 mb-4">
          Generate an <code className="font-mono text-sm">.opencode.json</code> configuration snippet for your SGFleet access.
        </p>

        <button
          onClick={generate}
          disabled={loading}
          className="px-4 py-2.5 bg-indigo-600 hover:bg-indigo-700 rounded text-white font-medium transition disabled:opacity-50 text-sm"
        >
          {loading ? 'Generating...' : 'Generate Config'}
        </button>

        {error && (
          <div className="mt-4 bg-red-50 text-red-700 dark:bg-red-900/50 dark:text-red-300 px-4 py-3 rounded text-sm">
            {error}
          </div>
        )}

        {config && (
          <div className="mt-6 space-y-4">
            <div>
              <label className="text-sm font-medium text-gray-700 dark:text-gray-300">Your API Key</label>
              <div className="mt-1 p-3 bg-gray-50 dark:bg-slate-900 rounded border border-gray-200 dark:border-slate-700 font-mono text-sm break-all">
                {config.key}
              </div>
            </div>

            <div>
              <label className="text-sm font-medium text-gray-700 dark:text-gray-300">
                .opencode.json
                <button
                  onClick={() => { navigator.clipboard.writeText(config.json); setCopied(true); setTimeout(() => setCopied(false), 2000) }}
                  className="ml-3 text-indigo-600 dark:text-indigo-400 hover:underline text-xs"
                >
                  {copied ? 'Copied!' : 'Copy'}
                </button>
              </label>
              <pre className="mt-1 p-4 bg-gray-50 dark:bg-slate-900 rounded border border-gray-200 dark:border-slate-700 text-sm overflow-auto max-h-96 font-mono">
                {config.json}
              </pre>
            </div>

            <p className="text-xs text-gray-400 dark:text-gray-500">
              Save the JSON content to <code className="font-mono">.opencode.json</code> in your project root.
            </p>
          </div>
        )}
      </div>
    </UserLayout>
  )
}
