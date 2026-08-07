import { useState, useCallback, useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '../api/client'
import type { HFModel, DiskUsage, SSEEvent } from '../api/types'
import { useToast } from '../hooks/useToast'

const formatBytes = (bytes: number) => {
  if (bytes < 1024) return bytes + ' B'
  if (bytes < 1024 ** 2) return (bytes / 1024).toFixed(1) + ' KB'
  if (bytes < 1024 ** 3) return (bytes / 1024 ** 2).toFixed(1) + ' MB'
  return (bytes / 1024 ** 3).toFixed(1) + ' GB'
}

const MODELS_DIR = (typeof window !== 'undefined' && (window as Window & { __MODELS_DIR__?: string }).__MODELS_DIR__) || ''

const formatParams = (n: number) => {
  if (n >= 1e12) return (n / 1e12).toFixed(1) + 'T'
  if (n >= 1e9) return (n / 1e9).toFixed(1) + 'B'
  if (n >= 1e6) return (n / 1e6).toFixed(1) + 'M'
  return String(n)
}

export default function ModelDownloadPage() {
  const navigate = useNavigate()
  const showToast = useToast()
  const queryClient = useQueryClient()
  const [searchQuery, setSearchQuery] = useState('')
  const [searchDebounce, setSearchDebounce] = useState('')
  const [selectedModel, setSelectedModel] = useState<HFModel | null>(null)
  const [targetDir, setTargetDir] = useState('')
  const [selectedGpus, setSelectedGpus] = useState<number[]>([])
  const [downloadState, setDownloadState] = useState<'idle' | 'downloading' | 'complete' | 'error'>('idle')
  const [downloadLogs, setDownloadLogs] = useState<string[]>([])
  const [downloadProgress, setDownloadProgress] = useState(0)
  const [showTokenPrompt, setShowTokenPrompt] = useState(false)
  const [newToken, setNewToken] = useState('')
  const abortRef = useRef<AbortController | null>(null)
  const logEndRef = useRef<HTMLDivElement>(null)
  const userEditedTargetDir = useRef(false)

  // GPU info
  const { data: gpuData, isLoading: gpusLoading } = useQuery({
    queryKey: ['download-gpus'],
    queryFn: api.getGPUs,
  })

  // Disk space
  const { data: diskData } = useQuery<DiskUsage>({
    queryKey: ['download-disk'],
    queryFn: api.getDiskSpace,
    refetchInterval: 30_000,
  })

  // HF Token
  const { data: tokenData, isLoading: tokenLoading } = useQuery({
    queryKey: ['download-hf-token'],
    queryFn: api.getHFToken,
  })

  const hasToken = tokenData?.has_token ?? false
  const totalVram = gpuData?.total_vram_gb ?? 0

  // Search models
  useEffect(() => {
    const t = setTimeout(() => setSearchDebounce(searchQuery), 400)
    return () => clearTimeout(t)
  }, [searchQuery])

  const { data: searchResult, isLoading: searchLoading } = useQuery({
    queryKey: ['hf-search', searchDebounce, totalVram],
    queryFn: () => api.searchHFModels(searchDebounce, totalVram || undefined, 50),
    staleTime: 300_000,
  })

  const models = searchResult?.models ?? []
  const hiddenByVram = searchResult?.hidden_by_vram ?? 0

  // GPU selection
  const toggleGpu = (idx: number) => {
    setSelectedGpus(prev =>
      prev.includes(idx) ? prev.filter(g => g !== idx) : [...prev, idx]
    )
  }

  // Token save mutation
  const saveTokenMutation = useMutation({
    mutationFn: api.setHFToken,
    onSuccess: () => {
      setShowTokenPrompt(false)
      showToast('HF API token saved')
      queryClient.invalidateQueries({ queryKey: ['download-hf-token'] })
    },
  })

  // Model config creation mutation
  const createConfigMutation = useMutation({
    mutationFn: api.createModelConfig,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['models'] })
      showToast('Model config created')
    },
  })

  // Start SSE download
  const startDownload = useCallback(async () => {
    if (!selectedModel || !targetDir) return

    const pathExists = await api.checkModelPath(targetDir)
    if (pathExists.exists) {
      showToast('Model files already exist at this path')
      return
    }

    const disk = await api.getDiskSpace()
    if (selectedModel.storage_bytes && disk.free_bytes < selectedModel.storage_bytes) {
      showToast('Not enough disk space')
      return
    }

    setDownloadState('downloading')
    setDownloadLogs([])
    setDownloadProgress(0)

    const abort = new AbortController()
    abortRef.current = abort

    const gpuParam = selectedGpus.length ? `&gpus=${selectedGpus.join(',')}` : ''
    const url = `/admin/api/download/stream?model_id=${encodeURIComponent(selectedModel.id)}&target_dir=${encodeURIComponent(targetDir)}${gpuParam}`

    try {
      const response = await fetch(url, { signal: abort.signal })
      const reader = response.body?.getReader()
      if (!reader) throw new Error('No reader')

      const decoder = new TextDecoder()
      let buffer = ''

      while (true) {
        const { done, value } = await reader.read()
        if (done) break

        buffer += decoder.decode(value, { stream: true })
        const lines = buffer.split('\n')
        buffer = lines.pop() || ''

        for (const line of lines) {
          if (line.startsWith('data: ')) {
            try {
              const event: SSEEvent = JSON.parse(line.slice(6))
              if (event.type === 'log') {
                setDownloadLogs(prev => [...prev.slice(-50), event.line || ''])
                if (event.line) {
                  const progressMatch = event.line.match(/(\d+\.?\d*)%/)
                  if (progressMatch) {
                    setDownloadProgress(parseFloat(progressMatch[1]))
                  }
                }
              } else if (event.type === 'complete') {
                setDownloadState('complete')
                setDownloadProgress(100)
                await createConfigMutation.mutateAsync({
                  hf_model: selectedModel,
                  target_dir: targetDir,
                  gpu_indices: selectedGpus,
                })
                showToast('Download complete!')
              } else if (event.type === 'error') {
                setDownloadState('error')
                showToast(`Download failed: ${event.message}`)
              }
            } catch {
              // Skip malformed JSON
            }
          }
        }
      }
    } catch (e: unknown) {
      if (abort.signal.aborted) return
      const msg = e instanceof Error ? e.message : String(e)
      if (msg !== 'The operation was aborted.') {
        setDownloadState('error')
        showToast(`Download error: ${msg}`)
      }
    }
  }, [selectedModel, targetDir, selectedGpus, createConfigMutation, showToast])

  // Cleanup mutation
  const cleanupMutation = useMutation({
    mutationFn: api.cleanupModelPath,
    onSuccess: () => {
      showToast('Path cleaned up')
      setDownloadState('idle')
    },
  })

  useEffect(() => {
    logEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [downloadLogs])

  const selectedGpuVram = selectedGpus.length
    ? gpuData?.gpus?.filter(g => selectedGpus.includes(g.index)).reduce((s, g) => s + g.vram_gb, 0) ?? 0
    : totalVram

  return (
    <div>
      {/* Breadcrumb */}
      <div className="mb-4">
        <button
          onClick={() => navigate('/models')}
          className="text-indigo-600 dark:text-indigo-400 hover:underline text-sm flex items-center gap-1"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
          Back to Models
        </button>
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white mt-2">
          Download Model from HuggingFace
        </h1>
      </div>

      {/* GPU Info Banner */}
      <div className="bg-gray-50 dark:bg-slate-800 rounded-lg p-4 border border-gray-200 dark:border-slate-700 mb-6">
        <div className="flex items-start justify-between">
          <div>
            <h2 className="text-lg font-semibold text-gray-900 dark:text-white">System Info</h2>
            {gpusLoading ? (
              <p className="text-gray-500 dark:text-gray-400 mt-1">Detecting GPUs...</p>
            ) : gpuData?.gpus?.length ? (
              <div className="mt-2">
                <p className="text-gray-600 dark:text-gray-300">
                  GPUs: {gpuData.gpus.map(g => g.name).join(', ')} ({totalVram} GB total VRAM)
                </p>
                {diskData && (
                  <p className="text-gray-500 dark:text-gray-400 text-sm mt-1">
                    Disk: {diskData.free_gb} GB free / {diskData.total_gb} GB total
                  </p>
                )}
              </div>
            ) : (
              <p className="text-red-500 mt-1">No GPUs detected</p>
            )}
          </div>
          {!hasToken && !tokenLoading && (
            <button
              onClick={() => setShowTokenPrompt(true)}
              className="text-amber-600 dark:text-amber-400 text-sm hover:underline"
            >
              Set HF API Token (for gated models)
            </button>
          )}
        </div>
      </div>

      {/* Token Prompt Modal */}
      {showTokenPrompt && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50" onClick={() => setShowTokenPrompt(false)}>
          <div className="bg-white dark:bg-slate-800 rounded-lg p-6 w-full max-w-md mx-4" onClick={e => e.stopPropagation()}>
            <h3 className="text-lg font-bold text-gray-900 dark:text-white mb-2">HuggingFace API Token</h3>
            <p className="text-gray-500 dark:text-gray-400 text-sm mb-4">
              Required for gated models. Get one at{' '}
              <a href="https://huggingface.co/settings/tokens" target="_blank" rel="noopener noreferrer" className="text-indigo-600 dark:text-indigo-400 underline">
                huggingface.co/settings/tokens
              </a>
            </p>
            <input
              type="password"
              value={newToken}
              onChange={e => setNewToken(e.target.value)}
              placeholder="hf_..."
              className="w-full px-3 py-2 bg-gray-100 dark:bg-slate-900 border border-gray-300 dark:border-slate-600 rounded text-gray-900 dark:text-white focus:border-indigo-500 focus:outline-none mb-4"
            />
            <div className="flex justify-end gap-2">
              <button onClick={() => setShowTokenPrompt(false)} className="px-4 py-2 text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-slate-700 rounded">
                Cancel
              </button>
              <button
                onClick={() => { saveTokenMutation.mutate(newToken); setNewToken('') }}
                disabled={saveTokenMutation.isPending || !newToken}
                className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 rounded text-white text-sm disabled:opacity-50"
              >
                Save
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Main Content */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Model List */}
        <div className="lg:col-span-2">
          <div className="bg-gray-50 dark:bg-slate-800 rounded-lg p-4 border border-gray-200 dark:border-slate-700">
            <div className="flex gap-2 mb-4">
              <input
                type="text"
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                placeholder="Search HuggingFace models..."
                className="flex-1 px-3 py-2 bg-white dark:bg-slate-900 border border-gray-300 dark:border-slate-600 rounded text-gray-900 dark:text-white focus:border-indigo-500 focus:outline-none"
              />
            </div>

            {hiddenByVram > 0 && (
              <p className="text-xs text-gray-400 dark:text-gray-500 mb-2">
                {hiddenByVram} models hidden (require more than {totalVram} GB VRAM)
              </p>
            )}

            {searchLoading && !searchResult && (
              <p className="text-gray-500 dark:text-gray-400 py-4">Loading models...</p>
            )}

            <div className="space-y-2 max-h-[500px] overflow-y-auto">
              {models.map(m => (
                <button
                  key={m.id}
                  onClick={() => {
                    setSelectedModel(m)
                    const shortName = m.id.split('/').pop() || ''
                    setTargetDir(shortName)
                    userEditedTargetDir.current = false
                  }}
                  className={`w-full text-left p-3 rounded border transition ${
                    selectedModel?.id === m.id
                      ? 'border-indigo-500 bg-indigo-50 dark:bg-indigo-900/20'
                      : 'border-gray-200 dark:border-slate-700 hover:border-gray-300 dark:hover:border-slate-600'
                  }`}
                >
                  <div className="flex items-start justify-between">
                    <div>
                      <p className="font-medium text-gray-900 dark:text-white text-sm">{m.id}</p>
                      <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                        {formatParams(m.total_params)} params · {m.vram_gb.toFixed(1)} GB VRAM · {formatBytes(m.storage_bytes)}
                      </p>
                    </div>
                    <div className="flex items-center gap-2 text-xs text-gray-400">
                      {m.gated && !hasToken && (
                        <span className="text-amber-500">🔒 Gated</span>
                      )}
                      <span>{m.downloads > 0 ? formatParams(m.downloads) + ' ↓' : ''}</span>
                    </div>
                  </div>
                </button>
              ))}
              {!searchLoading && models.length === 0 && (
                <p className="text-gray-500 dark:text-gray-400 py-4 text-center">No models found</p>
              )}
            </div>
          </div>
        </div>

        {/* Download Panel */}
        <div className="lg:col-span-1">
          <div className="bg-gray-50 dark:bg-slate-800 rounded-lg p-4 border border-gray-200 dark:border-slate-700 sticky top-4">
            {!selectedModel ? (
              <p className="text-gray-500 dark:text-gray-400 text-sm">Select a model to download</p>
            ) : downloadState === 'complete' ? (
              <div>
                <div className="text-center py-4">
                  <svg className="w-12 h-12 text-emerald-500 mx-auto mb-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                  <h3 className="text-lg font-bold text-gray-900 dark:text-white">Download Complete</h3>
                  <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">Model downloaded to</p>
                  <code className="text-xs bg-gray-200 dark:bg-slate-700 px-2 py-1 rounded block mt-1 break-all">{targetDir}</code>
                  <div className="mt-4 flex gap-2 justify-center">
                    <button onClick={() => navigate('/models')} className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 rounded text-white text-sm">
                      View Models
                    </button>
                    <button
                      onClick={() => { setDownloadState('idle'); setSelectedModel(null) }}
                      className="px-4 py-2 text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-slate-700 rounded text-sm"
                    >
                      Download Another
                    </button>
                  </div>
                </div>
              </div>
            ) : downloadState === 'downloading' ? (
              <div>
                <h3 className="font-bold text-gray-900 dark:text-white mb-2">Downloading...</h3>
                <div className="w-full bg-gray-200 dark:bg-slate-700 rounded-full h-2 mb-3">
                  <div
                    className="bg-indigo-600 h-2 rounded-full transition-all"
                    style={{ width: `${downloadProgress}%` }}
                  />
                </div>
                <p className="text-xs text-gray-500 dark:text-gray-400 mb-2">{downloadProgress.toFixed(1)}%</p>
                <div className="bg-gray-900 dark:bg-slate-950 rounded p-2 max-h-60 overflow-y-auto font-mono text-xs text-green-400">
                  {downloadLogs.slice(-15).map((log, i) => (
                    <div key={i}>{log}</div>
                  ))}
                  <div ref={logEndRef} />
                </div>
                <div className="mt-3 flex gap-2">
                  <button
                    onClick={() => { abortRef.current?.abort(); setDownloadState('idle') }}
                    className="flex-1 px-3 py-1.5 bg-red-600 hover:bg-red-700 rounded text-white text-xs"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={() => cleanupMutation.mutate(targetDir)}
                    disabled={cleanupMutation.isPending}
                    className="px-3 py-1.5 text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 rounded text-xs disabled:opacity-50"
                  >
                    Clean
                  </button>
                </div>
              </div>
            ) : downloadState === 'error' ? (
              <div>
                <h3 className="font-bold text-red-600 dark:text-red-400 mb-2">Download Failed</h3>
                <div className="bg-gray-900 dark:bg-slate-950 rounded p-2 max-h-40 overflow-y-auto font-mono text-xs text-red-400 mb-3">
                  {downloadLogs.slice(-10).map((log, i) => (
                    <div key={i}>{log}</div>
                  ))}
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={() => { setDownloadState('idle'); setDownloadLogs([]) }}
                    className="flex-1 px-3 py-1.5 bg-indigo-600 hover:bg-indigo-700 rounded text-white text-xs"
                  >
                    Retry
                  </button>
                  <button
                    onClick={() => cleanupMutation.mutate(targetDir)}
                    disabled={cleanupMutation.isPending}
                    className="px-3 py-1.5 text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 rounded text-xs"
                  >
                    Clean
                  </button>
                </div>
              </div>
            ) : (
              <div>
                <h3 className="font-bold text-gray-900 dark:text-white mb-1">{selectedModel.id}</h3>
                <p className="text-xs text-gray-500 dark:text-gray-400 mb-3">
                  {formatParams(selectedModel.total_params)} params · {selectedModel.vram_gb.toFixed(1)} GB VRAM · {formatBytes(selectedModel.storage_bytes)}
                </p>

                {/* GPU Selection */}
                <div className="mb-3">
                  <label className="text-xs text-gray-500 dark:text-gray-400 block mb-1">GPUs</label>
                  <div className="flex flex-wrap gap-1">
                    {gpuData?.gpus?.map(g => (
                      <button
                        key={g.index}
                        onClick={() => toggleGpu(g.index)}
                        className={`px-2 py-1 rounded text-xs border transition ${
                          selectedGpus.includes(g.index)
                            ? 'bg-indigo-600 text-white border-indigo-600'
                            : 'bg-white dark:bg-slate-900 text-gray-700 dark:text-gray-300 border-gray-300 dark:border-slate-600'
                        }`}
                      >
                        {g.name} ({g.vram_gb}GB)
                      </button>
                    ))}
                  </div>
                  {selectedGpus.length > 0 && (
                    <p className="text-xs text-gray-400 mt-1">Selected: {selectedGpuVram.toFixed(1)} GB VRAM, TP={selectedGpus.length}</p>
                  )}
                </div>

                {/* Target Dir */}
                <div className="mb-3">
                  <label className="text-xs text-gray-500 dark:text-gray-400 block mb-1">Target Directory</label>
                  <input
                    type="text"
                    value={targetDir}
                    onChange={e => setTargetDir(e.target.value)}
                    placeholder={`${MODELS_DIR || 'MODELS_DIR'}/model-name`}
                    className="w-full px-3 py-2 bg-white dark:bg-slate-900 border border-gray-300 dark:border-slate-600 rounded text-gray-900 dark:text-white text-sm focus:border-indigo-500 focus:outline-none"
                  />
                </div>

                {/* Disk check */}
                {diskData && selectedModel.storage_bytes > diskData.free_bytes && (
                  <p className="text-xs text-red-500 mb-3">
                    Insufficient disk space: need {formatBytes(selectedModel.storage_bytes)}, have {diskData.free_gb} GB free
                  </p>
                )}

                {/* VRAM check */}
                {selectedModel.vram_gb > selectedGpuVram && (
                  <p className="text-xs text-red-500 mb-3">
                    Model needs {selectedModel.vram_gb.toFixed(1)} GB but selected GPUs only have {selectedGpuVram.toFixed(1)} GB
                  </p>
                )}

                <button
                  onClick={startDownload}
                  disabled={
                    downloadState !== 'idle' ||
                    !targetDir ||
                    selectedModel.vram_gb > selectedGpuVram ||
                    (diskData && selectedModel.storage_bytes > diskData.free_bytes)
                  }
                  className="w-full px-4 py-2 bg-indigo-600 hover:bg-indigo-700 rounded text-white text-sm disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  Download Model
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
