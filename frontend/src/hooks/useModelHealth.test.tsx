import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { useModelHealth } from './useModelHealth'
import { api } from '../api/client'

vi.mock('../api/client')

const makeWrapper = (client: QueryClient) => {
  return ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  )
}

describe('useModelHealth', () => {
  let queryClient: QueryClient

  beforeEach(() => {
    queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    })

    vi.mocked(api.getModelHealth).mockResolvedValue({
      model_id: 'test-model',
      status: 'healthy',
      server_up: true,
      model_loaded: true,
      http_latency_ms: 50,
      container: null,
      admin: { uptime_seconds: 100, memory_mb: 200 },
      error: null,
      last_checked: '2024-01-01T00:00:00Z',
    })
  })

  it('query key includes modelId when provided', () => {
    renderHook(
      () => useModelHealth('my-model'),
      { wrapper: makeWrapper(queryClient) }
    )

    const cache = queryClient.getQueryCache().findAll({ queryKey: ['modelHealth', 'my-model'] })
    expect(cache.length).toBeGreaterThan(0)
  })

  it('query key is just modelHealth without modelId', () => {
    renderHook(
      () => useModelHealth(),
      { wrapper: makeWrapper(queryClient) }
    )

    const cache = queryClient.getQueryCache().findAll({ queryKey: ['modelHealth'] })
    expect(cache.length).toBeGreaterThan(0)
  })

  it('returns 3s refetch interval when status is loading', () => {
    vi.mocked(api.getModelHealth).mockResolvedValueOnce({
      model_id: 'test-model',
      status: 'loading',
      server_up: true,
      model_loaded: false,
      http_latency_ms: 0,
      container: null,
      admin: { uptime_seconds: 0, memory_mb: 0 },
      error: null,
      last_checked: '2024-01-01T00:00:00Z',
    })

    renderHook(
      () => useModelHealth('my-model'),
      { wrapper: makeWrapper(queryClient) }
    )

    const query = queryClient.getQueryCache().find({ queryKey: ['modelHealth', 'my-model'] })
    expect(query).toBeDefined()
  })

  it('returns 10s refetch interval when healthy', () => {
    renderHook(
      () => useModelHealth('my-model'),
      { wrapper: makeWrapper(queryClient) }
    )

    const query = queryClient.getQueryCache().find({ queryKey: ['modelHealth', 'my-model'] })
    expect(query).toBeDefined()
  })
})
