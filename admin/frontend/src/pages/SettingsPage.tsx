import { useGetSettingsDefaults, useUpdateSettingsDefaultsMutation } from '../hooks/useSettingsDefaults'
import { useModelHealth, useModelHealthRefetch } from '../hooks/useModelHealth'
import { useAuth } from '../context/AuthContext'
import { useRef, useCallback, useState, useEffect } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '../api/client'
import { useToast } from '../hooks/useToast'
import type { Webhook, ModelConfig } from '../api/types'

const formatUptime = (s: number) => {
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  const sec = s % 60
  if (h > 0) return `${h}h ${m}m`
  if (m > 0) return `${m}m ${sec}s`
  return `${sec}s`
}

export default function SettingsPage() {
  const { logout } = useAuth()
  const { data: defaults } = useGetSettingsDefaults()
  const { mutateAsync: updateDefaults, isPending } = useUpdateSettingsDefaultsMutation()
  const rateLimitRef = useRef<HTMLInputElement>(null)
  const concurrentRef = useRef<HTMLInputElement>(null)
  const costRef = useRef<HTMLInputElement>(null)
  const [modelConfig, setModelConfig] = useState<ModelConfig | null>(null)
  const [importJson, setImportJson] = useState('')
  const [importLoading, setImportLoading] = useState(false)
  const [importResult, setImportResult] = useState<{ created: string[]; skipped: string[] } | null>(null)
  const [exportJson, setExportJson] = useState('')
  const [newAdminKey, setNewAdminKey] = useState('')
  const [webhooks, setWebhooks] = useState<Webhook[]>([])
  const [newWebhookName, setNewWebhookName] = useState('')
  const [newWebhookUrl, setNewWebhookUrl] = useState('')
  const [newWebhookEvents, setNewWebhookEvents] = useState<string[]>([])
  const events = ['quota_warning', 'quota_exceeded', 'key_rotated', 'user_disabled', 'rate_limited_spike']
  const { data: health, isFetching: healthFetching } = useModelHealth()
  const refetchHealth = useModelHealthRefetch()

  useEffect(() => {
    (async () => {
      try {
        const config = await api.getModelConfig()
        setModelConfig(config)
      } catch {
        /* ignore */
      }
      try {
        const hooks = await api.fetchGet('/api/webhooks')
        setWebhooks((hooks as unknown as Webhook[]) || [])
      } catch {
        /* ignore */
      }
    })()
  }, [])

  const handleSave = useCallback(async () => {
    const data: Record<string, number> = {}
    if (rateLimitRef.current && rateLimitRef.current.value) data.default_rate_limit = parseFloat(rateLimitRef.current.value)
    if (concurrentRef.current && concurrentRef.current.value) data.default_max_concurrent = parseInt(concurrentRef.current.value)
    if (costRef.current && costRef.current.value) data.default_request_cost = parseFloat(costRef.current.value)
    await updateDefaults(data)
  }, [updateDefaults])

  const handleExportUsers = async () => {
    const res = await fetch('/admin/api/users', { credentials: 'same-origin' })
    const users = await res.json()
    const blob = new Blob([JSON.stringify(users, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = 'users-export.json'
    a.click()
    URL.revokeObjectURL(url)
  }

  const handleImportUsers = async () => {
    setImportResult(null)
    setImportLoading(true)
    try {
      const parsed = JSON.parse(importJson)
      const res = await api.fetchPost('/api/settings/import_users', parsed)
      setImportResult(res as { created: string[]; skipped: string[] })
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e)
      setImportResult({ created: [], skipped: [`Error: ${msg}`] })
    } finally {
      setImportLoading(false)
    }
  }

  const handleExportDb = async () => {
    try {
      const res = await api.fetchPost('/api/settings/export_db', {})
      setExportJson(String(res.json))
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e)
      alert(`Export failed: ${msg}`)
    }
  }

  const handleRotateAdminKey = async () => {
    if (!confirm('Rotate admin key? The CURRENT key will be invalidated immediately. Make sure to copy the new key!')) return
    try {
      const res = await api.fetchPost('/api/settings/rotate_admin_key', {})
      setNewAdminKey(String(res.new_key))
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e)
      alert(`Rotation failed: ${msg}`)
    }
  }

  return (
    <div>

      <div className="bg-gray-50 dark:bg-slate-800 rounded-lg p-3 sm:p-6 border border-gray-200 dark:border-slate-700 mb-3 sm:mb-6">
        <h2 className="text-lg sm:text-2xl font-bold text-gray-900 dark:text-white mb-2">Default Settings</h2>
        <p className="text-gray-500 dark:text-gray-400 mb-3 sm:mb-4 text-xs sm:text-sm">Default values applied when creating a new user.</p>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div>
            <label className="text-sm text-gray-500 dark:text-gray-400 block mb-1">Rate Limit (req/s)</label>
            <input
              ref={rateLimitRef}
              type="number"
              min={0.5}
              max={100}
              step={0.5}
              defaultValue={String(defaults?.default_rate_limit ?? '')}
              className="w-full px-3 py-2 bg-gray-100 dark:bg-slate-900 border border-gray-300 dark:border-slate-600 rounded text-gray-900 dark:text-white focus:border-indigo-500 focus:outline-none"
            />
          </div>
          <div>
            <label className="text-sm text-gray-500 dark:text-gray-400 block mb-1">Max Concurrent</label>
            <input
              ref={concurrentRef}
              type="number"
              min={1}
              max={100}
              defaultValue={String(defaults?.default_max_concurrent ?? '')}
              className="w-full px-3 py-2 bg-gray-100 dark:bg-slate-900 border border-gray-300 dark:border-slate-600 rounded text-gray-900 dark:text-white focus:border-indigo-500 focus:outline-none"
            />
          </div>
          <div>
            <label className="text-sm text-gray-500 dark:text-gray-400 block mb-1">Cost per Request ($)</label>
            <input
              ref={costRef}
              type="number"
              min={0.0001}
              max={10}
              step={0.0001}
              defaultValue={String(defaults?.default_request_cost ?? '')}
              className="w-full px-3 py-2 bg-gray-100 dark:bg-slate-900 border border-gray-300 dark:border-slate-600 rounded text-gray-900 dark:text-white focus:border-indigo-500 focus:outline-none"
            />
          </div>
        </div>
        <button
          onClick={handleSave}
          disabled={isPending}
          className="mt-4 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 rounded text-gray-900 dark:text-white text-sm transition disabled:opacity-50"
        >
          {isPending ? 'Saving...' : 'Save Defaults'}
        </button>
      </div>

      <BaseUrlSection />

      <div className="bg-gray-50 dark:bg-slate-800 rounded-lg p-3 sm:p-6 border border-gray-200 dark:border-slate-700 mb-3 sm:mb-6">
        <h2 className="text-lg sm:text-2xl font-bold text-gray-900 dark:text-white mb-2">HuggingFace</h2>
        <p className="text-gray-500 dark:text-gray-400 mb-3 sm:mb-4 text-xs sm:text-sm">API token for downloading gated models. Get one at <a href="https://huggingface.co/settings/tokens" target="_blank" rel="noopener noreferrer" className="text-indigo-600 dark:text-indigo-400 underline">huggingface.co/settings/tokens</a></p>
        <HFTokenSection />
      </div>

      <div className="bg-gray-50 dark:bg-slate-800 rounded-lg p-3 sm:p-6 border border-gray-200 dark:border-slate-700 mb-3 sm:mb-6">
        <div className="flex items-center justify-between mb-2">
          <h2 className="text-lg sm:text-2xl font-bold text-gray-900 dark:text-white">Server Info</h2>
          <button
            onClick={refetchHealth}
            disabled={healthFetching}
            className="px-3 py-1.5 bg-gray-200 dark:bg-slate-700 hover:bg-gray-300 dark:hover:bg-slate-600 rounded text-gray-900 dark:text-white text-sm transition disabled:opacity-50"
          >
            Check now
          </button>
        </div>
        {modelConfig && (
          <div className="space-y-2 text-xs sm:text-sm">
            <div><span className="text-gray-500 dark:text-gray-400">Model:</span> <code className="ml-2 text-indigo-600 dark:text-indigo-400">{modelConfig.model_name}</code></div>
            <div><span className="text-gray-500 dark:text-gray-400">Context:</span> <code className="ml-2 text-gray-700 dark:text-gray-300">{modelConfig.context_length.toLocaleString()}</code></div>
            <div><span className="text-gray-500 dark:text-gray-400">Max Output:</span> <code className="ml-2 text-gray-700 dark:text-gray-300">{modelConfig.max_output_length.toLocaleString()}</code></div>
          </div>
        )}
        {health && (
          <div className="mt-4 pt-4 border-t border-gray-200 dark:border-slate-700 space-y-2 text-xs sm:text-sm">
            <div className="flex items-center gap-2">
              <span className={`inline-block w-2.5 h-2.5 rounded-full ${
                health.status === 'healthy' ? 'bg-emerald-500' :
                health.status === 'loading' ? 'bg-amber-500' :
                'bg-red-500'
              }`} />
              <span className={`font-medium ${
                health.status === 'healthy' ? 'text-emerald-600 dark:text-emerald-400' :
                health.status === 'loading' ? 'text-amber-600 dark:text-amber-400' :
                'text-red-600 dark:text-red-400'
              }`}>
                {health.status}
              </span>
              {health.http_latency_ms > 0 && (
                <span className="text-gray-500 dark:text-gray-400 font-mono">{health.http_latency_ms}ms</span>
              )}
              {health.error && <span className="text-red-500 dark:text-red-400 ml-2">{health.error}</span>}
            </div>
            <div><span className="text-gray-500 dark:text-gray-400">Server:</span> <span className="ml-2">{health.server_up ? <span className="text-emerald-600 dark:text-emerald-400">up</span> : <span className="text-red-600 dark:text-red-400">down</span>}</span></div>
            <div><span className="text-gray-500 dark:text-gray-400">Model:</span> <span className="ml-2">{health.model_loaded ? <span className="text-emerald-600 dark:text-emerald-400">loaded</span> : <span className="text-amber-600 dark:text-amber-400">not loaded</span>}</span></div>
            {health.container && (
              <>
                <div><span className="text-gray-500 dark:text-gray-400">Container:</span> <code className="ml-2 text-gray-700 dark:text-gray-300">{health.container.name}</code></div>
                <div><span className="text-gray-500 dark:text-gray-400">State:</span> <span className={`ml-2 ${health.container.state === 'running' ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-600 dark:text-red-400'}`}>{health.container.state}</span></div>
                <div><span className="text-gray-500 dark:text-gray-400">Restarts:</span> <span className="ml-2 text-gray-700 dark:text-gray-300">{health.container.restart_count}</span></div>
                {health.container.health_status && health.container.health_status !== 'none' && (
                  <div><span className="text-gray-500 dark:text-gray-400">Docker Health:</span> <span className={`ml-2 ${health.container.health_status === 'healthy' ? 'text-emerald-600 dark:text-emerald-400' : 'text-amber-600 dark:text-amber-400'}`}>{health.container.health_status}</span></div>
                )}
              </>
            )}
            <div><span className="text-gray-500 dark:text-gray-400">Admin uptime:</span> <span className="ml-2 text-gray-700 dark:text-gray-300">{formatUptime(health.admin.uptime_seconds)}</span></div>
            <div><span className="text-gray-500 dark:text-gray-400">Admin memory:</span> <span className="ml-2 text-gray-700 dark:text-gray-300">{health.admin.memory_mb} MB</span></div>
            <div><span className="text-gray-500 dark:text-gray-400">Last check:</span> <span className="ml-2 text-gray-400 dark:text-gray-500">{health.last_checked}</span></div>
          </div>
        )}
      </div>

      <div className="bg-gray-50 dark:bg-slate-800 rounded-lg p-3 sm:p-6 border border-gray-200 dark:border-slate-700 mb-3 sm:mb-6">
        <h2 className="text-lg sm:text-2xl font-bold text-gray-900 dark:text-white mb-2">Import Users from JSON</h2>
        <p className="text-gray-500 dark:text-gray-400 mb-3 sm:mb-4 text-xs sm:text-sm break-all">Paste JSON array of user objects: <code className="bg-gray-100 dark:bg-slate-900 px-1 rounded">{"[{\"name\": \"user1\", \"rate_limit\": 2, \"daily_quota\": 1000}]"}</code></p>
        <textarea
          value={importJson}
          onChange={(e) => setImportJson(e.target.value)}
          placeholder='[{"name": "user1", "rate_limit": 2}, {"name": "user2", "daily_quota": 500}]'
          className="w-full h-24 px-3 py-2 bg-gray-100 dark:bg-slate-900 border border-gray-300 dark:border-slate-600 rounded text-gray-900 dark:text-white font-mono text-sm focus:border-indigo-500 focus:outline-none mb-3"
        />
        <button
          onClick={handleImportUsers}
          disabled={importLoading || !importJson.trim()}
          className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 rounded text-gray-900 dark:text-white text-sm transition disabled:opacity-50"
        >
          {importLoading ? 'Importing...' : 'Import Users'}
        </button>
        {importResult && (
          <div className="mt-3 text-sm">
            {importResult.created.length > 0 && <p className="text-emerald-600 dark:text-emerald-400">Created: {importResult.created.join(', ')}</p>}
            {importResult.skipped.length > 0 && <p className="text-gray-400 dark:text-gray-500">Skipped (exists): {importResult.skipped.join(', ')}</p>}
          </div>
        )}
      </div>

      <div className="bg-gray-50 dark:bg-slate-800 rounded-lg p-3 sm:p-6 border border-gray-200 dark:border-slate-700 mb-3 sm:mb-6">
        <h2 className="text-lg sm:text-2xl font-bold text-gray-900 dark:text-white mb-2">Data</h2>
        <p className="text-gray-500 dark:text-gray-400 mb-3 sm:mb-4 text-xs sm:text-sm">Database at <code className="bg-gray-100 dark:bg-slate-900 px-1 rounded">/data/admin.db</code></p>
        <div className="flex flex-wrap gap-2 mb-4">
          <button onClick={handleExportUsers} className="px-4 py-2 bg-gray-200 dark:bg-slate-700 hover:bg-gray-300 dark:hover:bg-slate-600 rounded text-gray-900 dark:text-white text-sm transition">
            Export Users as JSON
          </button>
          <button onClick={handleExportDb} className="px-4 py-2 bg-gray-200 dark:bg-slate-700 hover:bg-gray-300 dark:hover:bg-slate-600 rounded text-gray-900 dark:text-white text-sm transition">
            Export Full DB (JSON)
          </button>
        </div>
        {exportJson && (
          <div className="mt-3">
            <pre className="bg-gray-100 dark:bg-slate-900 border border-gray-300 dark:border-slate-600 rounded p-3 text-xs text-gray-700 dark:text-gray-300 overflow-auto max-h-64">{exportJson}</pre>
          </div>
        )}
      </div>

      <div className="bg-gray-50 dark:bg-slate-800 rounded-lg p-3 sm:p-6 border border-gray-200 dark:border-slate-700 mb-3 sm:mb-6">
        <h3 className="text-base sm:text-lg text-gray-900 dark:text-white mb-3 sm:mb-4">Admin Key Rotation</h3>
        <p className="text-gray-500 dark:text-gray-400 mb-3 sm:mb-4 text-xs sm:text-sm">Generate a new admin API key. The old key will be invalidated immediately.</p>
        <button onClick={handleRotateAdminKey} className="px-4 py-2 bg-amber-600 hover:bg-amber-700 rounded text-gray-900 dark:text-white text-sm transition">
          Rotate Admin Key
        </button>
        {newAdminKey && (
          <div className="mt-3 bg-gray-100 dark:bg-slate-900 border border-amber-500/30 rounded p-3 flex gap-2 items-center">
            <code className="flex-1 text-sm text-amber-700 dark:text-amber-300 font-mono break-all">{newAdminKey}</code>
            <button
              onClick={async () => {
                try { await navigator.clipboard.writeText(newAdminKey) } catch { document.execCommand('copy') }
                setNewAdminKey('')
              }}
              className="px-3 py-1 bg-gray-200 dark:bg-slate-700 hover:bg-gray-300 dark:hover:bg-slate-600 rounded text-sm transition shrink-0"
            >
              Copy & Done
            </button>
          </div>
        )}
      </div>

      <div className="bg-gray-50 dark:bg-slate-800 rounded-lg p-3 sm:p-6 border border-gray-200 dark:border-slate-700 mb-3 sm:mb-6">
        <h2 className="text-lg sm:text-2xl font-bold text-gray-900 dark:text-white mb-3 sm:mb-4">Webhooks</h2>
        <p className="text-gray-500 dark:text-gray-400 mb-3 sm:mb-4 text-xs sm:text-sm break-all">Send notifications to external URLs on events: quota_warning, quota_exceeded, key_rotated, user_disabled, rate_limited_spike</p>
        <div className="space-y-3">
          {webhooks.map(w => (
            <div key={w.id} className="bg-gray-100 dark:bg-slate-900 border border-gray-300 dark:border-slate-600 rounded p-3 flex items-start justify-between">
              <div className="flex-1">
                <div className="flex items-center gap-2">
                  <code className="text-gray-900 dark:text-white font-medium">{w.name}</code>
                  <span className={`px-2 py-0.5 rounded text-xs font-medium ${w.is_active ? 'bg-emerald-50 dark:bg-emerald-900/50 text-emerald-700 dark:text-emerald-300' : 'bg-gray-200 dark:bg-gray-700 text-gray-500 dark:text-gray-400'}`}>
                    {w.is_active ? 'Active' : 'Inactive'}
                  </span>
                </div>
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">{w.url}</p>
                <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">Events: {w.events.join(', ')}</p>
              </div>
              <button onClick={() => {
                if (!confirm(`Delete webhook "${w.name}"?`)) return
                api.fetchDelete(`/api/webhooks/${w.id}`)
                setWebhooks(webhooks.filter(x => x.id !== w.id))
              }} className="text-red-600 dark:text-red-400 hover:text-red-700 dark:hover:text-red-300 text-sm transition">
                Delete
              </button>
            </div>
          ))}
        </div>
        <div className="mt-4 space-y-2">
          <input
            placeholder="Name"
            value={newWebhookName}
            onChange={e => setNewWebhookName(e.target.value)}
            className="w-full px-3 py-2 bg-gray-100 dark:bg-slate-900 border border-gray-300 dark:border-slate-600 rounded text-gray-900 dark:text-white focus:border-indigo-500 focus:outline-none text-sm"
          />
          <input
            placeholder="URL (https://...)"
            value={newWebhookUrl}
            onChange={e => setNewWebhookUrl(e.target.value)}
            className="w-full px-3 py-2 bg-gray-100 dark:bg-slate-900 border border-gray-300 dark:border-slate-600 rounded text-gray-900 dark:text-white focus:border-indigo-500 focus:outline-none text-sm"
          />
          <div className="flex flex-wrap gap-2">
            {events.map(ev => (
              <label key={ev} className={`px-3 py-1 rounded-full text-xs cursor-pointer transition ${newWebhookEvents.includes(ev) ? 'bg-indigo-600 text-gray-900 dark:text-white' : 'bg-gray-200 dark:bg-slate-700 text-gray-500 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white'}`}>
                <input type="checkbox" checked={newWebhookEvents.includes(ev)} onChange={e => {
                  setNewWebhookEvents(e.target.checked ? [...newWebhookEvents, ev] : newWebhookEvents.filter(x => x !== ev))
                }} className="hidden" />
                {ev}
              </label>
            ))}
          </div>
          <button
            onClick={async () => {
              if (!newWebhookName || !newWebhookUrl || newWebhookEvents.length === 0) return
                const res = await api.fetchPost('/api/webhooks', { name: newWebhookName, url: newWebhookUrl, events: newWebhookEvents })
                const created = res.created as { secret: string }
                setWebhooks([...webhooks, { id: Date.now(), name: newWebhookName, url: newWebhookUrl, events: newWebhookEvents, is_active: true, secret: created.secret, created_at: new Date().toISOString() }])
              setNewWebhookName('')
              setNewWebhookUrl('')
              setNewWebhookEvents([])
            }}
            className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 rounded text-gray-900 dark:text-white text-sm transition"
          >
            Add Webhook
          </button>
        </div>
      </div>

      <div className="bg-gray-50 dark:bg-slate-800 rounded-lg p-3 sm:p-6 border border-gray-200 dark:border-slate-700">
        <h3 className="text-base sm:text-lg text-gray-900 dark:text-white mb-3 sm:mb-4">Danger Zone</h3>
        <button
          onClick={() => { if (confirm('Log out?')) logout() }}
          className="px-4 py-2 bg-red-600 hover:bg-red-700 rounded text-gray-900 dark:text-white text-sm transition"
        >
          Log Out
        </button>
      </div>
    </div>
  )
}

function HFTokenSection() {
  const queryClient = useQueryClient()
  const showToast = useToast()
  const [tokenValue, setTokenValue] = useState('')

  const { data, isLoading } = useQuery({
    queryKey: ['download-hf-token'],
    queryFn: api.getHFToken,
  })

  const saveMutation = useMutation({
    mutationFn: api.setHFToken,
    onSuccess: () => {
      showToast('HF API token saved')
      queryClient.invalidateQueries({ queryKey: ['download-hf-token'] })
    },
  })

  const hasToken = data?.has_token ?? false

  return (
    <div>
      {isLoading ? (
        <p className="text-gray-500 dark:text-gray-400 text-sm">Loading...</p>
      ) : hasToken ? (
        <div className="flex items-center gap-3">
          <span className="text-sm text-gray-700 dark:text-gray-300">
            Token set: <code className="bg-gray-200 dark:bg-slate-900 px-1 rounded text-xs">{data?.masked_token}</code>
          </span>
          <button
            onClick={() => setTokenValue('')}
            className="text-xs text-indigo-600 dark:text-indigo-400 hover:underline"
          >
            Change
          </button>
        </div>
      ) : (
        <p className="text-gray-500 dark:text-gray-400 text-sm mb-2">No token configured</p>
      )}
      <div className="flex gap-2 mt-2">
        <input
          type="password"
          value={tokenValue}
          onChange={e => setTokenValue(e.target.value)}
          placeholder="hf_..."
          className="flex-1 px-3 py-2 bg-white dark:bg-slate-900 border border-gray-300 dark:border-slate-600 rounded text-gray-900 dark:text-white text-sm focus:border-indigo-500 focus:outline-none"
        />
        <button
          onClick={() => { saveMutation.mutate(tokenValue); setTokenValue('') }}
          disabled={saveMutation.isPending || !tokenValue}
          className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 rounded text-white text-sm disabled:opacity-50"
        >
          {saveMutation.isPending ? 'Saving...' : 'Save'}
        </button>
      </div>
    </div>
  )
}

function BaseUrlSection() {
  const queryClient = useQueryClient()
  const showToast = useToast()

  const { data, isLoading } = useQuery({
    queryKey: ['settings-base-url'],
    queryFn: api.getBaseUrl,
  })

  const saveMutation = useMutation({
    mutationFn: api.setBaseUrl,
    onSuccess: () => {
      showToast('Base URL saved')
      queryClient.invalidateQueries({ queryKey: ['settings-base-url'] })
    },
  })

  return (
    <div className="bg-gray-50 dark:bg-slate-800 rounded-lg p-3 sm:p-6 border border-gray-200 dark:border-slate-700 mb-3 sm:mb-6">
      <h2 className="text-lg sm:text-2xl font-bold text-gray-900 dark:text-white mb-2">Gateway Base URL</h2>
      <p className="text-gray-500 dark:text-gray-400 mb-3 sm:mb-4 text-xs sm:text-sm">External URL used in generated API configs (e.g. opencode.json). Clients will be configured to point to this address.</p>
      {isLoading ? (
        <p className="text-gray-500 dark:text-gray-400 text-sm">Loading...</p>
      ) : (
        <form onSubmit={async (e) => {
          e.preventDefault()
          const input = e.currentTarget.elements.namedItem('base-url') as HTMLInputElement
          if (input.value) saveMutation.mutate(input.value)
        }} className="flex gap-2">
          <input
            name="base-url"
            type="url"
            defaultValue={data?.base_url || ''}
            placeholder="https://api.example.com/v1"
            className="flex-1 px-3 py-2 bg-white dark:bg-slate-900 border border-gray-300 dark:border-slate-600 rounded text-gray-900 dark:text-white text-sm focus:border-indigo-500 focus:outline-none"
          />
          <button
            type="submit"
            disabled={saveMutation.isPending}
            className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 rounded text-white text-sm disabled:opacity-50"
          >
            {saveMutation.isPending ? 'Saving...' : 'Save'}
          </button>
        </form>
      )}
    </div>
  )
}
