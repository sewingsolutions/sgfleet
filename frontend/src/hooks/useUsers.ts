import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "../api/client";
import type { User } from "../api/types";

export function useGetUsers(options: { refetchInterval?: number } = {}) {
  return useQuery<User[], Error>({
    queryKey: ["users"],
    queryFn: api.getUsers,
    refetchInterval: options.refetchInterval,
  });
}

export function useCreateUserMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: {
      name: string;
      rate_limit?: number;
      max_concurrent?: number;
      request_cost?: number;
      daily_quota?: number | null;
    }) => api.createUser(data),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["users"] }),
  });
}

export function useUpdateUserMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (variables: { id: number; data: Record<string, unknown> }) =>
      api.updateUser(variables.id, variables.data),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["users"] }),
  });
}

export function useRotateKeyMutation() {
  return useMutation({
    mutationFn: (id: number) => api.rotateKey(id),
  });
}

export function useDeleteUserMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => api.deleteUser(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["users"] }),
  });
}

export function useBulkUpdateMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (variables: { user_ids: number[]; is_active: boolean }) => api.bulkUpdateUsers(variables),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["users"] }),
  });
}
