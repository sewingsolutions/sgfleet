import { useState } from "react";
import UserLayout from "../../components/UserLayout";
import { StatCard, ChartCard, LineChart } from "../../components/ChartCard";
import { useChartTheme } from "../../hooks/useChartTheme";
import { useMyStats } from "../../hooks/useMyStats";

const Ranges = ["today", "7d", "30d"] as const;
type Range = (typeof Ranges)[number];

export default function UserMetricsPage() {
  const [range, setRange] = useState<Range>("today");
  const { data, isLoading, isError } = useMyStats(range);
  const theme = useChartTheme();

  const totalRequests = data?.requests.reduce((a, b) => a + b, 0) ?? 0;
  const totalTokens = data?.total_tokens.reduce((a, b) => a + b, 0) ?? 0;
  const total429 = data?.count_429.reduce((a, b) => a + b, 0) ?? 0;

  if (isError) {
    return (
      <UserLayout>
        <div className="flex items-center justify-between mb-6">
          <h1 className="text-2xl font-bold">Metrics</h1>
        </div>
        <p className="text-gray-500 dark:text-gray-400">Unable to load metrics.</p>
      </UserLayout>
    );
  }

  return (
    <UserLayout>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold">Metrics</h1>
        <div className="flex gap-1 bg-gray-100 dark:bg-slate-700 rounded-lg p-1">
          {Ranges.map((r) => (
            <button
              key={r}
              onClick={() => setRange(r)}
              className={`px-3 py-1.5 rounded text-sm transition ${range === r ? "bg-white dark:bg-slate-800 text-gray-900 dark:text-white shadow-sm" : "text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300"}`}
            >
              {r === "today" ? "Today" : r === "7d" ? "7 Days" : "30 Days"}
            </button>
          ))}
        </div>
      </div>

      {isLoading ? (
        <p className="text-gray-500 dark:text-gray-400">Loading...</p>
      ) : (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
            <StatCard label="Total Requests" value={totalRequests.toLocaleString()} />
            <StatCard label="Total Tokens" value={totalTokens.toLocaleString()} />
            <StatCard label="Rate Limited (429)" value={total429.toLocaleString()} />
          </div>

          {data && data.labels.length > 0 ? (
            <>
              <ChartCard title="Requests Over Time">
                <LineChart
                  labels={data.labels}
                  datasets={[{ label: "Requests", data: data.requests, borderColor: theme.requests }]}
                  hideLegend
                />
              </ChartCard>

              <div className="mt-6 grid grid-cols-1 lg:grid-cols-2 gap-4">
                <ChartCard title="Tokens (Prompt / Completion)">
                  <LineChart
                    labels={data.labels}
                    datasets={[
                      { label: "Prompt", data: data.prompt_tokens, borderColor: theme.prompt },
                      { label: "Completion", data: data.completion_tokens, borderColor: theme.completion },
                    ]}
                  />
                </ChartCard>

                <ChartCard title="Latency (p50 / p95)">
                  <LineChart
                    labels={data.labels}
                    datasets={[
                      { label: "p50", data: data.latency_p50, borderColor: theme.p50 },
                      { label: "p95", data: data.latency_p95, borderColor: theme.p95 },
                    ]}
                  />
                </ChartCard>
              </div>
            </>
          ) : (
            <p className="text-sm text-gray-400 dark:text-gray-500">No data available for this period.</p>
          )}
        </>
      )}
    </UserLayout>
  );
}
