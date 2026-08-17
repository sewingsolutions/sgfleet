import UserLayout from "../../components/UserLayout";
import { useMyQuota } from "../../hooks/useMyQuota";

export default function UserQuotaPage() {
  const { data: quota, isLoading, isError } = useMyQuota();

  if (isError) {
    return (
      <UserLayout>
        <h1 className="text-2xl font-bold mb-6">Quota & Usage</h1>
        <p className="text-gray-500 dark:text-gray-400">Unable to load quota data.</p>
      </UserLayout>
    );
  }

  const formatNum = (n: number) => n.toLocaleString();

  return (
    <UserLayout>
      <h1 className="text-2xl font-bold mb-6">Quota & Usage</h1>

      {isLoading ? (
        <p className="text-gray-500 dark:text-gray-400">Loading...</p>
      ) : !quota ? (
        <p className="text-gray-500 dark:text-gray-400">Unable to load quota data.</p>
      ) : (
        <div className="space-y-6">
          {/* Daily quota */}
          <div className="bg-white dark:bg-slate-800 rounded-lg border border-gray-200 dark:border-slate-700 p-6">
            <h2 className="text-lg font-semibold mb-4">Daily Quota</h2>

            {quota.daily_quota != null ? (
              <>
                <div className="flex items-center justify-between mb-2">
                  <span className="text-sm text-gray-500 dark:text-gray-400">
                    {formatNum(quota.today_requests)} / {formatNum(quota.daily_quota)} requests
                  </span>
                  <span className="text-sm font-medium">
                    {quota.usage_percent != null ? `${quota.usage_percent.toFixed(1)}%` : "--"}
                  </span>
                </div>
                <div className="h-4 bg-gray-100 dark:bg-slate-700 rounded-full overflow-hidden">
                  <div
                    className={`h-full rounded-full transition-all ${
                      (quota.usage_percent ?? 0) > 90
                        ? "bg-red-500"
                        : (quota.usage_percent ?? 0) > 70
                          ? "bg-amber-500"
                          : "bg-indigo-500"
                    }`}
                    style={{ width: `${Math.min(100, quota.usage_percent ?? 0)}%` }}
                  />
                </div>
                {quota.remaining != null && (
                  <p className="text-sm text-gray-500 dark:text-gray-400 mt-2">
                    {formatNum(quota.remaining)} requests remaining today
                  </p>
                )}
              </>
            ) : (
              <p className="text-sm text-gray-500 dark:text-gray-400">No daily quota limit set.</p>
            )}
          </div>

          {/* Overall stats */}
          <div className="bg-white dark:bg-slate-800 rounded-lg border border-gray-200 dark:border-slate-700 p-6">
            <h2 className="text-lg font-semibold mb-4">Overall Usage</h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <p className="text-sm text-gray-500 dark:text-gray-400">Total Requests</p>
                <p className="text-2xl font-bold mt-1">{formatNum(quota.total_requests)}</p>
              </div>
              <div>
                <p className="text-sm text-gray-500 dark:text-gray-400">Total Tokens</p>
                <p className="text-2xl font-bold mt-1">{formatNum(quota.total_tokens)}</p>
              </div>
              <div>
                <p className="text-sm text-gray-500 dark:text-gray-400">Prompt Tokens</p>
                <p className="text-xl font-semibold mt-1 text-emerald-600 dark:text-emerald-400">
                  {formatNum(quota.total_prompt_tokens)}
                </p>
              </div>
              <div>
                <p className="text-sm text-gray-500 dark:text-gray-400">Completion Tokens</p>
                <p className="text-xl font-semibold mt-1 text-amber-600 dark:text-amber-400">
                  {formatNum(quota.total_completion_tokens)}
                </p>
              </div>
            </div>
          </div>

          {/* Rate limits */}
          <div className="bg-white dark:bg-slate-800 rounded-lg border border-gray-200 dark:border-slate-700 p-6">
            <h2 className="text-lg font-semibold mb-4">Rate Limits</h2>
            <p className="text-sm text-gray-500 dark:text-gray-400">
              Rate limits are enforced per-user. Contact your admin to adjust your rate limit or concurrent request cap.
            </p>
          </div>
        </div>
      )}
    </UserLayout>
  );
}
