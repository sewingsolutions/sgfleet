import { useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "../api/client";
import type { ModelHealth } from "../api/types";

export function useModelHealth(modelId?: string) {
  const queryKey = modelId ? ["modelHealth", modelId] : ["modelHealth"];
  return useQuery<ModelHealth, Error>({
    queryKey,
    queryFn: () => api.getModelHealth(modelId),
    refetchInterval: (query) => {
      const data = query.state.data;
      if (!data) return 3000;
      if (data.status === "loading") return 3000;
      return 10000;
    },
    refetchOnWindowFocus: true,
  });
}

export function useModelHealthRefetch(modelId?: string) {
  const queryClient = useQueryClient();
  const queryKey = modelId ? ["modelHealth", modelId] : ["modelHealth"];
  return () => queryClient.invalidateQueries({ queryKey });
}
