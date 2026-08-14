import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '../api/client'
import type { SetupStatus } from '../api/types'

export function useSetupStatus() {
  return useQuery<SetupStatus, Error>({
    queryKey: ['setupStatus'],
    queryFn: () => api.getSetupStatus(),
  })
}

export function useCompleteSetupMutation() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (data: { admin_name: string; base_url: string; hf_token?: string }) =>
      api.completeSetup(data),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['setupStatus'] }),
  })
}
