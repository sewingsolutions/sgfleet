import { useState } from 'react'
import { api } from '../api/client'
import { useToast } from '../hooks/useToast'

interface ConfigModalProps {
  userId: number
  userName: string
  onClose: () => void
}

export default function ConfigModal({ userId, userName, onClose }: ConfigModalProps) {
  const showToast = useToast()
  const [configJson, setConfigJson] = useState('')
  const [apiKey, setApiKey] = useState('')
  const [rotated, setRotated] = useState(false)
  const [rotateKey, setRotateKey] = useState(false)
  const [generating, setGenerating] = useState(false)

  const handleGenerate = async () => {
    setGenerating(true)
    setConfigJson('')
    setApiKey('')
    try {
      const result = await api.generateConfig(userId, rotateKey)
      setConfigJson(result.config_json)
      setApiKey(result.api_key)
      setRotated(result.rotated || false)
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to generate config')
    } finally {
      setGenerating(false)
    }
  }

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(configJson)
      showToast('Copied!')
    } catch {
      const ta = document.createElement('textarea')
      ta.value = configJson
      ta.style.position = 'fixed'
      ta.style.opacity = '0'
      document.body.appendChild(ta)
      ta.select()
      document.execCommand('copy')
      document.body.removeChild(ta)
      showToast('Copied!')
    }
  }

  const handleDownload = () => {
    const blob = new Blob([configJson], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = 'opencode.json'
    a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60" onClick={onClose}>
      <div className="bg-gray-50 dark:bg-slate-800 rounded-xl border border-gray-200 dark:border-slate-700 w-full max-w-2xl mx-4 p-4 sm:p-6" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-bold text-gray-900 dark:text-white">Generate opencode.json for <span className="text-indigo-600 dark:text-indigo-400">{userName}</span></h2>
          <button onClick={onClose} className="text-gray-500 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white text-xl transition">&times;</button>
        </div>

        <label className="flex items-center gap-2 mb-4 cursor-pointer">
          <input
            type="checkbox"
            checked={rotateKey}
            onChange={(e) => setRotateKey(e.target.checked)}
            className="w-4 h-4 rounded bg-white dark:bg-slate-900 border-gray-300 dark:border-slate-600 text-indigo-600 focus:border-indigo-500"
          />
          <span className="text-sm text-gray-700 dark:text-gray-300">
            Rotate API key (generates a new key)
          </span>
        </label>

        <button
          onClick={handleGenerate}
          disabled={generating}
          className="w-full px-4 py-2 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed rounded text-gray-900 dark:text-white font-medium transition"
        >
          {generating ? 'Generating...' : 'Generate Config'}
        </button>

        {apiKey && (
          <div className="mt-4 bg-gray-100 dark:bg-slate-900 border border-yellow-500/30 rounded p-3">
            <p className="text-sm text-yellow-600 dark:text-yellow-300 mb-1">
              {rotated ? 'Rotated API Key (save this — it won\'t be shown again):' : 'Current API Key:'}
            </p>
            <div className="flex gap-2 items-center">
              <code className="flex-1 text-sm text-indigo-600 dark:text-indigo-300 font-mono break-all">{apiKey}</code>
                <button
                    onClick={async () => {
                      try {
                        await navigator.clipboard.writeText(apiKey)
                        showToast('Key copied!')
                      } catch {
                        const ta = document.createElement('textarea')
                        ta.value = apiKey
                        ta.style.position = 'fixed'
                        ta.style.opacity = '0'
                        document.body.appendChild(ta)
                        ta.select()
                        document.execCommand('copy')
                        document.body.removeChild(ta)
                        showToast('Key copied!')
                      }
                    }}
                    className="px-3 py-1 bg-gray-200 dark:bg-slate-700 hover:bg-gray-300 dark:hover:bg-slate-600 rounded text-sm transition shrink-0"
                  >
                    Copy Key
                  </button>
            </div>
          </div>
        )}

        {configJson && (
          <div className="mt-4 relative">
            <div className="flex items-center justify-between mb-2">
              <p className="text-sm text-gray-500 dark:text-gray-400">opencode.json config:</p>
              <div className="flex gap-2">
                <button
                  onClick={handleDownload}
                  className="px-3 py-1 bg-gray-200 dark:bg-slate-700 hover:bg-gray-300 dark:hover:bg-slate-600 rounded text-sm transition"
                >
                  Download
                </button>
                  <button
                    onClick={handleCopy}
                    className="px-3 py-1 bg-gray-200 dark:bg-slate-700 hover:bg-gray-300 dark:hover:bg-slate-600 rounded text-sm transition"
                  >
                    Copy JSON
                  </button>
              </div>
            </div>
            <pre className="bg-gray-100 dark:bg-slate-900 border border-gray-300 dark:border-slate-600 rounded p-3 overflow-auto max-h-80 text-sm text-emerald-600 dark:text-emerald-300 font-mono whitespace-pre-wrap break-all">
              {configJson}
            </pre>
          </div>
        )}

        {configJson && (
          <p className="text-xs text-gray-400 dark:text-gray-500 mt-3">
            Replace your <code className="text-gray-500 dark:text-gray-400">~/.opencode/opencode.json</code> with the generated config.
            The API key is embedded in the config — keep it secure.
          </p>
        )}
      </div>
    </div>
  )
}
