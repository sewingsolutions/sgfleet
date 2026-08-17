import { useState } from "react";
import UserLayout from "../../components/UserLayout";
import { useMyRequests } from "../../hooks/useMyRequests";

export default function UserRequestsPage() {
  const [offset, setOffset] = useState(0);
  const limit = 50;

  const { data, isLoading, isError } = useMyRequests(limit, offset);

  if (isError) {
    return (
      <UserLayout>
        <h1 className="text-2xl font-bold mb-6">Request History</h1>
        <p className="text-gray-500 dark:text-gray-400">Unable to load request history.</p>
      </UserLayout>
    );
  }

  const requests = data?.requests ?? [];
  const total = data?.total ?? 0;
  const totalPages = Math.ceil(total / limit);

  return (
    <UserLayout>
      <h1 className="text-2xl font-bold mb-6">Request History</h1>

      <div className="bg-white dark:bg-slate-800 rounded-lg border border-gray-200 dark:border-slate-700 overflow-hidden">
        {isLoading ? (
          <div className="p-6 text-gray-500 dark:text-gray-400">Loading...</div>
        ) : requests.length === 0 ? (
          <div className="p-6 text-gray-500 dark:text-gray-400">No requests found.</div>
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-200 dark:border-slate-700">
                    <th className="text-left px-4 py-3 font-medium text-gray-500 dark:text-gray-400">Time</th>
                    <th className="text-left px-4 py-3 font-medium text-gray-500 dark:text-gray-400">Method</th>
                    <th className="text-left px-4 py-3 font-medium text-gray-500 dark:text-gray-400">Endpoint</th>
                    <th className="text-left px-4 py-3 font-medium text-gray-500 dark:text-gray-400">Status</th>
                    <th className="text-left px-4 py-3 font-medium text-gray-500 dark:text-gray-400">Latency</th>
                    <th className="text-left px-4 py-3 font-medium text-gray-500 dark:text-gray-400">Tokens</th>
                  </tr>
                </thead>
                <tbody>
                  {requests.map((r) => (
                    <tr
                      key={r.id}
                      className="border-b border-gray-100 dark:border-slate-700/50 hover:bg-gray-50 dark:hover:bg-slate-700/50"
                    >
                      <td className="px-4 py-2 text-gray-600 dark:text-gray-300 whitespace-nowrap">{r.timestamp}</td>
                      <td className="px-4 py-2 font-mono text-xs">{r.method}</td>
                      <td className="px-4 py-2 font-mono text-xs truncate max-w-xs">{r.endpoint}</td>
                      <td className="px-4 py-2">
                        <span
                          className={`px-1.5 py-0.5 rounded text-xs font-medium ${
                            r.status >= 500
                              ? "bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-300"
                              : r.status >= 400
                                ? "bg-amber-50 dark:bg-amber-900/20 text-amber-700 dark:text-amber-300"
                                : "bg-emerald-50 dark:bg-emerald-900/20 text-emerald-700 dark:text-emerald-300"
                          }`}
                        >
                          {r.status}
                        </span>
                      </td>
                      <td className="px-4 py-2 text-gray-600 dark:text-gray-300">{r.latency_ms.toFixed(0)}ms</td>
                      <td className="px-4 py-2 text-gray-600 dark:text-gray-300">
                        {(r.prompt_tokens + r.completion_tokens).toLocaleString()}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {totalPages > 1 && (
              <div className="flex items-center justify-between px-4 py-3 border-t border-gray-200 dark:border-slate-700">
                <p className="text-sm text-gray-500 dark:text-gray-400">
                  Showing {offset + 1}&#8211;{Math.min(offset + limit, total)} of {total}
                </p>
                <div className="flex gap-2">
                  <button
                    onClick={() => setOffset(Math.max(0, offset - limit))}
                    disabled={offset === 0}
                    className="px-3 py-1.5 text-sm bg-gray-100 dark:bg-slate-700 rounded disabled:opacity-50 hover:bg-gray-200 dark:hover:bg-slate-600 transition"
                  >
                    Previous
                  </button>
                  <button
                    onClick={() => {
                      const next = offset + limit;
                      if (next < total) setOffset(next);
                    }}
                    disabled={offset + limit >= total}
                    className="px-3 py-1.5 text-sm bg-gray-100 dark:bg-slate-700 rounded disabled:opacity-50 hover:bg-gray-200 dark:hover:bg-slate-600 transition"
                  >
                    Next
                  </button>
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </UserLayout>
  );
}
