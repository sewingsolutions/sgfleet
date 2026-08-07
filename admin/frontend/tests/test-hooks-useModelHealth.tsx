describe('useModelHealth', () => {
  test('hook is defined', async () => {
    const { useModelHealth } = await import('../src/hooks/useModelHealth')
    expect(useModelHealth).toBeDefined()
    expect(typeof useModelHealth).toBe('function')
  })

  test('getModelHealth API method exists', async () => {
    const { api } = await import('../src/api/client')
    expect(api.getModelHealth).toBeDefined()
    expect(typeof api.getModelHealth).toBe('function')
  })

  test('useModelHealthRefetch is defined', async () => {
    const { useModelHealthRefetch } = await import('../src/hooks/useModelHealth')
    expect(useModelHealthRefetch).toBeDefined()
    expect(typeof useModelHealthRefetch).toBe('function')
  })

  test('getModelHealth returns health data on success', async () => {
    const mockHealth = {
      status: 'healthy',
      server_up: true,
      model_loaded: true,
      http_latency_ms: 12,
      container: {
        name: 'sglang-qwen36-27b',
        state: 'running',
        started_at: '2025-01-01T00:00:00Z',
        restart_count: 0,
        health_status: 'healthy',
      },
      admin: { uptime_seconds: 18000, memory_mb: 256 },
      profile_state: 'active',
      error: null,
      last_checked: '2025-01-01T00:00:00Z',
    }

    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      status: 200,
      ok: true,
      json: async () => mockHealth,
    }))

    const { api } = await import('../src/api/client')
    const result = await api.getModelHealth()
    expect(result.status).toBe('healthy')
    expect(result.http_latency_ms).toBe(12)
    expect(result.container?.name).toBe('sglang-qwen36-27b')
    expect(result.admin.uptime_seconds).toBe(18000)
  })

  test('getModelHealth returns loading status', async () => {
    const mockHealth = {
      status: 'loading',
      server_up: true,
      model_loaded: false,
      http_latency_ms: 5,
      container: null,
      admin: { uptime_seconds: 100, memory_mb: 128 },
      profile_state: 'switching',
      error: null,
      last_checked: '2025-01-01T00:00:00Z',
    }

    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      status: 200,
      ok: true,
      json: async () => mockHealth,
    }))

    const { api } = await import('../src/api/client')
    const result = await api.getModelHealth()
    expect(result.status).toBe('loading')
    expect(result.profile_state).toBe('switching')
    expect(result.model_loaded).toBe(false)
  })

  test('getModelHealth returns unreachable status', async () => {
    const mockHealth = {
      status: 'unreachable',
      server_up: false,
      model_loaded: false,
      http_latency_ms: 0,
      container: null,
      admin: { uptime_seconds: 500, memory_mb: 64 },
      profile_state: 'active',
      error: 'sglang server connection refused',
      last_checked: '2025-01-01T00:00:00Z',
    }

    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      status: 200,
      ok: true,
      json: async () => mockHealth,
    }))

    const { api } = await import('../src/api/client')
    const result = await api.getModelHealth()
    expect(result.status).toBe('unreachable')
    expect(result.server_up).toBe(false)
    expect(result.error).toBe('sglang server connection refused')
  })
})
