import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Legend,
  Filler,
} from "chart.js";

ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, Title, Tooltip, Legend, Filler);

import type { ChartTheme } from "../hooks/useChartTheme";
import type { ChartOptions } from "chart.js";

export const createChartOptions = (theme: ChartTheme, hideLegend = false): ChartOptions<"line"> => ({
  responsive: true,
  maintainAspectRatio: false,
  plugins: {
    legend: {
      display: !hideLegend,
      position: "top",
      labels: { color: theme.legendColor, boxWidth: 12 },
    },
  },
  scales: {
    x: { ticks: { color: theme.tickColor, maxTicksLimit: 10 }, grid: { color: theme.gridColor } },
    y: { ticks: { color: theme.tickColor }, grid: { color: theme.gridColor } },
  },
});
