import { useQuery } from '@tanstack/react-query'
import { api } from '../api/client'
import type { UserQuota } from '../api/types'

export function useMyQuota() {
  return useQuery<UserQuota, Error>({
    queryKey: ['userQuota'],
    queryFn: () => api.user.getQuota(),
  })
}
