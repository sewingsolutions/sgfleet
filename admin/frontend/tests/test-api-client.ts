import { afterEach } from 'vitest'

afterEach(() => {
  vi.restoreAllMocks()
})

describe('api client', () => {
  test('401 response throws "Unauthorized"', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      status: 401,
      ok: false,
    }))

    const { api } = await import('../src/api/client')
    await expect(api.getUsers()).rejects.toThrow('Unauthorized')
  })

  test('500 response throws error with detail', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      status: 500,
      ok: false,
      json: async () => ({ detail: 'Internal server error' }),
    }))

    const { api } = await import('../src/api/client')
    await expect(api.getUsers()).rejects.toThrow('Internal server error')
  })

  test('204 response returns undefined', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      status: 204,
      ok: true,
    }))

    const { api } = await import('../src/api/client')
    const result = await api.deleteUser(1)
    expect(result).toBeUndefined()
  })

  test('200 JSON response returns parsed data', async () => {
    const mockData = [{ id: 1, name: 'alice' }]
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      status: 200,
      ok: true,
      json: async () => mockData,
    }))

    const { api } = await import('../src/api/client')
    const result = await api.getUsers()
    expect(result).toEqual(mockData)
  })

  test('network error throws', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('network error')))

    const { api } = await import('../src/api/client')
    await expect(api.getUsers()).rejects.toThrow('network error')
  })
})
