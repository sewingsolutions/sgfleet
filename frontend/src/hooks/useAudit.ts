import { useQuery } from "@tanstack/react-query";
import { api } from "../api/client";
import type { AuditEntry, RequestLogEntry } from "../api/types";

export function useAuditLog(limit: number = 200) {
  return useQuery<AuditEntry[], Error>({
    queryKey: ["auditLog", limit],
    queryFn: () => api.getAuditLog(limit),
    staleTime: 5000,
  });
}

export function useUserRequests(userId: number | undefined, limit: number = 100) {
  return useQuery<RequestLogEntry[], Error>({
    queryKey: ["userRequests", userId, limit],
    queryFn: () => {
      if (!userId) throw new Error("No user selected");
      return api.getUserRequests(userId, limit);
    },
    enabled: !!userId,
    staleTime: 5000,
  });
}
