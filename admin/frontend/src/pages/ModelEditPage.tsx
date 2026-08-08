import { useState, useMemo, useCallback } from 'react'
import { Link, useLocation, useNavigate, useParams } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '../api/client'
import type { Model, LocalModel, DockerImagesResponse } from '../api/types'
import { useToast } from '../hooks/useToast'
import { parseFlags, serializeFlags, type EnvVar, type FlagPair } from '../utils/flags'
import { SGLANG_FLAGS, SGLANG_FLAG_CATEGORIES, CONTEXT_LENGTH_PRESETS, MAX_OUTPUT_LENGTH_PRESETS } from '../utils/sglangFlags'

// ─── Constants ──────────────────────────────────────────────────────────────

const inputCls =
  'w-full px-3 py-2 bg-white dark:bg-slate-900 border border-gray-300 dark:border-slate-600 rounded text-gray-900 dark:text-white focus:border-indigo-500 focus:outline-none text-sm'

const labelCls = 'text-xs text-gray-500 dark:text-gray-400 block mb-1'

// ─── Sub-components ─────────────────────────────────────────────────────────

function SelectInput({ label, children, value, onChange }: {
  label: string; children: React.ReactNode; value: string; onChange: (v: string) => void
}) {
  return (
    <div>
      <label className={labelCls}>{label}</label>
      <select value={value} onChange={(e) => onChange(e.target.value)} className={inputCls}>{children}</select>
    </div>
  )
}

function KeyValueEditor({ items, onChange, label, placeholderKey, placeholderValue, addLabel, helpText }: {
  items: EnvVar[] | FlagPair[]; onChange: (items: EnvVar[] | FlagPair[]) => void; label: string;
  placeholderKey: string; placeholderValue: string; addLabel: string; helpText?: React.ReactNode
}) {
  const add = useCallback(() => onChange([...items, { key: '', value: '' }]), [items, onChange])
  const remove = useCallback((i: number) => onChange(items.filter((_, idx) => idx !== i)), [items, onChange])
  const update = useCallback((i: number, field: 'key' | 'value', val: string) =>
    onChange(items.map((e, idx) => (idx === i ? { ...e, [field]: val } : e))), [items, onChange])

  return (
    <div className="col-span-3">
      <label className={labelCls}>{label}</label>
      {helpText && <p className="text-[11px] text-gray-400 dark:text-gray-500 mb-2">{helpText}</p>}
      <div className="space-y-2">
        {items.map((item, i) => (
          <div key={i} className="flex items-center gap-2">
            <input type="text" placeholder={placeholderKey} value={item.key}
              onChange={(e) => update(i, 'key', e.target.value)}
              className={`${inputCls} flex-1 ${label === 'Command Flags' ? 'font-mono' : ''}`} />
            <input type="text" placeholder={placeholderValue} value={item.value}
              onChange={(e) => update(i, 'value', e.target.value)}
              className={`${inputCls} flex-1 ${label === 'Command Flags' ? 'font-mono' : ''}`} />
            <button type="button" onClick={() => remove(i)} className="p-1 text-gray-400 hover:text-red-500 transition shrink-0" aria-label="Remove">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        ))}
        <button type="button" onClick={add} className="text-xs text-indigo-600 dark:text-indigo-400 hover:text-indigo-700 transition">
          + {addLabel}
        </button>
      </div>
    </div>
  )
}

function FlagPicker({ onSelect }: { onSelect: (flag: { name: string; type: string; defaultValue?: string; options?: string[] }) => void }) {
  const [open, setOpen] = useState(false)
  const [category, setCategory] = useState(SGLANG_FLAG_CATEGORIES[0] || '')

  return (
    <div className="col-span-3 relative">
      <button type="button" onClick={() => setOpen(!open)}
        className="w-full px-3 py-2 bg-white dark:bg-slate-900 border border-gray-300 dark:border-slate-600 rounded text-gray-900 dark:text-white text-sm text-left hover:border-indigo-400 transition">
        Pick SGLang flag…
      </button>
      {open && (
        <div className="absolute z-50 mt-1 w-full bg-white dark:bg-slate-800 border border-gray-200 dark:border-slate-600 rounded shadow-lg max-h-80 overflow-y-auto">
          <div className="p-2 border-b border-gray-200 dark:border-slate-700">
            <select value={category} onChange={(e) => setCategory(e.target.value)} className={inputCls}>
              {SGLANG_FLAG_CATEGORIES.map((c) => <option key={c}>{c}</option>)}
            </select>
          </div>
          {SGLANG_FLAGS.filter((f) => f.category === category).map((f) => (
            <button key={f.name} type="button" onClick={() => { onSelect(f); setOpen(false) }}
              className="w-full text-left px-3 py-2 hover:bg-gray-100 dark:hover:bg-slate-700 text-sm text-gray-800 dark:text-gray-200 flex items-start gap-2">
              <code className="shrink-0 text-indigo-600 dark:text-indigo-400 font-mono text-xs">{f.name}</code>
              <span className="text-xs text-gray-500 dark:text-gray-400">{f.description}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

// ─── Form state hook ────────────────────────────────────────────────────────

function useModelForm(model: Model | null) {
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

  const buildPayload = useCallback(() => {
    const envObj: Record<string, string> = {}
    envVars.forEach((ev) => { if (ev.key.trim()) envObj[ev.key.trim()] = ev.value })
    return {
      model_id: modelId, name, image, model_path: modelPath,
      context_length: contextLength ? parseInt(contextLength) : undefined,
      max_output_length: maxOutputLength ? parseInt(maxOutputLength) : undefined,
      port: port ? parseInt(port) : 30000,
      container_name: containerName.trim() || `sgfleet-${modelId}`,
      container_alias: containerAlias.trim() || `sgfleet-${modelId}`,
      model_alias: modelAlias,
      grace_period: gracePeriod ? parseInt(gracePeriod) : 10,
      gpu: gpu === 'auto' ? null : gpu,
      environment: envObj,
      command_flags: serializeFlags(commandFlags),
    }
  }, [modelId, name, image, modelPath, contextLength, maxOutputLength, port, containerName, containerAlias, modelAlias, gracePeriod, gpu, envVars, commandFlags])

  return {
    modelId, setModelId, name, setName, image, setImage, modelPath, setModelPath,
    contextLength, setContextLength, maxOutputLength, setMaxOutputLength, port, setPort,
    containerName, setContainerName, containerAlias, setContainerAlias, modelAlias, setModelAlias,
    gracePeriod, setGracePeriod, gpu, setGpu, envVars, setEnvVars, commandFlags, setCommandFlags,
    saving, setSaving, buildPayload,
  }
}

// ─── Page ───────────────────────────────────────────────────────────────────

export default function ModelEditPage() {
  const { modelId } = useParams<{ modelId: string }>()
  const navigate = useNavigate()
  const location = useLocation()
  const queryClient = useQueryClient()
  const showToast = useToast()
  const isNew = !modelId
  const duplicateFrom = (location.state as { duplicateFrom?: string } | null)?.duplicateFrom

  const { data: existingModels = [], isPending: modelsPending } = useQuery({ queryKey: ['models'], queryFn: api.listModels })

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
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['models'] }); showToast('Model created') },
    onError: (e: Error) => showToast(e.message),
  })

  const { mutateAsync: updateModel } = useMutation({
    mutationFn: (vars: { id: string; data: Partial<Model> }) => api.updateModel(vars.id, vars.data),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['models'] }); showToast('Model updated') },
    onError: (e: Error) => showToast(e.message),
  })

  if (!modelLoaded) return <div className="py-8 text-center text-gray-500 dark:text-gray-400">Loading model...</div>
  if (!isNew && !model) return <div className="py-8 text-center text-red-500">Model &quot;{modelId}&quot; not found.</div>

  return (
    <ModelEditForm
      model={model} isNew={isNew} existingModels={existingModels}
      onSubmit={async (data) => {
        if (isNew) await createModel(data)
        else if (model) await updateModel({ id: model.model_id, data })
        navigate('/models')
      }}
      onCancel={() => navigate('/models')}
    />
  )
}

// ─── Form ───────────────────────────────────────────────────────────────────

function ModelEditForm({ model, isNew, existingModels, onSubmit, onCancel }: {
  model: Model | null; isNew: boolean; existingModels: Model[];
  onSubmit: (data: Partial<Model>) => Promise<void>; onCancel: () => void
}) {
  const form = useModelForm(model)
  const showStep2 = !isNew || form.modelPath

  const { data: localModels = [] } = useQuery({ queryKey: ['local-models'], queryFn: api.listLocalModels })
  const { data: dockerData } = useQuery<DockerImagesResponse>({ queryKey: ['docker-images'], queryFn: api.getDockerImages })
  const dockerImages = useMemo(() => dockerData?.images || [], [dockerData])
  const { data: gpuData } = useQuery({ queryKey: ['gpus'], queryFn: api.getGPUs })
  const gpus = useMemo(() => gpuData?.gpus || [], [gpuData])

  const selectedDockerTag = useMemo(() =>
    isNew && form.image ? form.image : '', [form.image, isNew])
  const selectedLocalModel = useMemo(() =>
    isNew && form.modelPath ? form.modelPath : '', [form.modelPath, isNew])

  const handleDockerSelect = useCallback((tag: string) => {
    if (tag === '__custom__') return
    form.setImage(tag)
  }, [form])

  const handleLocalModelSelect = useCallback((lm: LocalModel) => {
    form.setModelPath(lm.container_path)
    form.setModelId(lm.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '') || lm.name)
    form.setName(lm.name)
    if (!form.containerName) form.setContainerName(`sgfleet-${lm.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '')}`)
    if (!form.containerAlias) form.setContainerAlias(`sgfleet-${lm.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '')}`)
  }, [form])

  const handleFlagPick = useCallback((flag: { name: string; type: string; defaultValue?: string }) => {
    const current = form.commandFlags
    if (current.length === 1 && !current[0].key && !current[0].value) {
      form.setCommandFlags([{ key: flag.name, value: flag.defaultValue || '' }])
    } else {
      form.setCommandFlags([...current, { key: flag.name, value: flag.defaultValue || '' }])
    }
  }, [form])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!form.modelId || !form.name || !form.image || !form.modelPath) return
    const conflict = existingModels.find(
      (m) => m.name.trim().toLowerCase() === form.name.trim().toLowerCase() && m.model_id !== (model?.model_id || ''))
    if (conflict) { alert(`A model with the name "${form.name}" already exists.`); return }
    form.setSaving(true)
    try { await onSubmit(form.buildPayload()) } finally { form.setSaving(false) }
  }

  return (
    <div>
      <PageHeader isNew={isNew} modelName={model?.name || model?.model_id} />
      <form onSubmit={handleSubmit} className="bg-gray-50 dark:bg-slate-800 rounded-lg border border-gray-200 dark:border-slate-700 p-4">
        <div className="grid grid-cols-3 gap-4">

          {/* Source selection (Step 1 for new models) */}
          <SelectInput label="Docker Image" value={selectedDockerTag} onChange={handleDockerSelect}>
            <option value="">— pick image —</option>
            {dockerImages.map((img) => <option key={img} value={img}>{img}</option>)}
            <option value="__custom__">⬇ Custom input below</option>
          </SelectInput>
          <div>
            <label className={labelCls}>Docker Image (manual)</label>
            <input type="text" value={form.image} onChange={(e) => form.setImage(e.target.value)}
              className={inputCls} required />
          </div>

          <SelectInput label="Local Model" value={selectedLocalModel} onChange={(v) => {
            const lm = localModels.find((m) => m.container_path === v)
            if (lm) handleLocalModelSelect(lm)
          }}>
            <option value="">— pick model —</option>
            {localModels.map((lm) => <option key={lm.container_path} value={lm.container_path}>{lm.name} ({lm.size_gb.toFixed(1)} GB)</option>)}
            <option value="__custom__">⬇ Custom path below</option>
          </SelectInput>
          <div>
            <label className={labelCls}>Model Path</label>
            <input type="text" value={form.modelPath} onChange={(e) => form.setModelPath(e.target.value)}
              className={inputCls} required placeholder="/models/your-model" />
          </div>

          {isNew && !showStep2 && (
            <div className="col-span-3 flex items-center gap-2 text-xs text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-900/20 rounded p-2">
              <svg className="w-4 h-4 shrink-0" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
              </svg>
              Select a Docker image and local model path to continue. The remaining fields will appear below.
            </div>
          )}

          {/* Step 2 fields (always visible in edit mode, conditional in new mode) */}
          <div className={!isNew || showStep2 ? '' : 'hidden'}>
            <label className={labelCls}>Model ID <span className="text-red-500">*</span></label>
            <input type="text" value={form.modelId} onChange={(e) => form.setModelId(e.target.value)}
              className={inputCls} required readOnly={!isNew} disabled={!isNew} />
          </div>
          <div className={!isNew || showStep2 ? '' : 'hidden'}>
            <label className={labelCls}>Name <span className="text-red-500">*</span></label>
            <input type="text" value={form.name} onChange={(e) => form.setName(e.target.value)}
              className={inputCls} required />
          </div>

          {(!isNew || showStep2) && (
            <SelectInput label="Context Length" value={form.contextLength}
              onChange={(e) => form.setContextLength(e)}>
              <option value="">auto</option>
              {CONTEXT_LENGTH_PRESETS.map((p) => <option key={p.value} value={p.value.toString()}>{p.label}</option>)}
            </SelectInput>
          )}
          {(!isNew || showStep2) && (
            <SelectInput label="Max Output Length" value={form.maxOutputLength}
              onChange={(e) => form.setMaxOutputLength(e)}>
              <option value="">default</option>
              {MAX_OUTPUT_LENGTH_PRESETS.map((p) => <option key={p.value} value={p.value.toString()}>{p.label}</option>)}
            </SelectInput>
          )}
          <div className={!isNew || showStep2 ? '' : 'hidden'}>
            <label className={labelCls}>Port</label>
            <input type="number" value={form.port} onChange={(e) => form.setPort(e.target.value)} className={inputCls} />
          </div>

          <div className={!isNew || showStep2 ? '' : 'hidden'}>
            <label className={labelCls}>Container Name</label>
            <input type="text" value={form.containerName} onChange={(e) => form.setContainerName(e.target.value)}
              className={inputCls} placeholder={form.modelId ? `sgfleet-${form.modelId}` : 'sgfleet-<model-id>'} />
          </div>
          <div className={!isNew || showStep2 ? '' : 'hidden'}>
            <label className={labelCls}>Container Alias</label>
            <input type="text" value={form.containerAlias} onChange={(e) => form.setContainerAlias(e.target.value)}
              className={inputCls} placeholder={form.modelId ? `sgfleet-${form.modelId}` : 'sgfleet-<model-id>'} />
          </div>

          <div className={!isNew || showStep2 ? '' : 'hidden'}>
            <label className={labelCls}>Model Alias</label>
            <input type="text" value={form.modelAlias} onChange={(e) => form.setModelAlias(e.target.value)} className={inputCls} />
          </div>
          <div className={!isNew || showStep2 ? '' : 'hidden'}>
            <label className={labelCls}>Grace Period (s)</label>
            <input type="number" value={form.gracePeriod} onChange={(e) => form.setGracePeriod(e.target.value)} className={inputCls} />
          </div>

          {(!isNew || showStep2) && (
            <SelectInput label="GPU" value={form.gpu || 'auto'}
              onChange={(e) => form.setGpu(e)}>
              <option value="auto">auto (all GPUs)</option>
              {gpus.map((g) => <option key={g.index} value={g.index.toString()}>{g.name} ({g.vram_gb} GB)</option>)}
            </SelectInput>
          )}

          {(!isNew || showStep2) && (
            <>
              <KeyValueEditor label="Environment Variables" items={form.envVars} onChange={form.setEnvVars}
                placeholderKey="KEY" placeholderValue="VALUE" addLabel="Add variable" />

              <label className="col-span-3 text-xs text-gray-500 dark:text-gray-400 block mb-1">Command Flags</label>
              <p className="col-span-3 text-[11px] text-gray-400 dark:text-gray-500 mb-2">
                Each row is one flag. Put the flag name (e.g. <code>--context-length</code>) in the left field and
                its argument (e.g. <code>170124</code>) in the right field. Boolean flags leave the value empty.
              </p>
              <FlagPicker onSelect={handleFlagPick} />
              <div className="col-span-3">
                <div className="space-y-2">
                  {form.commandFlags.map((f, i) => (
                    <div key={i} className="flex items-center gap-2">
                      <input type="text" placeholder="--flag" value={f.key}
                        onChange={(e) => { const next = [...form.commandFlags]; next[i] = { ...f, key: e.target.value }; form.setCommandFlags(next) }}
                        className={`${inputCls} flex-1 font-mono`} />
                      <input type="text" placeholder="value (optional)" value={f.value}
                        onChange={(e) => { const next = [...form.commandFlags]; next[i] = { ...f, value: e.target.value }; form.setCommandFlags(next) }}
                        className={`${inputCls} flex-1 font-mono`} />
                      <button type="button" onClick={() => form.setCommandFlags(form.commandFlags.filter((_, idx) => idx !== i))}
                        className="p-1 text-gray-400 hover:text-red-500 transition shrink-0" aria-label="Remove">
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                        </svg>
                      </button>
                    </div>
                  ))}
                  <button type="button" onClick={() => form.setCommandFlags([...form.commandFlags, { key: '', value: '' }])}
                    className="text-xs text-indigo-600 dark:text-indigo-400 hover:text-indigo-700 transition">
                    + Add flag
                  </button>
                </div>
              </div>
            </>
          )}
        </div>

        <div className="flex justify-end gap-2 pt-4 mt-4 border-t border-gray-200 dark:border-slate-700">
          <button type="button" onClick={onCancel} disabled={form.saving}
            className="px-4 py-2 text-sm rounded bg-gray-100 dark:bg-slate-700 hover:bg-gray-200 dark:hover:bg-slate-600 text-gray-700 dark:text-gray-300 transition disabled:opacity-50">
            Cancel
          </button>
          <button type="submit" disabled={form.saving}
            className="px-4 py-2 text-sm rounded bg-indigo-600 hover:bg-indigo-700 text-white font-medium transition disabled:opacity-50">
            {form.saving ? 'Saving\u2026' : isNew ? 'Create' : 'Save'}
          </button>
        </div>
      </form>
    </div>
  )
}

// ─── Header ─────────────────────────────────────────────────────────────────

function PageHeader({ isNew, modelName }: { isNew: boolean; modelName?: string }) {
  return (
    <>
      <div className="mb-3">
        <Link to="/models" className="inline-flex items-center gap-1.5 text-sm text-gray-500 dark:text-gray-400 hover:text-gray-800 dark:hover:text-gray-200 transition">
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
          Back to Models
        </Link>
      </div>
      <nav aria-label="Breadcrumb" className="mb-4 text-xs text-gray-500 dark:text-gray-400">
        <ol className="flex items-center gap-1.5">
          <li><Link to="/models" className="hover:text-gray-800 dark:hover:text-gray-200 transition">Models</Link></li>
          <li aria-hidden>/</li>
          <li className="text-gray-800 dark:text-gray-200 font-medium">{isNew ? 'New Model' : `Edit: ${modelName}`}</li>
        </ol>
      </nav>
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-xl font-semibold text-gray-900 dark:text-white">{isNew ? 'Add Model' : 'Edit Model'}</h1>
      </div>
    </>
  )
}
