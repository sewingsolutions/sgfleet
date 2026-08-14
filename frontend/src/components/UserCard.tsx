import { useMemo, useState } from 'react'
import { useUpdateUserMutation, useRotateKeyMutation, useDeleteUserMutation } from '../hooks/useUsers'
import { useToast } from '../hooks/useToast'
import { useConfirm } from '../hooks/useConfirm'
import ConfigModal from './ConfigModal'
import type { User, Model } from '../api/types'

function fmt(n: number | null | undefined) {
  if (n == null || n === 0) return '0'
  const abs = Math.abs(n)
  if (abs >= 1_000_000) return (n / 1_000_000).toFixed(abs % 1_000_000 === 0 ? 0 : 1) + 'M'
  if (abs >= 1_000) return (n / 1_000).toFixed(abs % 1_000 === 0 ? 0 : 1) + 'k'
  return n.toLocaleString()
}

interface UserCardProps {
  user: User
  checked?: boolean
  onToggleCheck?: () => void
  modelAccess?: Model[]
  defaultModel?: Model | null
  allModels?: Model[]
  onDefaultModelChange?: (modelId: string | null) => void
}

interface Draft {
  name: string
  rate_limit: number
  max_concurrent: number
  request_cost: number
  daily_quota: string
  email: string
  notes: string
  default_model_id: string
}

export default function UserCard({ user: initialUser, checked, onToggleCheck, modelAccess, defaultModel, allModels, onDefaultModelChange }: UserCardProps) {
  const [user, setUser] = useState<User>(initialUser)
  const [expanded, setExpanded] = useState(false)
  const [showKey, setShowKey] = useState('')
  const [showConfigModal, setShowConfigModal] = useState(false)
  const [saving, setSaving] = useState(false)
  const [draft, setDraft] = useState<Draft | null>(null)
  const showToast = useToast()
  const confirmAction = useConfirm()
  const { mutateAsync: updateUser } = useUpdateUserMutation()
  const { mutateAsync: rotateKey } = useRotateKeyMutation()
  const { mutateAsync: deleteUser } = useDeleteUserMutation()

  const userWithFreshStats = useMemo(
    () => ({ ...user, today_requests: initialUser.today_requests }),
    [user, initialUser.today_requests],
  )

  const openEdit = () => {
    setDraft({
      name: user.name,
      rate_limit: user.rate_limit,
      max_concurrent: user.max_concurrent,
      request_cost: user.request_cost ?? 0.001,
      daily_quota: user.daily_quota?.toString() ?? '',
      email: user.email ?? '',
      notes: user.notes ?? '',
      default_model_id: defaultModel?.model_id ?? '',
    })
    setExpanded(true)
  }

  const ensureDraft = () => {
    if (draft) return draft
    const initial: Draft = {
      name: user.name,
      rate_limit: user.rate_limit,
      max_concurrent: user.max_concurrent,
      request_cost: user.request_cost ?? 0.001,
      daily_quota: user.daily_quota?.toString() ?? '',
      email: user.email ?? '',
      notes: user.notes ?? '',
      default_model_id: defaultModel?.model_id ?? '',
    }
    setDraft(initial)
    return initial
  }

  const handleSave = async () => {
    if (!draft) return
    setSaving(true)
    const payload: Record<string, unknown> = {}
    const trimmedName = draft.name.trim()
    if (trimmedName && trimmedName !== user.name) payload.name = trimmedName
    if (draft.rate_limit !== user.rate_limit) payload.rate_limit = draft.rate_limit
    if (draft.max_concurrent !== user.max_concurrent) payload.max_concurrent = draft.max_concurrent
    if (draft.request_cost !== (user.request_cost ?? 0.001)) payload.request_cost = draft.request_cost
    const newQuota = draft.daily_quota === '' ? null : parseInt(draft.daily_quota)
    const parsedQuota = isNaN(newQuota ?? 0) ? null : newQuota
    if (parsedQuota !== user.daily_quota) payload.daily_quota = parsedQuota
    if (draft.email !== (user.email ?? '')) payload.email = draft.email || null
    if (draft.notes !== (user.notes ?? '')) payload.notes = draft.notes || null
    if (draft.default_model_id !== (defaultModel?.model_id ?? '')) {
      await onDefaultModelChange?.(draft.default_model_id || null)
    }
    if (Object.keys(payload).length > 0) {
      try {
        await updateUser({ id: user.id, data: payload })
        setUser((prev) => ({ ...prev, ...payload }))
      } catch (e) {
        showToast(e instanceof Error ? e.message : 'Failed to save changes')
      }
    }
    setSaving(false)
    setDraft(null)
  }

  const handleCancel = () => {
    setDraft(null)
    setExpanded(false)
  }

  const handleToggle = async () => {
    await updateUser({ id: user.id, data: { is_active: !user.is_active } })
    setUser((prev) => ({ ...prev, is_active: !prev.is_active }))
  }

  const handleRotate = async () => {
    const result = await rotateKey(user.id)
    setShowKey(result.api_key)
  }

  const handleDelete = async () => {
    if (!await confirmAction(`Delete ${user.name}?`, true)) return
    await deleteUser(user.id)
  }

  const today = userWithFreshStats.today_requests ?? 0
  const quotaPct = userWithFreshStats.daily_quota
    ? (today / userWithFreshStats.daily_quota) * 100
    : null
  const quotaColor =
    quotaPct !== null
      ? quotaPct >= 100
        ? 'bg-red-500'
        : quotaPct >= 80
          ? 'bg-amber-500'
          : 'bg-emerald-500'
      : ''

  return (
    <div className="bg-gray-50 dark:bg-slate-800 rounded-lg border border-gray-200 dark:border-slate-700 overflow-hidden">
      <div className="flex items-start justify-between p-4 pb-2">
        <div className="flex items-start gap-3">
          {onToggleCheck && (
            <button
              onClick={onToggleCheck}
              className="mt-1 w-4 h-4 rounded border flex items-center justify-center shrink-0 transition "
              style={{ borderColor: checked ? '#6366f1' : '#475569', backgroundColor: checked ? '#6366f1' : 'transparent' }}
            >
              {checked && <svg className="w-3 h-3 text-gray-900 dark:text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" /></svg>}
            </button>
          )}
          <div>
            <div className="flex items-center gap-2">
              <h3 className="font-medium text-gray-900 dark:text-white text-lg">{user.name}</h3>
              <button
                onClick={openEdit}
                className="text-gray-400 dark:text-gray-500 hover:text-gray-700 dark:hover:text-gray-300 transition"
                title="Edit user"
              >
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L9.5 21.036H5.464v-3.536L16.732 5.232z" /></svg>
              </button>
            </div>
            {user.email && <p className="text-xs text-gray-400 dark:text-gray-500">{user.email}</p>}
            <span className={`px-2 py-0.5 rounded text-xs font-medium ${user.is_active ? 'bg-emerald-50 dark:bg-emerald-900/50 text-emerald-700 dark:text-emerald-300' : 'bg-red-50 dark:bg-red-900/50 text-red-700 dark:text-red-300'}`}>
              {user.is_active ? 'Active' : 'Inactive'}
            </span>
            <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">Created {user.created_at?.slice(0, 10)}</p>
          </div>
        </div>
        <button
          onClick={() => setExpanded(!expanded)}
          className="text-gray-500 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white transition p-1"
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
          </svg>
        </button>
      </div>

      <div className="px-4 pb-3">
        <div className="grid grid-cols-3 gap-3 text-sm">
          <div>
            <p className="text-gray-400 dark:text-gray-500 text-xs">Rate/s</p>
            <p className="text-gray-900 dark:text-white font-medium">{user.rate_limit}</p>
          </div>
          <div>
            <p className="text-gray-400 dark:text-gray-500 text-xs">Concurrent</p>
            <p className="text-gray-900 dark:text-white font-medium">{user.max_concurrent}</p>
          </div>
          <div>
            <p className="text-gray-400 dark:text-gray-500 text-xs">Total requests</p>
            <p className="text-gray-900 dark:text-white font-medium">{fmt(user.total_requests ?? 0)}</p>
          </div>
        </div>

        <div className="mt-3">
          <div className="flex items-center justify-between text-sm mb-1">
            <span className="text-gray-500 dark:text-gray-400">
              {userWithFreshStats.daily_quota
                ? `${fmt(today)} / ${fmt(userWithFreshStats.daily_quota)} today`
                : `${fmt(today)} today`}
            </span>
            {quotaPct !== null && (
              <span className={`text-xs font-medium ${
                quotaPct >= 100 ? 'text-red-600 dark:text-red-400' : quotaPct >= 80 ? 'text-amber-700 dark:text-amber-300' : 'text-emerald-700 dark:text-emerald-300'
              }`}>
                {Math.round(quotaPct)}%
              </span>
            )}
          </div>
          {userWithFreshStats.daily_quota && (
            <div className="w-full bg-gray-200 dark:bg-slate-700 rounded-full h-1.5">
              <div
                className={`h-1.5 rounded-full transition-all ${quotaColor}`}
                style={{ width: `${Math.min(quotaPct ?? 0, 100)}%` }}
              />
            </div>
          )}
        </div>
      </div>

      <div className="px-4 pb-3">
        <div className="flex items-center gap-2 text-sm">
          <span className="text-gray-400 dark:text-gray-500 text-xs">Quota</span>
          <span className="text-gray-700 dark:text-gray-300">{user.daily_quota != null ? fmt(user.daily_quota) : 'Unlimited'}</span>
        </div>
      </div>

      {modelAccess && modelAccess.length > 0 && (
        <div className="px-4 pb-3">
          <div className="flex flex-wrap gap-1.5">
            {modelAccess.map((m) => (
              <span key={m.id} className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium ${defaultModel?.model_id === m.model_id ? 'bg-indigo-100 dark:bg-indigo-900/50 text-indigo-700 dark:text-indigo-300' : 'bg-gray-200 dark:bg-slate-700 text-gray-600 dark:text-gray-300'}`}>
                {m.name}
                {defaultModel?.model_id === m.model_id && <span className="text-[10px] opacity-70">default</span>}
              </span>
            ))}
          </div>
        </div>
      )}

      <div className="px-4 pb-4 flex flex-wrap gap-2">
        <button
          onClick={handleToggle}
          className="flex items-center gap-1.5 px-3 py-1 text-xs rounded transition bg-gray-100 dark:bg-slate-700 hover:bg-gray-200 dark:hover:bg-slate-600 text-gray-700 dark:text-gray-300 hover:text-gray-900 dark:hover:text-white"
        >
          {user.is_active ? (
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728L5.636 5.636m12.728 0A9 9 0 015.636 18.364m0 0L18.364 5.636" /></svg>
          ) : (
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
          )}
          {user.is_active ? 'Disable' : 'Enable'}
        </button>
        <button onClick={handleRotate}           className="flex items-center gap-1.5 px-3 py-1 text-xs rounded transition bg-gray-100 dark:bg-slate-700 hover:bg-gray-200 dark:hover:bg-slate-600 text-gray-700 dark:text-gray-300 hover:text-gray-900 dark:hover:text-white">
          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" /></svg>
          Rotate Key
        </button>
        <button onClick={() => setShowConfigModal(true)} className="flex items-center gap-1.5 px-3 py-1 text-xs rounded transition bg-gray-100 dark:bg-slate-700 hover:bg-gray-200 dark:hover:bg-slate-600 text-gray-700 dark:text-gray-300 hover:text-gray-900 dark:hover:text-white">
          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /></svg>
          Config
        </button>
        <button onClick={handleDelete}           className="flex items-center gap-1.5 px-3 py-1 text-xs rounded transition bg-gray-100 dark:bg-slate-700 hover:bg-red-50 dark:hover:bg-red-900/50 text-gray-700 dark:text-gray-300 hover:text-red-700 dark:hover:text-red-300">
          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
          Delete
        </button>
      </div>

      {expanded && (
        <div className="border-t border-gray-200 dark:border-slate-700 px-4 py-4 space-y-3">
          <p className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Edit settings</p>
          <div>
            <label className="text-xs text-gray-400 dark:text-gray-500 block mb-1">Name</label>
            <input
              type="text"
              value={draft?.name ?? user.name}
              onChange={(e) => setDraft({ ...ensureDraft(), name: e.target.value })}
              className="w-full px-3 py-2 bg-white dark:bg-slate-900 border border-gray-300 dark:border-slate-600 rounded text-gray-900 dark:text-white text-center focus:border-indigo-500 focus:outline-none text-sm"
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-gray-400 dark:text-gray-500 block mb-1">Rate/s</label>
              <input
                type="number"
                value={draft?.rate_limit ?? user.rate_limit}
                min={0.5}
                max={20}
                step={0.5}
                onChange={(e) => setDraft({ ...ensureDraft(), rate_limit: parseFloat(e.target.value) || 0 })}
                className="w-full px-3 py-2 bg-white dark:bg-slate-900 border border-gray-300 dark:border-slate-600 rounded text-gray-900 dark:text-white text-center focus:border-indigo-500 focus:outline-none text-sm"
              />
            </div>
            <div>
              <label className="text-xs text-gray-400 dark:text-gray-500 block mb-1">Concurrent</label>
              <input
                type="number"
                value={draft?.max_concurrent ?? user.max_concurrent}
                min={1}
                max={10}
                onChange={(e) => setDraft({ ...ensureDraft(), max_concurrent: parseInt(e.target.value) || 1 })}
                className="w-full px-3 py-2 bg-white dark:bg-slate-900 border border-gray-300 dark:border-slate-600 rounded text-gray-900 dark:text-white text-center focus:border-indigo-500 focus:outline-none text-sm"
              />
            </div>
            <div>
              <label className="text-xs text-gray-400 dark:text-gray-500 block mb-1">Cost/req ($)</label>
              <input
                type="number"
                value={draft?.request_cost ?? (user.request_cost ?? 0.001)}
                min={0.0001}
                max={1}
                step={0.0001}
                onChange={(e) => setDraft({ ...ensureDraft(), request_cost: parseFloat(e.target.value) || 0 })}
                className="w-full px-3 py-2 bg-white dark:bg-slate-900 border border-gray-300 dark:border-slate-600 rounded text-gray-900 dark:text-white text-center focus:border-indigo-500 focus:outline-none text-sm"
              />
            </div>
            <div>
              <label className="text-xs text-gray-400 dark:text-gray-500 block mb-1">Daily quota</label>
              <input
                type="number"
                value={draft?.daily_quota ?? (user.daily_quota?.toString() ?? '')}
                placeholder="Unlimited"
                min={1}
                onChange={(e) => setDraft({ ...ensureDraft(), daily_quota: e.target.value })}
                className="w-full px-3 py-2 bg-white dark:bg-slate-900 border border-gray-300 dark:border-slate-600 rounded text-gray-900 dark:text-white text-center focus:border-indigo-500 focus:outline-none placeholder-gray-400 dark:placeholder-gray-500 text-sm"
              />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-gray-400 dark:text-gray-500 block mb-1">Email</label>
              <input
                type="email"
                value={draft?.email ?? (user.email ?? '')}
                placeholder="user@example.com"
                onChange={(e) => setDraft({ ...ensureDraft(), email: e.target.value })}
                className="w-full px-3 py-2 bg-white dark:bg-slate-900 border border-gray-300 dark:border-slate-600 rounded text-gray-900 dark:text-white text-center focus:border-indigo-500 focus:outline-none placeholder-gray-400 dark:placeholder-gray-500 text-sm"
              />
            </div>
            <div>
              <label className="text-xs text-gray-400 dark:text-gray-500 block mb-1">Notes</label>
              <input
                type="text"
                value={draft?.notes ?? (user.notes ?? '')}
                placeholder="Internal notes..."
                onChange={(e) => setDraft({ ...ensureDraft(), notes: e.target.value })}
                className="w-full px-3 py-2 bg-white dark:bg-slate-900 border border-gray-300 dark:border-slate-600 rounded text-gray-900 dark:text-white text-center focus:border-indigo-500 focus:outline-none placeholder-gray-400 dark:placeholder-gray-500 text-sm"
              />
            </div>
          </div>
          {allModels && allModels.length > 0 && (
            <div>
              <label className="text-xs text-gray-400 dark:text-gray-500 block mb-1">Default Model</label>
              <select
                value={draft?.default_model_id ?? (defaultModel?.model_id ?? '')}
                onChange={(e) => setDraft({ ...ensureDraft(), default_model_id: e.target.value })}
                className="w-full px-3 py-2 bg-white dark:bg-slate-900 border border-gray-300 dark:border-slate-600 rounded text-gray-900 dark:text-white text-center focus:border-indigo-500 focus:outline-none text-sm"
              >
                <option value="">No default</option>
                {allModels.map((m) => (
                  <option key={m.id} value={m.model_id}>{m.name}</option>
                ))}
              </select>
            </div>
          )}
          <div className="flex items-center gap-2 pt-1">
            <button
              onClick={handleSave}
              disabled={saving}
              className="px-4 py-1.5 text-xs rounded bg-indigo-600 hover:bg-indigo-500 text-gray-900 dark:text-white transition disabled:opacity-50"
            >
              {saving ? 'Saving...' : 'Save'}
            </button>
            <button
              onClick={handleCancel}
              className="px-4 py-1.5 text-xs rounded bg-gray-100 dark:bg-slate-700 hover:bg-gray-200 dark:hover:bg-slate-600 text-gray-600 dark:text-gray-300 transition"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {showKey && (
        <div className="border-t border-gray-200 dark:border-slate-700 px-4 py-3">
          <div className="bg-white dark:bg-slate-900 border border-indigo-500/30 rounded p-3 flex gap-2 items-center">
            <code className="flex-1 text-sm text-indigo-600 dark:text-indigo-400 font-mono break-all">{showKey}</code>
            <button
              onClick={async () => {
                try {
                  await navigator.clipboard.writeText(showKey)
                } catch {
                  const ta = document.createElement('textarea')
                  ta.value = showKey
                  ta.style.position = 'fixed'
                  ta.style.opacity = '0'
                  document.body.appendChild(ta)
                  ta.select()
                  document.execCommand('copy')
                  document.body.removeChild(ta)
                }
                setShowKey('')
                showToast('Key copied!')
              }}
              className="px-3 py-1 bg-gray-100 dark:bg-slate-700 hover:bg-gray-200 dark:hover:bg-slate-600 rounded text-sm transition shrink-0"
            >
              Copy
            </button>
          </div>
        </div>
      )}

      {showConfigModal && (
        <ConfigModal userId={user.id} userName={user.name} onClose={() => setShowConfigModal(false)} />
      )}
    </div>
  )
}
