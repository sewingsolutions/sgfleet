import { useQuery } from '@tanstack/react-query'
import { api } from '../api/client'

export function useGitLog() {
  return useQuery({
    queryKey: ['gitLog'],
    queryFn: () => api.getGitLog(),
  })
}
