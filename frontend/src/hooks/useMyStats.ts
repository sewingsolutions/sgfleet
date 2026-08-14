import { useQuery } from '@tanstack/react-query'
import { api } from '../api/client'
import type { UserStats } from '../api/types'

export function useMyStats(range = 'today') {
  return useQuery<UserStats, Error>({
    queryKey: ['userStats', range],
    queryFn: () => api.user.getStats(range),
    enabled: !!range,
  })
}
