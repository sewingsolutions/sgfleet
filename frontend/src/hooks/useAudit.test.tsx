import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useAuditLog, useUserRequests } from "./useAudit";
import { api } from "../api/client";

vi.mock("../api/client");

const makeWrapper = (client: QueryClient) => {
  return ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );
};

describe("useAuditLog", () => {
  let queryClient: QueryClient;

  beforeEach(() => {
    queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });

    vi.mocked(api.getAuditLog).mockResolvedValue([
      {
        id: 1,
        timestamp: "2024-01-01T00:00:00Z",
        action: "login",
        target_user_id: null,
        detail: "admin login",
        ip_address: "127.0.0.1",
      },
    ]);
  });

  it("uses default limit of 200", () => {
    renderHook(() => useAuditLog(), { wrapper: makeWrapper(queryClient) });

    expect(api.getAuditLog).toHaveBeenCalledWith(200);
  });

  it("uses provided limit", () => {
    renderHook(() => useAuditLog(50), { wrapper: makeWrapper(queryClient) });

    expect(api.getAuditLog).toHaveBeenCalledWith(50);
  });
});

describe("useUserRequests", () => {
  let queryClient: QueryClient;

  beforeEach(() => {
    queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });

    vi.mocked(api.getUserRequests).mockResolvedValue([
      {
        id: 1,
        timestamp: "2024-01-01T00:00:00Z",
        user_id: 1,
        request_id: "req-1",
        method: "POST",
        endpoint: "/v1/chat",
        status: 200,
        latency_ms: 50,
        error_msg: "",
      },
    ]);
  });

  it("query is disabled when userId is undefined", () => {
    renderHook(() => useUserRequests(undefined), { wrapper: makeWrapper(queryClient) });

    expect(api.getUserRequests).not.toHaveBeenCalled();
  });

  it("query is enabled when userId is provided", () => {
    renderHook(() => useUserRequests(1), { wrapper: makeWrapper(queryClient) });

    expect(api.getUserRequests).toHaveBeenCalledWith(1, 100);
  });

  it("uses default limit of 100", () => {
    renderHook(() => useUserRequests(1), { wrapper: makeWrapper(queryClient) });

    expect(api.getUserRequests).toHaveBeenCalledWith(1, 100);
  });

  it("uses provided limit", () => {
    renderHook(() => useUserRequests(1, 50), { wrapper: makeWrapper(queryClient) });

    expect(api.getUserRequests).toHaveBeenCalledWith(1, 50);
  });
});
