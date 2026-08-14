import { renderHook, act, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'

const mockNavigate = vi.fn()
const mockLocation = { pathname: '/users' }

vi.mock('react-router-dom', () => ({
  useNavigate: () => mockNavigate,
  useLocation: () => mockLocation,
  MemoryRouter: ({ children }: { children: React.ReactNode }) => children,
}))

const mockCheckSession = vi.fn()
const mockLogin = vi.fn()
const mockLogout = vi.fn()
const mockGetSetupStatus = vi.fn()

vi.mock('../src/api/client', () => ({
  api: {
    getSetupStatus: () => mockGetSetupStatus(),
    checkSession: () => mockCheckSession(),
    login: (key: string) => mockLogin(key),
    logout: () => mockLogout(),
  },
}))

describe('AuthContext', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockNavigate.mockClear()
    Object.defineProperty(mockLocation, 'pathname', { value: '/users' })
    mockGetSetupStatus.mockResolvedValue({ setup_complete: true })
  })

  test('initial state: loading=true, authenticated=false', async () => {
    mockCheckSession.mockReturnValue(new Promise(() => {}))

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

  test('checkSession success sets authenticated=true', async () => {
    mockCheckSession.mockResolvedValue({ role: 'admin', name: 'Admin' })

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

  test('checkSession failure sets authenticated=false', async () => {
    mockCheckSession.mockRejectedValue(new Error('Unauthorized'))

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
    mockCheckSession.mockResolvedValue({ role: 'admin', name: 'Admin' })
    mockLogin.mockResolvedValue({ url: '/user/' } as Response)

    const { AuthProvider, useAuth } = await import('../src/context/AuthContext')

    const { result } = renderHook(() => useAuth(), {
      wrapper: ({ children }) => (
        <MemoryRouter>
          <AuthProvider>{children}</AuthProvider>
        </MemoryRouter>
      ),
    })

    // Wait for initial checkSession to complete
    await waitFor(() => result.current.authenticated === true)

    await act(async () => {
      const ok = await result.current.login('some-key')
      expect(ok).toBe(true)
    })

    await waitFor(() => {
      expect(result.current.authenticated).toBe(true)
    })
    expect(mockNavigate).toHaveBeenCalledWith('/user/', { replace: true })
  })

  test('login failure returns false', async () => {
    mockCheckSession.mockResolvedValue({ role: 'admin', name: 'Admin' })
    mockLogin.mockResolvedValue({ url: '/login' } as Response)

    const { AuthProvider, useAuth } = await import('../src/context/AuthContext')

    const { result } = renderHook(() => useAuth(), {
      wrapper: ({ children }) => (
        <MemoryRouter>
          <AuthProvider>{children}</AuthProvider>
        </MemoryRouter>
      ),
    })

    // Wait for initial checkSession to complete
    await waitFor(() => result.current.authenticated === true)

    await act(async () => {
      const ok = await result.current.login('bad-key')
      expect(ok).toBe(false)
    })

    expect(result.current.authenticated).toBe(true)
  })

  test('setup incomplete sets setupComplete=false and skips checkSession', async () => {
    mockGetSetupStatus.mockResolvedValue({ setup_complete: false })

    const { AuthProvider, useAuth } = await import('../src/context/AuthContext')

    const { result } = renderHook(() => useAuth(), {
      wrapper: ({ children }) => (
        <MemoryRouter>
          <AuthProvider>{children}</AuthProvider>
        </MemoryRouter>
      ),
    })

    await waitFor(() => {
      expect(result.current.setupComplete).toBe(false)
      expect(result.current.authenticated).toBe(false)
      expect(result.current.loading).toBe(false)
    })
    expect(mockCheckSession).not.toHaveBeenCalled()
  })

  test('getSetupStatus error treats setup as incomplete', async () => {
    mockGetSetupStatus.mockRejectedValue(new Error('network error'))

    const { AuthProvider, useAuth } = await import('../src/context/AuthContext')

    const { result } = renderHook(() => useAuth(), {
      wrapper: ({ children }) => (
        <MemoryRouter>
          <AuthProvider>{children}</AuthProvider>
        </MemoryRouter>
      ),
    })

    await waitFor(() => {
      expect(result.current.setupComplete).toBe(false)
      expect(result.current.authenticated).toBe(false)
      expect(result.current.loading).toBe(false)
    })
    expect(mockCheckSession).not.toHaveBeenCalled()
  })

  test('logout calls api.logout and navigates to /login', async () => {
    mockCheckSession.mockResolvedValue({ role: 'admin', name: 'Admin' })
    mockLogout.mockResolvedValue({} as Response)

    const { AuthProvider, useAuth } = await import('../src/context/AuthContext')

    const { result } = renderHook(() => useAuth(), {
      wrapper: ({ children }) => (
        <MemoryRouter>
          <AuthProvider>{children}</AuthProvider>
        </MemoryRouter>
      ),
    })

    // Wait for initial checkSession
    await waitFor(() => result.current.authenticated === true)

    await act(async () => {
      await result.current.logout()
    })

    expect(mockLogout).toHaveBeenCalled()
    expect(result.current.authenticated).toBe(false)
    expect(mockNavigate).toHaveBeenCalledWith('/login', { replace: true })
  })
})
