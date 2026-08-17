import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState, useCallback, useEffect } from "react";
import { api } from "../api/client";
import type { LogEntry } from "../api/types";

export function useLogs(initialLimit: number = 100) {
  const queryClient = useQueryClient();
  const [level, setLevel] = useState<string>("");
  const [user, setUser] = useState<string>("");
  const [path, setPath] = useState<string>("");
  const [keyword, setKeyword] = useState<string>("");
  const [autoRefresh, setAutoRefresh] = useState(false);

  const filters = { level, user, path, keyword };

  const { data, isLoading } = useQuery<LogEntry[], Error>({
    queryKey: ["logs", initialLimit, filters],
    queryFn: () => api.getLogs({ limit: initialLimit, ...filters }),
    staleTime: autoRefresh ? 5000 : 30000,
    refetchInterval: autoRefresh ? 5000 : undefined,
  });

  useEffect(() => {
    if (!autoRefresh) return;
    const id = setInterval(() => {
      queryClient.invalidateQueries({ queryKey: ["logs"] });
    }, 5000);
    return () => clearInterval(id);
  }, [autoRefresh, queryClient]);

  return {
    logs: data || [],
    isLoading,
    filters,
    setLevel,
    setUser,
    setPath,
    setKeyword,
    autoRefresh,
    setAutoRefresh,
    clearFilters: () => {
      setLevel("");
      setUser("");
      setPath("");
      setKeyword("");
    },
  };
}

export function useLogLevel() {
  const { data, isLoading } = useQuery<{ level: string }, Error>({
    queryKey: ["logLevel"],
    queryFn: () => api.getLogLevel(),
    staleTime: 60000,
  });
  return { level: data?.level || "DEBUG", isLoading };
}

export function useSetLogLevelMutation() {
  const queryClient = useQueryClient();
  const [pending, setPending] = useState(false);
  const setLevel = useCallback(
    async (level: string) => {
      setPending(true);
      try {
        await api.setLogLevel(level);
        queryClient.invalidateQueries({ queryKey: ["logLevel"] });
      } finally {
        setPending(false);
      }
    },
    [queryClient],
  );
  return { setLevel, pending };
}
