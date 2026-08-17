import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, act, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useLogs } from "./useLogs";
import { api } from "../api/client";

vi.mock("../api/client");

const makeWrapper = (client: QueryClient) => {
  return ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );
};

describe("useLogs", () => {
  let queryClient: QueryClient;

  beforeEach(() => {
    queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });

    vi.mocked(api.getLogs).mockResolvedValue([
      {
        id: 1,
        timestamp: "2024-01-01T00:00:00Z",
        level: "INFO",
        event: null,
        method: null,
        path: null,
        status: null,
        latency_ms: null,
        user: null,
        request_id: null,
        ip: null,
        error: null,
        message: null,
      },
    ]);
  });

  it("manages filter state and clearFilters", async () => {
    const { result } = renderHook(() => useLogs(100), { wrapper: makeWrapper(queryClient) });

    await waitFor(() => {
      expect(result.current.setLevel).toBeDefined();
    });

    act(() => {
      result.current.setLevel("ERROR");
      result.current.setUser("admin");
      result.current.setPath("/api/test");
      result.current.setKeyword("test");
    });

    expect(result.current.filters.level).toBe("ERROR");
    expect(result.current.filters.user).toBe("admin");
    expect(result.current.filters.path).toBe("/api/test");
    expect(result.current.filters.keyword).toBe("test");

    act(() => {
      result.current.clearFilters();
    });

    expect(result.current.filters.level).toBe("");
    expect(result.current.filters.user).toBe("");
    expect(result.current.filters.path).toBe("");
    expect(result.current.filters.keyword).toBe("");
  });

  it("sets autoRefresh state", async () => {
    const { result } = renderHook(() => useLogs(100), { wrapper: makeWrapper(queryClient) });

    await waitFor(() => {
      expect(result.current.autoRefresh).toBe(false);
    });

    act(() => {
      result.current.setAutoRefresh(true);
    });

    expect(result.current.autoRefresh).toBe(true);
  });

  it("auto-refresh interval invalidates queries", async () => {
    vi.useFakeTimers();
    const invalidateSpy = vi.spyOn(queryClient, "invalidateQueries");

    const { result } = renderHook(() => useLogs(100), { wrapper: makeWrapper(queryClient) });

    act(() => {
      result.current.setAutoRefresh(true);
    });

    await act(async () => {
      await vi.advanceTimersByTimeAsync(5500);
    });

    expect(invalidateSpy).toHaveBeenCalledWith(expect.objectContaining({ queryKey: ["logs"] }));

    vi.useRealTimers();
  });
});
