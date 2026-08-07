import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '../api/client'
import type { SettingsDefaults } from '../api/types'

export function useGetSettingsDefaults() {
  return useQuery<SettingsDefaults, Error>({
    queryKey: ['settingsDefaults'],
    queryFn: api.getSettingsDefaults,
  })
}

export function useUpdateSettingsDefaultsMutation() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (data: Partial<SettingsDefaults>) =>
      api.updateSettingsDefaults(data),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['settingsDefaults'] }),
  })
}
