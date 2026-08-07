import { useState, useMemo } from 'react'
import { Link, useLocation, useNavigate, useParams } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '../api/client'
import type { Model } from '../api/types'
import { useToast } from '../hooks/useToast'
import { parseFlags, serializeFlags, type EnvVar, type FlagPair } from '../utils/flags'

export default function ModelEditPage() {
  const { modelId } = useParams<{ modelId: string }>()
  const navigate = useNavigate()
  const location = useLocation()
  const queryClient = useQueryClient()
  const showToast = useToast()
  const isNew = !modelId
  const duplicateFrom = (location.state as { duplicateFrom?: string } | null)?.duplicateFrom

  const { data: existingModels = [], isPending: modelsPending } = useQuery<Model[], Error>({
    queryKey: ['models'],
    queryFn: api.listModels,
  })

  const model = useMemo(() => {
    if (!isNew) return existingModels.find((m) => m.model_id === modelId) || null
    if (duplicateFrom) {
      const src = existingModels.find((m) => m.model_id === duplicateFrom)
      if (src) return { ...src, model_id: '', name: `${src.name} (copy)`, container_name: '', container_alias: '' }
    }
    return null
  }, [existingModels, modelId, isNew, duplicateFrom])

  const modelLoaded = !modelsPending

  const { mutateAsync: createModel } = useMutation({
    mutationFn: (data: Partial<Model>) => api.createModel(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['models'] })
      showToast('Model created')
    },
    onError: (e: Error) => showToast(e.message),
  })

  const { mutateAsync: updateModel } = useMutation({
    mutationFn: (vars: { id: string; data: Partial<Model> }) => api.updateModel(vars.id, vars.data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['models'] })
      showToast('Model updated')
    },
    onError: (e: Error) => showToast(e.message),
  })

  if (!modelLoaded) {
    return (
      <div className="py-8 text-center text-gray-500 dark:text-gray-400">Loading model...</div>
    )
  }
  if (!isNew && !model) {
    return (
      <div className="py-8 text-center text-red-500">Model &quot;{modelId}&quot; not found.</div>
    )
  }

  return <ModelEditForm model={model} isNew={isNew} existingModels={existingModels} onSubmit={async (data) => {
    if (isNew) {
      await createModel(data)
    } else if (model) {
      await updateModel({ id: model.model_id, data })
    }
    navigate('/models')
  }} onCancel={() => navigate('/models')} />
}

function ModelEditForm({
  model,
  isNew,
  existingModels,
  onSubmit,
  onCancel,
}: {
  model: Model | null
  isNew: boolean
  existingModels: Model[]
  onSubmit: (data: Partial<Model>) => Promise<void>
  onCancel: () => void
}) {
  const [modelId, setModelId] = useState(model?.model_id || '')
  const [name, setName] = useState(model?.name || '')
  const [image, setImage] = useState(model?.image || 'lmsysorg/sglang:v0.5.16')
  const [modelPath, setModelPath] = useState(model?.model_path || '')
  const [contextLength, setContextLength] = useState(model?.context_length?.toString() || '')
  const [maxOutputLength, setMaxOutputLength] = useState(model?.max_output_length?.toString() || '')
  const [port, setPort] = useState(model?.port?.toString() || '30000')
  const [containerName, setContainerName] = useState(model?.container_name || '')
  const [containerAlias, setContainerAlias] = useState(model?.container_alias || '')
  const [modelAlias, setModelAlias] = useState(model?.model_alias || 'sgfleet-api-model')
  const [gracePeriod, setGracePeriod] = useState(model?.grace_period?.toString() || '10')
  const [gpu, setGpu] = useState(model?.gpu || 'auto')
  const [envVars, setEnvVars] = useState<EnvVar[]>(
    model?.environment && Object.keys(model.environment).length > 0
      ? Object.entries(model.environment).map(([k, v]) => ({ key: k, value: v }))
      : [{ key: '', value: '' }],
  )
  const [commandFlags, setCommandFlags] = useState<FlagPair[]>(parseFlags(model?.command_flags))
  const [saving, setSaving] = useState(false)

  const addEnvRow = () => setEnvVars((p) => [...p, { key: '', value: '' }])
  const removeEnvRow = (i: number) => setEnvVars((p) => p.filter((_, idx) => idx !== i))
  const updateEnvRow = (i: number, field: 'key' | 'value', val: string) =>
    setEnvVars((p) => p.map((e, idx) => (idx === i ? { ...e, [field]: val } : e)))

  const addFlag = () => setCommandFlags((p) => [...p, { key: '', value: '' }])
  const removeFlag = (i: number) => setCommandFlags((p) => p.filter((_, idx) => idx !== i))
  const updateFlag = (i: number, field: 'key' | 'value', val: string) =>
    setCommandFlags((p) => p.map((f, idx) => (idx === i ? { ...f, [field]: val } : f)))

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!modelId || !name || !image || !modelPath) return
    const conflict = existingModels.find(
      (m) => m.name.trim().toLowerCase() === name.trim().toLowerCase() && m.model_id !== (model?.model_id || ''),
    )
    if (conflict) {
      alert(`A model with the name "${name}" already exists.`)
      return
    }
    const envObj: Record<string, string> = {}
    envVars.forEach((ev) => {
      if (ev.key.trim()) envObj[ev.key.trim()] = ev.value
    })
    const flags = serializeFlags(commandFlags)
    const finalContainerName = containerName.trim() || `sgfleet-${modelId}`
    const finalContainerAlias = containerAlias.trim() || `sgfleet-${modelId}`
    setSaving(true)
    try {
      await onSubmit({
        model_id: modelId,
        name,
        image,
        model_path: modelPath,
        context_length: contextLength ? parseInt(contextLength) : undefined,
        max_output_length: maxOutputLength ? parseInt(maxOutputLength) : undefined,
        port: port ? parseInt(port) : 30000,
        container_name: finalContainerName,
        container_alias: finalContainerAlias,
        model_alias: modelAlias,
        grace_period: gracePeriod ? parseInt(gracePeriod) : 10,
        gpu: gpu === 'auto' ? null : gpu,
        environment: envObj,
        command_flags: flags,
      })
    } finally {
      setSaving(false)
    }
  }

  const label = 'text-xs text-gray-500 dark:text-gray-400 block mb-1'
  const input =
    'w-full px-3 py-2 bg-white dark:bg-slate-900 border border-gray-300 dark:border-slate-600 rounded text-gray-900 dark:text-white focus:border-indigo-500 focus:outline-none text-sm'

  return (
    <div>
      {/* Back link (top-left) */}
      <div className="mb-3">
        <Link
          to="/models"
          className="inline-flex items-center gap-1.5 text-sm text-gray-500 dark:text-gray-400 hover:text-gray-800 dark:hover:text-gray-200 transition"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
          Back to Models
        </Link>
      </div>

      {/* Breadcrumbs */}
      <nav aria-label="Breadcrumb" className="mb-4 text-xs text-gray-500 dark:text-gray-400">
        <ol className="flex items-center gap-1.5">
          <li>
            <Link to="/models" className="hover:text-gray-800 dark:hover:text-gray-200 transition">
              Models
            </Link>
          </li>
          <li aria-hidden>/</li>
          <li className="text-gray-800 dark:text-gray-200 font-medium">
            {isNew ? 'New Model' : `Edit: ${model?.name || model?.model_id}`}
          </li>
        </ol>
      </nav>

      <div className="flex items-center justify-between mb-4">
        <h1 className="text-xl font-semibold text-gray-900 dark:text-white">
          {isNew ? 'Add Model' : `Edit Model`}
        </h1>
      </div>

      <form
        onSubmit={handleSubmit}
        className="bg-gray-50 dark:bg-slate-800 rounded-lg border border-gray-200 dark:border-slate-700 p-4 space-y-4"
      >
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className={label}>Model ID *</label>
            <input
              type="text"
              value={modelId}
              onChange={(e) => setModelId(e.target.value)}
              className={input}
              required
              readOnly={!isNew}
              disabled={!isNew}
            />
          </div>
          <div>
            <label className={label}>Name *</label>
            <input type="text" value={name} onChange={(e) => setName(e.target.value)} className={input} required />
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className={label}>Docker Image *</label>
            <input type="text" value={image} onChange={(e) => setImage(e.target.value)} className={input} required />
          </div>
          <div>
            <label className={label}>Model Path *</label>
            <input type="text" value={modelPath} onChange={(e) => setModelPath(e.target.value)} className={input} required />
          </div>
        </div>
        <div className="grid grid-cols-3 gap-3">
          <div>
            <label className={label}>Context Length</label>
            <input type="number" value={contextLength} onChange={(e) => setContextLength(e.target.value)} className={input} />
          </div>
          <div>
            <label className={label}>Max Output Length</label>
            <input type="number" value={maxOutputLength} onChange={(e) => setMaxOutputLength(e.target.value)} className={input} />
          </div>
          <div>
            <label className={label}>Port</label>
            <input type="number" value={port} onChange={(e) => setPort(e.target.value)} className={input} />
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className={label}>Container Name</label>
            <input
              type="text"
              placeholder={modelId ? `sgfleet-${modelId}` : 'sgfleet-<model-id>'}
              value={containerName}
              onChange={(e) => setContainerName(e.target.value)}
              className={input}
            />
          </div>
          <div>
            <label className={label}>Container Alias</label>
            <input
              type="text"
              placeholder={modelId ? `sgfleet-${modelId}` : 'sgfleet-<model-id>'}
              value={containerAlias}
              onChange={(e) => setContainerAlias(e.target.value)}
              className={input}
            />
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className={label}>Model Alias</label>
            <input type="text" value={modelAlias} onChange={(e) => setModelAlias(e.target.value)} className={input} />
          </div>
          <div>
            <label className={label}>Grace Period (s)</label>
            <input type="number" value={gracePeriod} onChange={(e) => setGracePeriod(e.target.value)} className={input} />
          </div>
        </div>
        <div>
          <label className={label}>GPU</label>
          <select value={gpu || 'auto'} onChange={(e) => setGpu(e.target.value)} className={input}>
            <option value="auto">auto (all GPUs)</option>
            <option value="0">GPU 0</option>
            <option value="1">GPU 1</option>
            <option value="2">GPU 2</option>
            <option value="3">GPU 3</option>
          </select>
        </div>

        <div>
          <label className={label}>Environment Variables</label>
          <div className="space-y-2">
            {envVars.map((ev, i) => (
              <div key={i} className="flex items-center gap-2">
                <input
                  type="text"
                  placeholder="KEY"
                  value={ev.key}
                  onChange={(e) => updateEnvRow(i, 'key', e.target.value)}
                  className={`${input} flex-1`}
                />
                <input
                  type="text"
                  placeholder="VALUE"
                  value={ev.value}
                  onChange={(e) => updateEnvRow(i, 'value', e.target.value)}
                  className={`${input} flex-1`}
                />
                <button
                  type="button"
                  onClick={() => removeEnvRow(i)}
                  className="p-1 text-gray-400 hover:text-red-500 transition"
                  aria-label="Remove"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
            ))}
            <button
              type="button"
              onClick={addEnvRow}
              className="text-xs text-indigo-600 dark:text-indigo-400 hover:text-indigo-700 transition"
            >
              + Add variable
            </button>
          </div>
        </div>

        <div>
          <label className={label}>Command Flags</label>
          <p className="text-[11px] text-gray-400 dark:text-gray-500 mb-2">
            Each row is one flag. Put the flag name (e.g. <code>--context-length</code>) in the left field and
            its argument (e.g. <code>170124</code>) in the right field. Boolean flags leave the value empty.
          </p>
          <div className="space-y-2">
            {commandFlags.map((f, i) => (
              <div key={i} className="flex items-center gap-2">
                <input
                  type="text"
                  placeholder="--flag"
                  value={f.key}
                  onChange={(e) => updateFlag(i, 'key', e.target.value)}
                  className={`${input} flex-1 font-mono`}
                />
                <input
                  type="text"
                  placeholder="value (optional)"
                  value={f.value}
                  onChange={(e) => updateFlag(i, 'value', e.target.value)}
                  className={`${input} flex-1 font-mono`}
                />
                <button
                  type="button"
                  onClick={() => removeFlag(i)}
                  className="p-1 text-gray-400 hover:text-red-500 transition"
                  aria-label="Remove"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
            ))}
            <button
              type="button"
              onClick={addFlag}
              className="text-xs text-indigo-600 dark:text-indigo-400 hover:text-indigo-700 transition"
            >
              + Add flag
            </button>
          </div>
        </div>

        {/* Save / Cancel buttons at bottom */}
        <div className="flex justify-end gap-2 pt-4 border-t border-gray-200 dark:border-slate-700">
          <button
            type="button"
            onClick={onCancel}
            disabled={saving}
            className="px-4 py-2 text-sm rounded bg-gray-100 dark:bg-slate-700 hover:bg-gray-200 dark:hover:bg-slate-600 text-gray-700 dark:text-gray-300 transition disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={saving}
            className="px-4 py-2 text-sm rounded bg-indigo-600 hover:bg-indigo-700 text-white font-medium transition disabled:opacity-50"
          >
            {saving ? 'Saving…' : isNew ? 'Create' : 'Save'}
          </button>
        </div>
      </form>
    </div>
  )
}


