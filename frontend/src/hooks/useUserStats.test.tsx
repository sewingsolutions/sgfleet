import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { useUserStats, useUserSummary } from './useUserStats'
import { api } from '../api/client'

vi.mock('../api/client')

const makeWrapper = (client: QueryClient) => {
  return ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  )
}

describe('useUserStats', () => {
  let queryClient: QueryClient

  beforeEach(() => {
    queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    })

    vi.mocked(api.getUserStats).mockResolvedValue({
      labels: ['2024-01-01'],
      requests: [10],
      costs: [0.5],
      latency_p50: [50],
      latency_p95: [100],
      count_429: [0],
      prompt_tokens: [1000],
      completion_tokens: [500],
      total_tokens: [1500],
    })
  })

  it('query is disabled when userId is undefined', () => {
    renderHook(
      () => useUserStats(undefined, '24h'),
      { wrapper: makeWrapper(queryClient) }
    )

    expect(api.getUserStats).not.toHaveBeenCalled()
  })

  it('query is enabled when userId is provided', () => {
    renderHook(
      () => useUserStats(1, '24h'),
      { wrapper: makeWrapper(queryClient) }
    )

    expect(api.getUserStats).toHaveBeenCalledWith(1, '24h')
  })
})

describe('useUserSummary', () => {
  let queryClient: QueryClient

  beforeEach(() => {
    queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    })

    vi.mocked(api.getUserSummary).mockResolvedValue({
      total_requests: 100,
      total_cost: 5.0,
      today_requests: 10,
      daily_quota: null,
      prompt_tokens: 10000,
      completion_tokens: 5000,
      total_tokens: 15000,
    })
  })

  it('query is disabled when userId is undefined', () => {
    renderHook(
      () => useUserSummary(undefined),
      { wrapper: makeWrapper(queryClient) }
    )

    expect(api.getUserSummary).not.toHaveBeenCalled()
  })

  it('query is enabled when userId is provided', () => {
    renderHook(
      () => useUserSummary(1),
      { wrapper: makeWrapper(queryClient) }
    )

    expect(api.getUserSummary).toHaveBeenCalledWith(1)
  })
})
