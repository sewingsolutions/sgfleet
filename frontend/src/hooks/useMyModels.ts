import { useQuery } from '@tanstack/react-query'
import { api } from '../api/client'
import type { UserModelsResponse } from '../api/types'

export function useMyModels() {
  return useQuery<UserModelsResponse, Error>({
    queryKey: ['userModels'],
    queryFn: () => api.user.getModels(),
  })
}
