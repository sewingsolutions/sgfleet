import { useCallback, useState } from "react";
import { RefreshCw } from "lucide-react";
import { useQueryClient, useQueries, useQuery } from "@tanstack/react-query";
import { useGetUsers, useBulkUpdateMutation } from "../../hooks/useUsers";
import { useToast } from "../../hooks/useToast";
import AddUserForm from "../../components/AddUserForm";
import UserCard from "../../components/UserCard";
import { api } from "../../api/client";
import type { Model } from "../../api/types";
import { buildModelAccessMap, buildDefaultModelMap } from "../../services/userAccess";

type UserFilter = "all" | "active" | "inactive" | "quota_exceeded";

const INTERVALS = [0, 10_000, 30_000, 60_000];
const INTERVAL_LABELS = ["Off", "10s", "30s", "60s"];

export default function UsersPage() {
  const [intervalIndex, setIntervalIndex] = useState(0);
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<UserFilter>("all");
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [bulkMode, setBulkMode] = useState(false);
  const queryClient = useQueryClient();
  const showToast = useToast();
  const refetchMs = INTERVALS[intervalIndex];
  const { mutateAsync: bulkUpdate } = useBulkUpdateMutation();

  const { data: users = [], isLoading } = useGetUsers({
    refetchInterval: refetchMs || undefined,
  });

  const { data: allModels = [] } = useQuery({
    queryKey: ["models"],
    queryFn: api.listModels,
  });

  const handleCreated = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: ["users"] });
  }, [queryClient]);

  // Batch per-user model access and default model queries
  const userQueries = useQueries({
    queries: users.map((u) => ({
      queryKey: ["userModelAccess", u.id],
      queryFn: () => api.getUserModelAccess(u.id),
      select: (data: Model[]) => ({ access: data, userId: u.id }),
      retry: false,
    })),
  });

  const defaultModelQueries = useQueries({
    queries: users.map((u) => ({
      queryKey: ["userDefaultModel", u.id],
      queryFn: () => api.getUserDefaultModel(u.id),
      select: (data: Model | null) => ({ model: data, userId: u.id }),
      retry: false,
    })),
  });

  const modelAccessMap = buildModelAccessMap(users, userQueries);
  const defaultModelMap = buildDefaultModelMap(users, defaultModelQueries);

  const filtered = users.filter((u) => {
    if (search && !u.name.toLowerCase().includes(search.toLowerCase())) return false;
    if (filter === "active" && !u.is_active) return false;
    if (filter === "inactive" && u.is_active) return false;
    if (filter === "quota_exceeded") {
      const quota = u.daily_quota;
      return quota != null && quota > 0 && (u.today_requests ?? 0) >= quota;
    }
    return true;
  });

  const toggleSelect = (id: number) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleBulkEnable = async () => {
    if (selectedIds.size === 0) return;
    await bulkUpdate({ user_ids: [...selectedIds], is_active: true });
    showToast(`Enabled ${selectedIds.size} user(s)`);
    setSelectedIds(new Set());
    setBulkMode(false);
  };

  const handleBulkDisable = async () => {
    if (selectedIds.size === 0) return;
    await bulkUpdate({ user_ids: [...selectedIds], is_active: false });
    showToast(`Disabled ${selectedIds.size} user(s)`);
    setSelectedIds(new Set());
    setBulkMode(false);
  };

  return (
    <div>
      <div className="mb-6">
        <AddUserForm onCreated={handleCreated} />
      </div>

      <div className="flex flex-wrap items-center gap-3 mb-4">
        <div className="flex-1 min-w-48">
          <input
            type="text"
            placeholder="Search users..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full px-3 py-2 bg-gray-100 dark:bg-slate-700 border border-gray-300 dark:border-slate-600 rounded text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-gray-500 text-sm focus:border-indigo-400 dark:focus:border-indigo-500 focus:outline-none"
          />
        </div>

        <div className="flex gap-1 bg-gray-100 dark:bg-slate-700 rounded text-xs">
          {(
            [
              ["all", "All"],
              ["active", "Active"],
              ["inactive", "Inactive"],
              ["quota_exceeded", "Quota exceeded"],
            ] as const
          ).map(([key, label]) => (
            <button
              key={key}
              onClick={() => setFilter(key)}
              className={`px-3 py-1.5 rounded ${filter === key ? "bg-indigo-600 text-gray-900 dark:text-white" : "text-gray-500 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white"}`}
            >
              {label}
            </button>
          ))}
        </div>

        <button
          onClick={() => {
            setBulkMode(!bulkMode);
            setSelectedIds(new Set());
          }}
          className={`px-3 py-1.5 text-xs rounded transition ${bulkMode ? "bg-indigo-600 text-gray-900 dark:text-white" : "bg-gray-100 dark:bg-slate-700 hover:bg-gray-200 dark:hover:bg-slate-600 text-gray-600 dark:text-gray-300"}`}
        >
          Bulk
        </button>

        <div className="ml-auto flex items-center gap-2">
          {bulkMode && selectedIds.size > 0 && (
            <div className="flex items-center gap-2">
              <span className="text-xs text-gray-500 dark:text-gray-400">{selectedIds.size} selected</span>
              <button
                onClick={handleBulkEnable}
                className="px-3 py-1.5 text-xs rounded bg-emerald-600 dark:bg-emerald-700 hover:bg-emerald-500 dark:hover:bg-emerald-600 text-gray-900 dark:text-white transition"
              >
                Enable selected
              </button>
              <button
                onClick={handleBulkDisable}
                className="px-3 py-1.5 text-xs rounded bg-red-600 dark:bg-red-700 hover:bg-red-500 dark:hover:bg-red-600 text-gray-900 dark:text-white transition"
              >
                Disable selected
              </button>
            </div>
          )}
          <RefreshCw className="w-4 h-4 text-gray-500 dark:text-gray-400" />
          <select
            value={intervalIndex}
            onChange={(e) => setIntervalIndex(Number(e.target.value))}
            className="px-3 py-1.5 text-sm bg-gray-100 dark:bg-slate-700 hover:bg-gray-200 dark:hover:bg-slate-600 text-gray-900 dark:text-white rounded transition appearance-none cursor-pointer focus:border-indigo-400 dark:focus:border-indigo-500 focus:outline-none"
          >
            {INTERVAL_LABELS.map((label, i) => (
              <option key={i} value={i}>
                {label}
              </option>
            ))}
          </select>
        </div>
      </div>

      {isLoading ? (
        <div className="py-8 text-center text-gray-500 dark:text-gray-400">Loading users...</div>
      ) : filtered.length === 0 ? (
        <div className="py-8 text-center text-gray-400 dark:text-gray-500">No users match the filter</div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {filtered.map((u) => (
            <UserCard
              key={u.id}
              user={u}
              checked={bulkMode && selectedIds.has(u.id)}
              onToggleCheck={bulkMode ? () => toggleSelect(u.id) : undefined}
              modelAccess={modelAccessMap[u.id]}
              defaultModel={defaultModelMap[u.id]}
              allModels={allModels}
              onDefaultModelChange={async (modelId) => {
                try {
                  await api.setUserDefaultModel(u.id, modelId);
                  queryClient.invalidateQueries({ queryKey: ["userDefaultModel", u.id] });
                  showToast(`Default model updated for ${u.name}`);
                } catch (e) {
                  showToast(e instanceof Error ? e.message : "Failed to update default model");
                }
              }}
            />
          ))}
        </div>
      )}
    </div>
  );
}
