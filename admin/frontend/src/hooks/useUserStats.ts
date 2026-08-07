import { useQuery } from '@tanstack/react-query'
import { api } from '../api/client'
import type { Stats, UserSummary, FleetStats } from '../api/types'

export function useUserStats(userId: number | undefined, range: string) {
  return useQuery<Stats, Error>({
    queryKey: ['userStats', userId, range],
    queryFn: () => {
      if (!userId) throw new Error('No user selected')
      return api.getUserStats(userId, range)
    },
    enabled: !!userId,
  })
}

export function useUserSummary(userId: number | undefined) {
  return useQuery<UserSummary, Error>({
    queryKey: ['userSummary', userId],
    queryFn: () => {
      if (!userId) throw new Error('No user selected')
      return api.getUserSummary(userId)
    },
    enabled: !!userId,
    staleTime: 10_000,
  })
}

export function useFleetStats(range: string) {
  return useQuery<FleetStats, Error>({
    queryKey: ['fleetStats', range],
    queryFn: () => api.getFleetStats(range),
    staleTime: 10_000,
  })
}
