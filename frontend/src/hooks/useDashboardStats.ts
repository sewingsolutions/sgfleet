import { useQuery } from '@tanstack/react-query'
import { api } from '../api/client'
import type { DashboardStats } from '../api/types'

export function useDashboardStats() {
  return useQuery<DashboardStats, Error>({
    queryKey: ['dashboardStats'],
    queryFn: () => api.getDashboardStats(),
    staleTime: 30000,
  })
}
