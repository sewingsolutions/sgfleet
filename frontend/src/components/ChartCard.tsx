import { Line } from "react-chartjs-2";
import { createChartOptions } from "../lib/chart";
import { useChartTheme } from "../hooks/useChartTheme";

const cardBase = "bg-white dark:bg-slate-800 rounded-lg border border-gray-200 dark:border-slate-700";

export function StatCard({ label, value }: { label: string; value: string }) {
  return (
    <div className={cardBase + " p-4"}>
      <p className="text-sm text-gray-500 dark:text-gray-400">{label}</p>
      <p className="text-2xl font-bold mt-1">{value}</p>
    </div>
  );
}

export function ChartCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className={cardBase + " p-6"}>
      <h2 className="text-lg font-semibold mb-4">{title}</h2>
      <div className="relative w-full" style={{ height: "200px" }}>
        {children}
      </div>
    </div>
  );
}

export function LineChart({
  labels,
  datasets,
  hideLegend,
}: {
  labels: string[];
  datasets: Array<{ label: string; data: number[]; borderColor: string }>;
  hideLegend?: boolean;
}) {
  const theme = useChartTheme();
  const opts = createChartOptions(theme, hideLegend);

  return (
    <Line
      options={opts}
      data={{
        labels,
        datasets: datasets.map((d) => ({
          ...d,
          backgroundColor: `${d.borderColor}20`,
          tension: 0.3,
          fill: true,
        })),
      }}
    />
  );
}
