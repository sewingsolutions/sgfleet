import { renderHook, act, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'

const mockNavigate = vi.fn()
const mockLocation = { pathname: '/users' }

vi.mock('react-router-dom', () => ({
  useNavigate: () => mockNavigate,
  useLocation: () => mockLocation,
  MemoryRouter: ({ children }: { children: React.ReactNode }) => children,
}))

const mockCheckAuth = vi.fn()
const mockLogin = vi.fn()
const mockLogout = vi.fn()

vi.mock('../src/api/client', () => ({
  api: {
    checkAuth: () => mockCheckAuth(),
    login: (key: string) => mockLogin(key),
    logout: () => mockLogout(),
  },
}))

describe('AuthContext', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockNavigate.mockClear()
    Object.defineProperty(mockLocation, 'pathname', { value: '/users' })
  })

  test('initial state: loading=true, authenticated=false', async () => {
    mockCheckAuth.mockReturnValue(new Promise(() => {}))

    const { AuthProvider, useAuth } = await import('../src/context/AuthContext')

    const { result } = renderHook(() => useAuth(), {
      wrapper: ({ children }) => (
        <MemoryRouter>
          <AuthProvider>{children}</AuthProvider>
        </MemoryRouter>
      ),
    })

    expect(result.current.loading).toBe(true)
    expect(result.current.authenticated).toBe(false)
  })

  test('checkAuth success sets authenticated=true', async () => {
    mockCheckAuth.mockResolvedValue([])

    const { AuthProvider, useAuth } = await import('../src/context/AuthContext')

    const { result } = renderHook(() => useAuth(), {
      wrapper: ({ children }) => (
        <MemoryRouter>
          <AuthProvider>{children}</AuthProvider>
        </MemoryRouter>
      ),
    })

    await waitFor(() => {
      expect(result.current.authenticated).toBe(true)
      expect(result.current.loading).toBe(false)
    })
  })

  test('checkAuth failure sets authenticated=false', async () => {
    mockCheckAuth.mockRejectedValue(new Error('Unauthorized'))

    const { AuthProvider, useAuth } = await import('../src/context/AuthContext')

    const { result } = renderHook(() => useAuth(), {
      wrapper: ({ children }) => (
        <MemoryRouter>
          <AuthProvider>{children}</AuthProvider>
        </MemoryRouter>
      ),
    })

    await waitFor(() => {
      expect(result.current.authenticated).toBe(false)
      expect(result.current.loading).toBe(false)
    })
  })

  test('login success sets authenticated and navigates', async () => {
    mockCheckAuth.mockResolvedValue([])
    mockLogin.mockResolvedValue({ url: '/admin/users' } as Response)

    const { AuthProvider, useAuth } = await import('../src/context/AuthContext')

    const { result } = renderHook(() => useAuth(), {
      wrapper: ({ children }) => (
        <MemoryRouter>
          <AuthProvider>{children}</AuthProvider>
        </MemoryRouter>
      ),
    })

    // Wait for initial checkAuth to complete
    await waitFor(() => result.current.authenticated === true)

    await act(async () => {
      const ok = await result.current.login('some-key')
      expect(ok).toBe(true)
    })

    await waitFor(() => {
      expect(result.current.authenticated).toBe(true)
    })
    expect(mockNavigate).toHaveBeenCalledWith('/users', { replace: true })
  })

  test('login failure returns false', async () => {
    mockCheckAuth.mockResolvedValue([])
    mockLogin.mockResolvedValue({ url: '/admin/login' } as Response)

    const { AuthProvider, useAuth } = await import('../src/context/AuthContext')

    const { result } = renderHook(() => useAuth(), {
      wrapper: ({ children }) => (
        <MemoryRouter>
          <AuthProvider>{children}</AuthProvider>
        </MemoryRouter>
      ),
    })

    // Wait for initial checkAuth to complete
    await waitFor(() => result.current.authenticated === true)

    await act(async () => {
      const ok = await result.current.login('bad-key')
      expect(ok).toBe(false)
    })

    expect(result.current.authenticated).toBe(true)
  })

  test('logout calls api.logout and navigates to /login', async () => {
    mockCheckAuth.mockResolvedValue([])
    mockLogout.mockResolvedValue({} as Response)

    const { AuthProvider, useAuth } = await import('../src/context/AuthContext')

    const { result } = renderHook(() => useAuth(), {
      wrapper: ({ children }) => (
        <MemoryRouter>
          <AuthProvider>{children}</AuthProvider>
        </MemoryRouter>
      ),
    })

    // Wait for initial checkAuth
    await waitFor(() => result.current.authenticated === true)

    await act(async () => {
      await result.current.logout()
    })

    expect(mockLogout).toHaveBeenCalled()
    expect(result.current.authenticated).toBe(false)
    expect(mockNavigate).toHaveBeenCalledWith('/login', { replace: true })
  })
})
