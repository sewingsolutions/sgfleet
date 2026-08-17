import { useAuditLog } from "../../hooks/useAudit";

const actionColors: Record<string, string> = {
  create_user: "bg-emerald-50 text-emerald-700 dark:bg-emerald-900/50 dark:text-emerald-300",
  update_user: "bg-blue-50 text-blue-700 dark:bg-blue-900/50 dark:text-blue-300",
  rotate_key: "bg-amber-50 text-amber-700 dark:bg-amber-900/50 dark:text-amber-300",
  delete_user: "bg-red-50 text-red-700 dark:bg-red-900/50 dark:text-red-300",
  bulk_update: "bg-purple-50 text-purple-700 dark:bg-purple-900/50 dark:text-purple-300",
  update_settings: "bg-cyan-50 text-cyan-700 dark:bg-cyan-900/50 dark:text-cyan-300",
};

export default function AuditPage() {
  const { data: logs, isLoading } = useAuditLog();

  if (isLoading) return <div className="py-8 text-center text-gray-500 dark:text-gray-400">Loading audit log...</div>;
  if (!logs || logs.length === 0)
    return <div className="py-8 text-center text-gray-400 dark:text-gray-500">No audit entries yet</div>;

  return (
    <div className="space-y-2">
      {logs.map((log, i) => (
        <div
          key={log.id}
          className={`bg-white dark:bg-slate-800 rounded-lg border border-gray-200 dark:border-slate-700 p-3 sm:p-4 ${i % 2 ? "" : "bg-gray-50 dark:bg-slate-800/50"}`}
        >
          <div className="flex items-start justify-between gap-3 flex-wrap">
            <div className="flex items-center gap-2 min-w-0">
              <span
                className={`px-2 py-0.5 rounded text-xs font-medium shrink-0 ${actionColors[log.action] || "bg-gray-100 text-gray-700 dark:bg-slate-700 dark:text-gray-300"}`}
              >
                {log.action.replace(/_/g, " ")}
              </span>
              <span className="text-gray-600 dark:text-gray-400 text-sm truncate">
                {log.target_user_id != null ? `User #${log.target_user_id}` : "—"}
              </span>
            </div>
            <span className="text-gray-400 dark:text-gray-500 text-xs font-mono whitespace-nowrap shrink-0">
              {log.ip_address || "—"}
            </span>
          </div>
          <div className="mt-1 flex items-center justify-between flex-wrap gap-1">
            <span className="text-gray-500 dark:text-gray-400 text-xs">{log.timestamp}</span>
          </div>
          {log.detail && (
            <p className="mt-2 text-xs text-gray-600 dark:text-gray-400 break-all bg-gray-50 dark:bg-slate-900 rounded px-2 py-1 max-w-full overflow-x-auto">
              {log.detail}
            </p>
          )}
        </div>
      ))}
    </div>
  );
}
