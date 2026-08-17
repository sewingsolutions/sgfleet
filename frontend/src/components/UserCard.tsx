import { useMemo, useState } from "react";
import { ChevronDown, Check, Pencil, Settings, EyeOff, PlayCircle, RefreshCw, Trash2 } from "lucide-react";
import { useUpdateUserMutation, useRotateKeyMutation, useDeleteUserMutation } from "../hooks/useUsers";
import { useToast } from "../hooks/useToast";
import { useConfirm } from "../hooks/useConfirm";
import ConfigModal from "./ConfigModal";
import { copyToClipboard } from "../utils/copyToClipboard";
import { tools } from "../config/tools";
import type { User, Model } from "../api/types";

function fmt(n: number | null | undefined) {
  if (n == null || n === 0) return "0";
  const abs = Math.abs(n);
  if (abs >= 1_000_000) return (n / 1_000_000).toFixed(abs % 1_000_000 === 0 ? 0 : 1) + "M";
  if (abs >= 1_000) return (n / 1_000).toFixed(abs % 1_000 === 0 ? 0 : 1) + "k";
  return n.toLocaleString();
}

function ConfigDropdown({ selectedToolId, onSelect }: { selectedToolId: string; onSelect: (toolId: string) => void }) {
  const [open, setOpen] = useState(false);
  const selected = tools.find((t) => t.id === selectedToolId);
  return (
    <div className="relative">
      <button
        onClick={() => setOpen(!open)}
        className="flex items-center gap-1.5 px-3 py-1 text-xs rounded transition bg-gray-100 dark:bg-slate-700 hover:bg-gray-200 dark:hover:bg-slate-600 text-gray-700 dark:text-gray-300 hover:text-gray-900 dark:hover:text-white"
      >
        <Settings className="w-3.5 h-3.5" />
        {selected?.name || "Config"}
        <ChevronDown className="w-3 h-3" />
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} />
          <div className="absolute left-0 bottom-full mb-1 z-20 w-48 bg-white dark:bg-slate-800 border border-gray-200 dark:border-slate-700 rounded-lg shadow-lg overflow-hidden">
            {tools.map((t) => (
              <button
                key={t.id}
                onClick={() => {
                  setOpen(false);
                  onSelect(t.id);
                }}
                className={`w-full text-left px-3 py-2 text-xs transition hover:bg-gray-100 dark:hover:bg-slate-700 ${t.id === selectedToolId ? "bg-indigo-50 dark:bg-indigo-900/30 text-indigo-700 dark:text-indigo-300" : "text-gray-700 dark:text-gray-300"}`}
              >
                {t.name}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

interface UserCardProps {
  user: User;
  checked?: boolean;
  onToggleCheck?: () => void;
  modelAccess?: Model[];
  defaultModel?: Model | null;
  allModels?: Model[];
  onDefaultModelChange?: (modelId: string | null) => void;
}

interface Draft {
  name: string;
  rate_limit: number;
  max_concurrent: number;
  request_cost: number;
  daily_quota: string;
  email: string;
  notes: string;
  default_model_id: string;
}

export default function UserCard({
  user: initialUser,
  checked,
  onToggleCheck,
  modelAccess,
  defaultModel,
  allModels,
  onDefaultModelChange,
}: UserCardProps) {
  const [user, setUser] = useState<User>(initialUser);
  const [expanded, setExpanded] = useState(false);
  const [showKey, setShowKey] = useState("");
  const [showConfigModal, setShowConfigModal] = useState(false);
  const [configToolId, setConfigToolId] = useState("opencode");
  const [saving, setSaving] = useState(false);
  const [draft, setDraft] = useState<Draft | null>(null);
  const showToast = useToast();
  const confirmAction = useConfirm();
  const { mutateAsync: updateUser } = useUpdateUserMutation();
  const { mutateAsync: rotateKey } = useRotateKeyMutation();
  const { mutateAsync: deleteUser } = useDeleteUserMutation();

  const userWithFreshStats = useMemo(
    () => ({ ...user, today_requests: initialUser.today_requests }),
    [user, initialUser.today_requests],
  );

  const openEdit = () => {
    setDraft({
      name: user.name,
      rate_limit: user.rate_limit,
      max_concurrent: user.max_concurrent,
      request_cost: user.request_cost ?? 0.001,
      daily_quota: user.daily_quota?.toString() ?? "",
      email: user.email ?? "",
      notes: user.notes ?? "",
      default_model_id: defaultModel?.model_id ?? "",
    });
    setExpanded(true);
  };

  const ensureDraft = () => {
    if (draft) return draft;
    const initial: Draft = {
      name: user.name,
      rate_limit: user.rate_limit,
      max_concurrent: user.max_concurrent,
      request_cost: user.request_cost ?? 0.001,
      daily_quota: user.daily_quota?.toString() ?? "",
      email: user.email ?? "",
      notes: user.notes ?? "",
      default_model_id: defaultModel?.model_id ?? "",
    };
    setDraft(initial);
    return initial;
  };

  const handleSave = async () => {
    if (!draft) return;
    setSaving(true);
    const payload: Record<string, unknown> = {};
    const trimmedName = draft.name.trim();
    if (trimmedName && trimmedName !== user.name) payload.name = trimmedName;
    if (draft.rate_limit !== user.rate_limit) payload.rate_limit = draft.rate_limit;
    if (draft.max_concurrent !== user.max_concurrent) payload.max_concurrent = draft.max_concurrent;
    if (draft.request_cost !== (user.request_cost ?? 0.001)) payload.request_cost = draft.request_cost;
    const newQuota = draft.daily_quota === "" ? null : parseInt(draft.daily_quota);
    const parsedQuota = isNaN(newQuota ?? 0) ? null : newQuota;
    if (parsedQuota !== user.daily_quota) payload.daily_quota = parsedQuota;
    if (draft.email !== (user.email ?? "")) payload.email = draft.email || null;
    if (draft.notes !== (user.notes ?? "")) payload.notes = draft.notes || null;
    if (draft.default_model_id !== (defaultModel?.model_id ?? "")) {
      await onDefaultModelChange?.(draft.default_model_id || null);
    }
    if (Object.keys(payload).length > 0) {
      try {
        await updateUser({ id: user.id, data: payload });
        setUser((prev) => ({ ...prev, ...payload }));
      } catch (e) {
        showToast(e instanceof Error ? e.message : "Failed to save changes");
      }
    }
    setSaving(false);
    setDraft(null);
  };

  const handleCancel = () => {
    setDraft(null);
    setExpanded(false);
  };

  const handleToggle = async () => {
    await updateUser({ id: user.id, data: { is_active: !user.is_active } });
    setUser((prev) => ({ ...prev, is_active: !prev.is_active }));
  };

  const handleRotate = async () => {
    if (!(await confirmAction(`Rotate API key for "${user.name}"? The current key will be invalidated.`, true))) return;
    const result = await rotateKey(user.id);
    setShowKey(result.api_key);
  };

  const handleDelete = async () => {
    if (!(await confirmAction(`Delete ${user.name}?`, true))) return;
    await deleteUser(user.id);
  };

  const today = userWithFreshStats.today_requests ?? 0;
  const quotaPct = userWithFreshStats.daily_quota ? (today / userWithFreshStats.daily_quota) * 100 : null;
  const quotaColor =
    quotaPct !== null ? (quotaPct >= 100 ? "bg-red-500" : quotaPct >= 80 ? "bg-amber-500" : "bg-emerald-500") : "";

  return (
    <div className="bg-gray-50 dark:bg-slate-800 rounded-lg border border-gray-200 dark:border-slate-700 overflow-hidden">
      <div className="flex items-start justify-between p-4 pb-2">
        <div className="flex items-start gap-3">
          {onToggleCheck && (
            <button
              onClick={onToggleCheck}
              className="mt-1 w-4 h-4 rounded border flex items-center justify-center shrink-0 transition "
              style={{
                borderColor: checked ? "#6366f1" : "#475569",
                backgroundColor: checked ? "#6366f1" : "transparent",
              }}
            >
              {checked && <Check className="w-3 h-3 text-gray-900 dark:text-white" />}
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
                <Pencil className="w-3.5 h-3.5" />
              </button>
            </div>
            {user.email && <p className="text-xs text-gray-400 dark:text-gray-500">{user.email}</p>}
            <span
              className={`px-2 py-0.5 rounded text-xs font-medium ${user.is_active ? "bg-emerald-50 dark:bg-emerald-900/50 text-emerald-700 dark:text-emerald-300" : "bg-red-50 dark:bg-red-900/50 text-red-700 dark:text-red-300"}`}
            >
              {user.is_active ? "Active" : "Inactive"}
            </span>
            <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">Created {user.created_at?.slice(0, 10)}</p>
          </div>
        </div>
        <button
          onClick={() => setExpanded(!expanded)}
          className="text-gray-500 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white transition p-1"
        >
          <Settings className="w-5 h-5" />
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
              <span
                className={`text-xs font-medium ${
                  quotaPct >= 100
                    ? "text-red-600 dark:text-red-400"
                    : quotaPct >= 80
                      ? "text-amber-700 dark:text-amber-300"
                      : "text-emerald-700 dark:text-emerald-300"
                }`}
              >
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
          <span className="text-gray-700 dark:text-gray-300">
            {user.daily_quota != null ? fmt(user.daily_quota) : "Unlimited"}
          </span>
        </div>
      </div>

      {modelAccess && modelAccess.length > 0 && (
        <div className="px-4 pb-3">
          <div className="flex flex-wrap gap-1.5">
            {modelAccess.map((m) => (
              <span
                key={m.id}
                className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium ${defaultModel?.model_id === m.model_id ? "bg-indigo-100 dark:bg-indigo-900/50 text-indigo-700 dark:text-indigo-300" : "bg-gray-200 dark:bg-slate-700 text-gray-600 dark:text-gray-300"}`}
              >
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
          {user.is_active ? <EyeOff className="w-3.5 h-3.5" /> : <PlayCircle className="w-3.5 h-3.5" />}
          {user.is_active ? "Disable" : "Enable"}
        </button>
        <button
          onClick={handleRotate}
          className="flex items-center gap-1.5 px-3 py-1 text-xs rounded transition bg-amber-100 dark:bg-amber-900/30 hover:bg-amber-200 dark:hover:bg-amber-900/50 text-amber-800 dark:text-amber-300 hover:text-amber-900 dark:hover:text-amber-200"
        >
          <RefreshCw className="w-3.5 h-3.5" />
          Rotate Key
        </button>
        <ConfigDropdown
          selectedToolId={configToolId}
          onSelect={(toolId) => {
            setConfigToolId(toolId);
            setShowConfigModal(true);
          }}
        />
        <button
          onClick={handleDelete}
          className="flex items-center gap-1.5 px-3 py-1 text-xs rounded transition bg-gray-100 dark:bg-slate-700 hover:bg-red-50 dark:hover:bg-red-900/50 text-gray-700 dark:text-gray-300 hover:text-red-700 dark:hover:text-red-300"
        >
          <Trash2 className="w-3.5 h-3.5" />
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
                value={draft?.request_cost ?? user.request_cost ?? 0.001}
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
                value={draft?.daily_quota ?? user.daily_quota?.toString() ?? ""}
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
                value={draft?.email ?? user.email ?? ""}
                placeholder="user@example.com"
                onChange={(e) => setDraft({ ...ensureDraft(), email: e.target.value })}
                className="w-full px-3 py-2 bg-white dark:bg-slate-900 border border-gray-300 dark:border-slate-600 rounded text-gray-900 dark:text-white text-center focus:border-indigo-500 focus:outline-none placeholder-gray-400 dark:placeholder-gray-500 text-sm"
              />
            </div>
            <div>
              <label className="text-xs text-gray-400 dark:text-gray-500 block mb-1">Notes</label>
              <input
                type="text"
                value={draft?.notes ?? user.notes ?? ""}
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
                value={draft?.default_model_id ?? defaultModel?.model_id ?? ""}
                onChange={(e) => setDraft({ ...ensureDraft(), default_model_id: e.target.value })}
                className="w-full px-3 py-2 bg-white dark:bg-slate-900 border border-gray-300 dark:border-slate-600 rounded text-gray-900 dark:text-white text-center focus:border-indigo-500 focus:outline-none text-sm"
              >
                <option value="">No default</option>
                {allModels.map((m) => (
                  <option key={m.id} value={m.model_id}>
                    {m.name}
                  </option>
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
              {saving ? "Saving..." : "Save"}
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
              onClick={() => {
                copyToClipboard(showKey);
                setShowKey("");
                showToast("Key copied!");
              }}
              className="px-3 py-1 bg-gray-100 dark:bg-slate-700 hover:bg-gray-200 dark:hover:bg-slate-600 rounded text-sm transition shrink-0"
            >
              Copy
            </button>
          </div>
        </div>
      )}

      {showConfigModal && (
        <ConfigModal
          userId={user.id}
          userName={user.name}
          clientType={configToolId}
          onClose={() => setShowConfigModal(false)}
        />
      )}
    </div>
  );
}
