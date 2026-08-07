import { useState, useCallback, useMemo, useRef, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '../api/client'
import type { Model, User, ModelHealth } from '../api/types'
import { useToast } from '../hooks/useToast'

const statusColor = (s?: string) => {
  if (s === 'running') return 'bg-emerald-500'
  if (s === 'starting' || s === 'stopping') return 'bg-amber-500'
  return 'bg-red-500'
}

const statusLabel = (s?: string) => {
  if (s === 'running') return 'Running'
  if (s === 'starting') return 'Starting'
  if (s === 'stopping') return 'Stopping'
  if (s === 'error') return 'Error'
  return 'Stopped'
}

export default function ModelsPage() {
  const [search, setSearch] = useState('')
  const [expandedRows, setExpandedRows] = useState<Set<string>>(new Set())
  const [healthCache, setHealthCache] = useState<Record<string, ModelHealth | null>>({})
  const [intervalIdx, setIntervalIdx] = useState(1)
  const [testing, setTesting] = useState<Record<string, boolean>>({})
  const [testOutput, setTestOutput] = useState<Record<string, { ok: boolean; text: string }>>({})
  const [busy, setBusy] = useState<Record<string, 'starting' | 'stopping' | 'toggling' | 'deleting' | null>>({})
  const [jsonModalId, setJsonModalId] = useState<string | null>(null)
  const [jsonModalContent, setJsonModalContent] = useState<string>('')
  const fileRef = useRef<HTMLInputElement>(null)
  const singleFileRefs = useRef<Record<string, HTMLInputElement | null>>({})
  const queryClient = useQueryClient()
  const showToast = useToast()
  const navigate = useNavigate()

  const intervals = [0, 10_000, 30_000, 60_000]
  const intervalLabels = ['Off', '10s', '30s', '60s']

  const { data: models = [], isLoading } = useQuery<Model[], Error>({
    queryKey: ['models'],
    queryFn: api.listModels,
  })

  const healthInterval = intervals[intervalIdx]
  useEffect(() => {
    if (!healthInterval) return
    const id = setInterval(() => {
      models.forEach((m) => {
        api
          .getModelHealth(m.model_id)
          .then((h) => {
            setHealthCache((prev) => ({ ...prev, [h.model_id]: h }))
          })
          .catch(() => {})
      })
    }, healthInterval)
    return () => clearInterval(id)
  }, [healthInterval, models])

  const refreshInvalidate = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: ['models'] })
  }, [queryClient])

  const { mutateAsync: deleteModel } = useMutation({
    mutationFn: (modelId: string) => api.deleteModel(modelId),
    onSuccess: () => {
      refreshInvalidate()
      showToast('Model deleted')
    },
    onError: (e: Error) => showToast(e.message),
  })

  const { mutateAsync: startModel } = useMutation({
    mutationFn: (modelId: string) => api.startModel(modelId),
    onSuccess: () => {
      refreshInvalidate()
      showToast('Model started')
    },
    onError: (e: Error) => showToast(e.message),
  })

  const { mutateAsync: stopModel } = useMutation({
    mutationFn: (modelId: string) => api.stopModel(modelId),
    onSuccess: () => {
      refreshInvalidate()
      showToast('Model stopped')
    },
    onError: (e: Error) => showToast(e.message),
  })

  const { mutateAsync: toggleModel } = useMutation({
    mutationFn: (modelId: string) => api.toggleModel(modelId),
    onSuccess: () => {
      refreshInvalidate()
      showToast('Model toggled')
    },
    onError: (e: Error) => showToast(e.message),
  })

  const { data: allUsers = [] } = useQuery<User[], Error>({
    queryKey: ['users'],
    queryFn: api.getUsers,
  })

  const { mutateAsync: setModelUsers } = useMutation({
    mutationFn: (vars: { modelId: string; userIds: number[] }) => api.setModelUsers(vars.modelId, vars.userIds),
    onSuccess: () => showToast('User access updated'),
    onError: (e: Error) => showToast(e.message),
  })

  const { mutateAsync: importModels } = useMutation({
    mutationFn: (json: string) => api.importModels(json),
    onSuccess: (r) => {
      refreshInvalidate()
      showToast(`Imported ${r.imported} model(s)`)
    },
    onError: (e: Error) => showToast(e.message),
  })

  const toggleExpanded = (modelId: string) => {
    setExpandedRows((prev) => {
      const next = new Set(prev)
      if (next.has(modelId)) next.delete(modelId)
      else next.add(modelId)
      return next
    })
  }

  const handleExport = async () => {
    const r = await api.exportModels()
    const blob = new Blob([r.json], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = 'models.json'
    a.click()
    URL.revokeObjectURL(url)
    showToast('Models exported')
  }

  const handleImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    const text = await file.text()
    await importModels(text)
    if (fileRef.current) fileRef.current.value = ''
  }

  const handleExportSingle = (m: Model) => {
    const json = JSON.stringify({ models: [m] }, null, 2)
    const blob = new Blob([json], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `${m.model_id}.json`
    a.click()
    URL.revokeObjectURL(url)
    showToast(`Exported ${m.name}`)
  }

  const handleImportSingle = async (e: React.ChangeEvent<HTMLInputElement>, m: Model) => {
    const file = e.target.files?.[0]
    if (!file) return
    const text = await file.text()
    try {
      const parsed = JSON.parse(text)
      const json = Array.isArray(parsed)
        ? JSON.stringify({ models: parsed })
        : parsed.models
          ? text
          : JSON.stringify({ models: [parsed] })
      await importModels(json)
      showToast(`Imported model for ${m.name}`)
    } catch (err) {
      showToast(`Import failed: ${(err as Error).message}`)
    }
    if (singleFileRefs.current[m.model_id]) singleFileRefs.current[m.model_id] = null
  }

  const handleViewJson = async (m: Model) => {
    try {
      const detail = await api.getModel(m.model_id)
      setJsonModalContent(JSON.stringify(detail, null, 2))
      setJsonModalId(m.model_id)
    } catch {
      setJsonModalContent(JSON.stringify(m, null, 2))
      setJsonModalId(m.model_id)
    }
  }

  const handleDelete = async (m: Model) => {
    if (!confirm(`Delete model "${m.name}" (${m.model_id})?`)) return
    setBusy((p) => ({ ...p, [m.model_id]: 'deleting' }))
    showToast(`Deleting ${m.name}…`)
    try {
      await deleteModel(m.model_id)
      showToast(`Deleted ${m.name}`)
      refreshInvalidate()
    } catch (e) {
      showToast(`Delete failed: ${(e as Error).message}`)
    } finally {
      setBusy((p) => ({ ...p, [m.model_id]: null }))
    }
  }

  const handleStart = async (m: Model) => {
    setBusy((p) => ({ ...p, [m.model_id]: 'starting' }))
    showToast(`Starting ${m.name}… (this may take up to a few minutes while weights load)`)
    const t0 = Date.now()
    try {
      await startModel(m.model_id)
      const secs = Math.round((Date.now() - t0) / 1000)
      showToast(`${m.name} started and ready in ${secs}s`)
      refreshInvalidate()
    } catch (e) {
      showToast(`Start failed for ${m.name}: ${(e as Error).message}`)
    } finally {
      setBusy((p) => ({ ...p, [m.model_id]: null }))
    }
  }

  const handleStop = async (m: Model) => {
    if (!confirm(`Stop "${m.name}"?`)) return
    setBusy((p) => ({ ...p, [m.model_id]: 'stopping' }))
    showToast(`Stopping ${m.name}…`)
    const t0 = Date.now()
    try {
      await stopModel(m.model_id)
      const secs = Math.round((Date.now() - t0) / 1000)
      showToast(`${m.name} stopped in ${secs}s`)
      refreshInvalidate()
    } catch (e) {
      showToast(`Stop failed for ${m.name}: ${(e as Error).message}`)
    } finally {
      setBusy((p) => ({ ...p, [m.model_id]: null }))
    }
  }

  const handleToggleActive = async (m: Model) => {
    const nextState = !m.active
    setBusy((p) => ({ ...p, [m.model_id]: 'toggling' }))
    showToast(
      nextState
        ? `Activating ${m.name} and starting container… (may take a few minutes)`
        : `Deactivating ${m.name} and stopping container…`,
    )
    const t0 = Date.now()
    try {
      await toggleModel(m.model_id)
      const secs = Math.round((Date.now() - t0) / 1000)
      showToast(nextState ? `${m.name} is now active (${secs}s)` : `${m.name} is now inactive (${secs}s)`)
      refreshInvalidate()
    } catch (e) {
      showToast(`Toggle failed for ${m.name}: ${(e as Error).message}`)
    } finally {
      setBusy((p) => ({ ...p, [m.model_id]: null }))
    }
  }

  const handleTest = async (m: Model) => {
    setTesting((p) => ({ ...p, [m.model_id]: true }))
    setTestOutput((p) => {
      const next = { ...p }
      delete next[m.model_id]
      return next
    })
    const t0 = Date.now()
    try {
      const r = await api.testModel(m.model_id)
      const elapsedMs = r.latency_ms ?? Date.now() - t0
      if (r.success) {
        const usage = r.usage ? ` · ${r.usage.prompt_tokens ?? '?'}→${r.usage.completion_tokens ?? '?'} tok` : ''
        const finish = r.finish_reason ? ` · finish=${r.finish_reason}` : ''
        const header = `${r.model || m.model_id} · ${elapsedMs}ms${usage}${finish}`
        setTestOutput((p) => ({
          ...p,
          [m.model_id]: { ok: true, text: `${header}\n\n${r.content || '(empty response)'}` },
        }))
      } else {
        setTestOutput((p) => ({
          ...p,
          [m.model_id]: { ok: false, text: `HTTP ${r.status_code ?? '?'} — ${r.error || 'unknown error'}` },
        }))
      }
    } catch (e) {
      setTestOutput((p) => ({ ...p, [m.model_id]: { ok: false, text: `Error: ${(e as Error).message}` } }))
    }
    setTesting((p) => ({ ...p, [m.model_id]: false }))
  }

  const openEdit = (m: Model) => navigate(`/models/${encodeURIComponent(m.model_id)}/edit`)
  const openAdd = () => navigate('/models/new')
  const handleDuplicate = (m: Model) =>
    navigate('/models/new', { state: { duplicateFrom: m.model_id } })

  const handleSaveUsers = async (modelId: string, userIds: number[]) => {
    await setModelUsers({ modelId, userIds })
  }

  const filtered = useMemo(() => {
    if (!search) return models
    const q = search.toLowerCase()
    return models.filter((m) => m.name.toLowerCase().includes(q) || m.model_id.toLowerCase().includes(q))
  }, [models, search])

  return (
    <div>
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-6">
        <h1 className="text-xl font-semibold text-gray-900 dark:text-white">Models</h1>
        <div className="flex items-center gap-2 flex-wrap">
          <input type="file" ref={fileRef} accept=".json" className="hidden" onChange={handleImport} />
          <button
            onClick={handleExport}
            className="px-3 py-1.5 text-xs rounded transition bg-gray-100 dark:bg-slate-700 hover:bg-gray-200 dark:hover:bg-slate-600 text-gray-700 dark:text-gray-300"
          >
            Export
          </button>
          <button
            onClick={() => fileRef.current?.click()}
            className="px-3 py-1.5 text-xs rounded transition bg-gray-100 dark:bg-slate-700 hover:bg-gray-200 dark:hover:bg-slate-600 text-gray-700 dark:text-gray-300"
          >
            Import
          </button>
          <button
            onClick={openAdd}
            className="px-3 py-1.5 text-xs rounded transition bg-indigo-600 hover:bg-indigo-700 text-white font-medium"
          >
            Add Model
          </button>
          <button
            onClick={() => navigate('/models/download')}
            className="px-3 py-1.5 text-xs rounded transition bg-emerald-600 hover:bg-emerald-700 text-white font-medium"
          >
            Download from HuggingFace
          </button>
        </div>
      </div>

      <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3 mb-4">
        <div className="w-full sm:flex-1 sm:min-w-48">
          <input
            type="text"
            placeholder="Search models..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full px-3 py-2 bg-gray-100 dark:bg-slate-700 border border-gray-300 dark:border-slate-600 rounded text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-gray-500 text-sm focus:border-indigo-400 dark:focus:border-indigo-500 focus:outline-none"
          />
        </div>
        <div className="flex items-center gap-2">
          <svg className="w-4 h-4 text-gray-500 dark:text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
            />
          </svg>
          <select
            value={intervalIdx}
            onChange={(e) => setIntervalIdx(Number(e.target.value))}
            className="px-3 py-1.5 text-sm bg-gray-100 dark:bg-slate-700 hover:bg-gray-200 dark:hover:bg-slate-600 text-gray-900 dark:text-white rounded transition appearance-none cursor-pointer focus:border-indigo-400 dark:focus:border-indigo-500 focus:outline-none"
          >
            {intervalLabels.map((l, i) => (
              <option key={i} value={i}>
                {l}
              </option>
            ))}
          </select>
        </div>
      </div>

      {isLoading ? (
        <div className="py-8 text-center text-gray-500 dark:text-gray-400">Loading models...</div>
      ) : filtered.length === 0 ? (
        <div className="py-8 text-center text-gray-400 dark:text-gray-500">No models found</div>
      ) : (
        <div className="space-y-4">
          {filtered.map((m) => {
            const health = healthCache[m.model_id]
            const st = m.status || (health?.status === 'healthy' ? 'running' : 'stopped')
            const b = busy[m.model_id]
            const isBusy = Boolean(b)
            const effectiveStatus = b === 'starting' ? 'starting' : b === 'stopping' ? 'stopping' : st
            const out = testOutput[m.model_id]
            return (
              <div
                 key={m.model_id}
                 className="bg-gray-50 dark:bg-slate-800 rounded-lg border border-gray-200 dark:border-slate-700 overflow-hidden"
               >
                 <input
                   type="file"
                   accept=".json"
                   className="hidden"
                   ref={(el) => { singleFileRefs.current[m.model_id] = el }}
                   onChange={(e) => handleImportSingle(e, m)}
                 />
                 <div className="p-3 sm:p-4">
                   <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                     <div className="flex items-center gap-2 sm:gap-3 flex-wrap">
                       <span
                         className={`w-2.5 h-2.5 rounded-full shrink-0 ${statusColor(effectiveStatus)} ${
                           isBusy ? 'animate-pulse' : ''
                         }`}
                       />
                       <div className="min-w-0">
                         <h3 className="font-medium text-gray-900 dark:text-white truncate">{m.name}</h3>
                         <p className="text-xs text-gray-400 dark:text-gray-500 font-mono truncate">{m.model_id}</p>
                       </div>
                       <span
                         className={`px-2 py-0.5 rounded text-xs font-medium shrink-0 ${
                           m.active
                             ? 'bg-emerald-50 dark:bg-emerald-900/50 text-emerald-700 dark:text-emerald-300'
                             : 'bg-gray-100 dark:bg-slate-700 text-gray-500 dark:text-gray-400'
                         }`}
                       >
                         {statusLabel(effectiveStatus)}
                       </span>
                       {isBusy && (
                         <Spinner
                           label={
                             b === 'toggling'
                               ? m.active
                                 ? 'Deactivating…'
                                 : 'Activating…'
                               : b === 'starting'
                                 ? 'Starting…'
                                 : b === 'stopping'
                                   ? 'Stopping…'
                                   : 'Deleting…'
                           }
                         />
                       )}
                     </div>
                     <div className="flex items-center gap-2 sm:gap-4 flex-wrap ml-2">
                       <ToggleSwitch on={m.active} disabled={isBusy} onChange={() => handleToggleActive(m)} />
                       <div className="flex items-center gap-1 flex-wrap">
                        {st !== 'running' && (
                          <button
                            onClick={() => handleStart(m)}
                            disabled={isBusy}
                            className="px-2 py-1 text-xs rounded transition bg-emerald-600 dark:bg-emerald-700 hover:bg-emerald-500 text-white disabled:opacity-50 disabled:cursor-not-allowed"
                          >
                            {b === 'starting' ? 'Starting…' : 'Start'}
                          </button>
                        )}
                        {st === 'running' && (
                          <button
                            onClick={() => handleStop(m)}
                            disabled={isBusy}
                            className="px-2 py-1 text-xs rounded transition bg-red-600 dark:bg-red-700 hover:bg-red-500 text-white disabled:opacity-50 disabled:cursor-not-allowed"
                          >
                            {b === 'stopping' ? 'Stopping…' : 'Stop'}
                          </button>
                        )}
                        <button
                          onClick={() => openEdit(m)}
                          disabled={isBusy}
                          className="px-2 py-1 text-xs rounded transition bg-gray-100 dark:bg-slate-700 hover:bg-gray-200 dark:hover:bg-slate-600 text-gray-700 dark:text-gray-300 disabled:opacity-50"
                        >
                          Edit
                        </button>
                        <button
                          onClick={() => handleDuplicate(m)}
                          disabled={isBusy}
                          className="px-2 py-1 text-xs rounded transition bg-gray-100 dark:bg-slate-700 hover:bg-gray-200 dark:hover:bg-slate-600 text-gray-700 dark:text-gray-300 disabled:opacity-50"
                        >
                          Duplicate
                        </button>
                        <button
                          onClick={() => handleDelete(m)}
                          disabled={isBusy}
                          className="px-2 py-1 text-xs rounded transition bg-gray-100 dark:bg-slate-700 hover:bg-red-50 dark:hover:bg-red-900/50 text-gray-700 dark:text-gray-300 hover:text-red-700 dark:hover:text-red-300 disabled:opacity-50"
                        >
                          {b === 'deleting' ? 'Deleting…' : 'Delete'}
                        </button>
                        <button
                          onClick={() => handleTest(m)}
                          disabled={testing[m.model_id] || isBusy}
                          className="px-2 py-1 text-xs rounded transition bg-indigo-100 dark:bg-indigo-900/50 hover:bg-indigo-200 dark:hover:bg-indigo-800 text-indigo-700 dark:text-indigo-300 disabled:opacity-50"
                        >
                          {testing[m.model_id] ? 'Testing…' : 'Test'}
                        </button>
                        <button
                          onClick={() => handleExportSingle(m)}
                          disabled={isBusy}
                          className="px-2 py-1 text-xs rounded transition bg-gray-100 dark:bg-slate-700 hover:bg-gray-200 dark:hover:bg-slate-600 text-gray-700 dark:text-gray-300 disabled:opacity-50"
                        >
                          Export
                        </button>
                        <button
                          onClick={() => singleFileRefs.current[m.model_id]?.click()}
                          disabled={isBusy}
                          className="px-2 py-1 text-xs rounded transition bg-gray-100 dark:bg-slate-700 hover:bg-gray-200 dark:hover:bg-slate-600 text-gray-700 dark:text-gray-300 disabled:opacity-50"
                        >
                          Import
                        </button>
                        <button
                          onClick={() => handleViewJson(m)}
                          disabled={isBusy}
                          className="px-2 py-1 text-xs rounded transition bg-gray-100 dark:bg-slate-700 hover:bg-gray-200 dark:hover:bg-slate-600 text-gray-700 dark:text-gray-300 disabled:opacity-50 font-mono"
                        >
                          {'{ }'}
                        </button>
                      </div>
                    </div>
                  </div>
                  <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-gray-500 dark:text-gray-400">
                    <span>
                      Image: <code className="font-mono">{m.image}</code>
                    </span>
                    <span>Port: {m.port}</span>
                    <span>GPU: {m.gpu || 'auto (all)'}</span>
                    <span>Context: {m.context_length ?? '-'}</span>
                    <span>Output: {m.max_output_length ?? '-'}</span>
                  </div>
                  {(testing[m.model_id] || out) && (
                    <div className="mt-3 relative">
                      <button
                        onClick={() => {
                          setTestOutput((p) => {
                            const next = { ...p }
                            delete next[m.model_id]
                            return next
                          })
                        }}
                        className="absolute top-1 right-1 p-0.5 rounded text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-300 transition z-10"
                      >
                        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                        </svg>
                      </button>
                      <div
                        className={`p-2 pr-6 rounded text-xs font-mono whitespace-pre-wrap max-h-60 overflow-y-auto ${
                          out && !out.ok
                            ? 'bg-red-50 dark:bg-red-900/20 text-red-800 dark:text-red-300'
                            : 'bg-emerald-50 dark:bg-emerald-900/20 text-emerald-800 dark:text-emerald-300'
                        }`}
                      >
                        {testing[m.model_id] ? 'Sending "hi" to the model…' : out?.text}
                      </div>
                    </div>
                  )}
                </div>
                <div className="border-t border-gray-200 dark:border-slate-700">
                  <button
                    onClick={() => toggleExpanded(m.model_id)}
                    className="w-full px-4 py-2 text-xs text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300 flex items-center justify-center gap-1 transition"
                  >
                    {expandedRows.has(m.model_id) ? 'Hide' : 'Show'} user access
                    <svg
                      className={`w-3 h-3 transition ${expandedRows.has(m.model_id) ? 'rotate-180' : ''}`}
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                    </svg>
                  </button>
                </div>
                {expandedRows.has(m.model_id) && (
                  <UserAccessPanel modelId={m.model_id} users={allUsers} onSave={handleSaveUsers} />
                )}
              </div>
            )
          })}
        </div>
      )}

      {jsonModalId && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60"
          onClick={() => setJsonModalId(null)}
        >
          <div
            className="bg-white dark:bg-slate-800 rounded-lg border border-gray-200 dark:border-slate-700 w-full max-w-3xl mx-4 max-h-[80vh] flex flex-col"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between p-4 border-b border-gray-200 dark:border-slate-700">
              <h2 className="text-sm font-medium text-gray-900 dark:text-white">Model JSON</h2>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => {
                    navigator.clipboard.writeText(jsonModalContent)
                    showToast('Copied to clipboard')
                  }}
                  className="px-2 py-1 text-xs rounded bg-gray-100 dark:bg-slate-700 hover:bg-gray-200 dark:hover:bg-slate-600 text-gray-700 dark:text-gray-300 transition"
                >
                  Copy
                </button>
                <button
                  onClick={() => setJsonModalId(null)}
                  className="p-1 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 transition"
                >
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
            </div>
            <pre className="p-4 text-xs font-mono text-gray-800 dark:text-gray-200 overflow-auto flex-1 whitespace-pre-wrap break-all">{jsonModalContent}</pre>
          </div>
        </div>
      )}
    </div>
  )
}

function ToggleSwitch({ on, onChange, disabled = false }: { on: boolean; onChange: () => void; disabled?: boolean }) {
  return (
    <button
      onClick={onChange}
      disabled={disabled}
      className={`relative inline-flex h-5 w-9 items-center rounded-full transition ${
        on ? 'bg-emerald-500' : 'bg-gray-300 dark:bg-slate-600'
      } ${disabled ? 'opacity-50 cursor-not-allowed' : ''}`}
    >
      <span
        className={`inline-block h-4 w-4 transform rounded-full bg-white transition ${
          on ? 'translate-x-4.5' : 'translate-x-0.5'
        }`}
      />
    </button>
  )
}

function Spinner({ label }: { label: string }) {
  return (
    <span className="inline-flex items-center gap-1.5 text-xs text-amber-700 dark:text-amber-300">
      <svg className="w-3.5 h-3.5 animate-spin" fill="none" viewBox="0 0 24 24">
        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z" />
      </svg>
      {label}
    </span>
  )
}

function UserAccessPanel({
  modelId,
  users,
  onSave,
}: {
  modelId: string
  users: User[]
  onSave: (modelId: string, userIds: number[]) => void
}) {
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set())
  const [saving, setSaving] = useState(false)
  const mounted = useRef(true)

  useEffect(() => {
    mounted.current = true
    api
      .getModelUsers(modelId)
      .then((r) => {
        if (mounted.current) {
          setSelectedIds(new Set(r.users.map((u) => u.id)))
        }
      })
      .catch(() => {})
    return () => {
      mounted.current = false
    }
  }, [modelId])

  const toggleUser = (id: number) => {
    setSelectedIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const handleSave = async () => {
    setSaving(true)
    await onSave(modelId, [...selectedIds])
    setSaving(false)
  }

  return (
    <div className="px-4 py-3 border-t border-gray-200 dark:border-slate-700 bg-gray-50/50 dark:bg-slate-900/30">
      <div className="flex items-center justify-between mb-3">
        <span className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
          User Access
        </span>
        <div className="flex gap-2">
          <span className="text-xs text-gray-400 dark:text-gray-500">
            {selectedIds.size} of {users.length} users
          </span>
          <button
            onClick={handleSave}
            disabled={saving}
            className="px-3 py-1 text-xs rounded bg-indigo-600 hover:bg-indigo-700 text-white transition disabled:opacity-50"
          >
            {saving ? 'Saving...' : 'Save'}
          </button>
        </div>
      </div>
      {users.length === 0 ? (
        <p className="text-xs text-gray-400 dark:text-gray-500">No users available</p>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 max-h-48 overflow-y-auto">
          {users.map((u) => (
            <button
              key={u.id}
              onClick={() => toggleUser(u.id)}
              className={`flex items-center gap-2 px-3 py-2 rounded text-sm text-left transition ${
                selectedIds.has(u.id)
                  ? 'bg-indigo-50 dark:bg-indigo-900/30 border border-indigo-200 dark:border-indigo-800 text-indigo-700 dark:text-indigo-300'
                  : 'bg-white dark:bg-slate-800 border border-gray-200 dark:border-slate-700 text-gray-700 dark:text-gray-300 hover:border-gray-300 dark:hover:border-slate-600'
              }`}
            >
              <span
                className={`w-4 h-4 rounded border flex items-center justify-center shrink-0 ${
                  selectedIds.has(u.id) ? 'bg-indigo-600 border-indigo-600' : 'border-gray-300 dark:border-slate-600'
                }`}
              >
                {selectedIds.has(u.id) && (
                  <svg className="w-3 h-3 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                  </svg>
                )}
              </span>
              <span className="truncate">{u.name}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

