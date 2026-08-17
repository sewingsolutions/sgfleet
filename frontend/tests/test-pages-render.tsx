import { render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

Object.defineProperty(window, "matchMedia", {
  writable: true,
  value: (query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: vi.fn(),
    removeListener: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(),
  }),
});

vi.mock("../src/context/AuthContext", () => ({
  AuthProvider: ({ children }: { children: React.ReactNode }) => children,
  useAuth: () => ({ authenticated: true, loading: false, login: vi.fn(), logout: vi.fn() }),
}));

vi.mock("../src/hooks/useUsers", () => ({
  useGetUsers: () => ({ data: [], isLoading: false }),
  useBulkUpdateMutation: () => ({ mutateAsync: vi.fn() }),
}));

vi.mock("../src/hooks/useUserStats", () => ({
  useUserStats: vi.fn(() => ({ data: undefined, isLoading: false, enabled: false })),
  useUserSummary: vi.fn(() => ({ data: undefined, isLoading: false, enabled: false })),
  useFleetStats: vi.fn(() => ({
    data: {
      labels: ["a"],
      total_requests: 0,
      avg_latency: 0,
      total_429: 0,
      total_prompt_tokens: 0,
      total_completion_tokens: 0,
      users: [],
      latency_p50: [],
      latency_p95: [],
      count_429: [],
    },
    isLoading: false,
  })),
}));

vi.mock("../src/hooks/useAudit", () => ({
  useAuditLog: vi.fn(() => ({ data: [], isLoading: false })),
  useUserRequests: vi.fn(() => ({ data: [], isLoading: false })),
}));

vi.mock("../src/hooks/useSettingsDefaults", () => ({
  useGetSettingsDefaults: () => ({ data: undefined }),
  useUpdateSettingsDefaultsMutation: () => ({ mutateAsync: vi.fn().mockResolvedValue({}), isPending: false }),
}));

vi.mock("../src/api/client", () => ({
  api: {
    fetchGet: vi.fn().mockResolvedValue({}),
    fetchPost: vi.fn().mockResolvedValue({}),
    fetchDelete: vi.fn().mockResolvedValue({}),
    getModelConfig: vi.fn().mockResolvedValue({}),
    getGitLog: vi.fn().mockResolvedValue({ head: "abc", commits: [] }),
  },
}));

vi.mock("react-chartjs-2", () => ({
  Line: () => <div data-testid="chart-line" />,
}));

vi.mock("chart.js", () => ({
  Chart: { register: vi.fn() },
  CategoryScale: {},
  LinearScale: {},
  PointElement: {},
  LineElement: {},
  Title: {},
  Tooltip: {},
  Legend: {},
  Filler: {},
}));

describe("Page smoke tests", () => {
  test("LoginPage renders without crash", async () => {
    const LoginPage = (await import("../src/pages/admin/LoginPage")).default;
    render(<LoginPage />);
    expect(screen.getByText("Sign In")).toBeInTheDocument();
  });

  test("UsersPage renders without crash", async () => {
    const UsersPage = (await import("../src/pages/admin/UsersPage")).default;
    render(
      <QueryClientProvider client={new QueryClient()}>
        <UsersPage />
      </QueryClientProvider>,
    );
    expect(screen.getByText("Add")).toBeInTheDocument();
  });

  test("MetricsPage renders without crash", async () => {
    const { ThemeProvider } = await import("../src/context/ThemeContext");
    const MetricsPage = (await import("../src/pages/admin/MetricsPage")).default;
    render(
      <ThemeProvider>
        <QueryClientProvider client={new QueryClient()}>
          <MetricsPage />
        </QueryClientProvider>
      </ThemeProvider>,
    );
    expect(screen.getByRole("button", { name: /Fleet/ })).toBeInTheDocument();
  });

  test("SettingsPage renders without crash", async () => {
    const SettingsPage = (await import("../src/pages/admin/SettingsPage")).default;
    render(
      <QueryClientProvider client={new QueryClient()}>
        <SettingsPage />
      </QueryClientProvider>,
    );
    expect(screen.getByText("Default Settings")).toBeInTheDocument();
  });

  test("AuditPage renders without crash", async () => {
    const AuditPage = (await import("../src/pages/admin/AuditPage")).default;
    render(
      <QueryClientProvider client={new QueryClient()}>
        <AuditPage />
      </QueryClientProvider>,
    );
    expect(screen.queryByText("Loading audit log...")).not.toBeInTheDocument();
  });

  test("VersionPage renders without crash", async () => {
    const VersionPage = (await import("../src/pages/admin/VersionPage")).default;
    render(
      <QueryClientProvider client={new QueryClient()}>
        <VersionPage />
      </QueryClientProvider>,
    );
    // VersionPage shows loading... initially, we need to wait for the effect
  });
});
