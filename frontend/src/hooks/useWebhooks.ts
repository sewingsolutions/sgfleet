import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "../api/client";
import type { Webhook } from "../api/types";

export function useWebhooks() {
  return useQuery<Webhook[], Error>({
    queryKey: ["webhooks"],
    queryFn: () => api.fetchGet("/api/webhooks") as unknown as Promise<Webhook[]>,
  });
}

export function useCreateWebhookMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: Record<string, unknown>) => api.fetchPost("/api/webhooks", data),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["webhooks"] }),
  });
}

export function useDeleteWebhookMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => api.fetchDelete("/api/webhooks/" + id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["webhooks"] }),
  });
}
