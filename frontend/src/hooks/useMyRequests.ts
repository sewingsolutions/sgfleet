import { useQuery } from '@tanstack/react-query'
import { api } from '../api/client'
import type { UserRequestsResponse } from '../api/types'

export function useMyRequests(limit = 20, offset = 0) {
  return useQuery<UserRequestsResponse, Error>({
    queryKey: ['userRequests', limit, offset],
    queryFn: () => api.user.getRequests(limit, offset),
  })
}
