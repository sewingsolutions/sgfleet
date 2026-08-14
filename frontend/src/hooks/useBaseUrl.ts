import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '../api/client'

export function useBaseUrl() {
  return useQuery<{ base_url: string }, Error>({
    queryKey: ['baseUrl'],
    queryFn: () => api.getBaseUrl(),
    staleTime: 60000,
  })
}

export function useSetBaseUrlMutation() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (url: string) => api.setBaseUrl(url),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['baseUrl'] }),
  })
}
