import { useMutation } from '@tanstack/react-query'
import { api } from '../api/client'
import type { UserConfigResponse } from '../api/types'

export function useGenerateConfig() {
  return useMutation<UserConfigResponse, Error, string>({
    mutationKey: ['generateConfig'],
    mutationFn: async (clientId: string) => api.user.generateConfig(clientId),
  })
}
