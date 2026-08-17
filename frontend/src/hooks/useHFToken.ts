import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '../api/client'

export function useHFToken() {
  return useQuery<{ has_token: boolean; masked_token: string }, Error>({
    queryKey: ['hfToken'],
    queryFn: () => api.getHFToken(),
    staleTime: 60000,
  })
}

export function useSetHFTokenMutation() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (token: string) => api.setHFToken(token),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['hfToken'] }),
  })
}
