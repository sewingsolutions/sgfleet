import { useGitLog } from "../../hooks/useGitLog";

export default function VersionPage() {
  const { data, isLoading, isError } = useGitLog();

  if (isLoading) return null;

  const head = isError ? "error" : data?.head || "unknown";
  const commits = data?.commits || [];

  return (
    <div>
      <h1 className="text-2xl font-bold text-gray-900 dark:text-white mb-6">Release Notes</h1>

      <div className="mb-8 bg-white dark:bg-slate-800 rounded-lg p-4 border border-gray-200 dark:border-slate-700">
        <div className="flex items-center gap-3">
          <span className="text-sm text-gray-500 dark:text-gray-400">Current build</span>
          <code className="text-sm font-mono text-indigo-600 dark:text-indigo-400 bg-gray-100 dark:bg-slate-900 px-2 py-1 rounded">
            {head}
          </code>
        </div>
      </div>

      <div className="space-y-1">
        {commits.map((c) => (
          <div
            key={c.sha}
            className="flex items-start gap-3 py-2 border-b border-gray-200 dark:border-slate-800 last:border-0"
          >
            <code className="text-xs font-mono text-gray-400 dark:text-gray-500 mt-0.5 shrink-0">{c.sha}</code>
            <span className="text-sm text-gray-700 dark:text-gray-300 whitespace-pre-wrap break-words">{c.msg}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
