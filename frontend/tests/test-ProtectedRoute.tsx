import { render, screen } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'

vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom')
  return {
    ...actual,
    Navigate: ({ to }: { to: string }) => (<div data-testid="navigate-to">{to}</div>),
  }
})

const mockUseAuth = vi.fn()
vi.mock('../src/context/AuthContext', () => ({
  useAuth: () => mockUseAuth(),
  AuthProvider: ({ children }: { children: React.ReactNode }) => children,
}))

describe('ProtectedRoute', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  test('unauthenticated user gets redirected to /login', async () => {
    mockUseAuth.mockReturnValue({ loading: false, authenticated: false, setupComplete: true, role: null })

    const ProtectedRoute = (await import('../src/components/ProtectedRoute')).default

    render(
      <QueryClientProvider client={new QueryClient()}>
        <ProtectedRoute><span data-testid="children">Protected content</span></ProtectedRoute>
      </QueryClientProvider>
    )

    expect(screen.getByTestId('navigate-to')).toHaveTextContent('/login')
    expect(screen.queryByTestId('children')).not.toBeInTheDocument()
  })

  test('authenticated user sees children', async () => {
    mockUseAuth.mockReturnValue({ loading: false, authenticated: true, setupComplete: true, role: 'admin' })

    const ProtectedRoute = (await import('../src/components/ProtectedRoute')).default

    render(
      <QueryClientProvider client={new QueryClient()}>
        <ProtectedRoute><span data-testid="children">Protected content</span></ProtectedRoute>
      </QueryClientProvider>
    )

    expect(screen.getByTestId('children')).toBeInTheDocument()
  })

  test('user role redirected to /user/', async () => {
    mockUseAuth.mockReturnValue({ loading: false, authenticated: true, setupComplete: true, role: 'user' })

    const ProtectedRoute = (await import('../src/components/ProtectedRoute')).default

    render(
      <QueryClientProvider client={new QueryClient()}>
        <ProtectedRoute><span data-testid="children">Protected content</span></ProtectedRoute>
      </QueryClientProvider>
    )

    expect(screen.getByTestId('navigate-to')).toHaveTextContent('/user/')
    expect(screen.queryByTestId('children')).not.toBeInTheDocument()
  })

  test('loading state shows loading message', async () => {
    mockUseAuth.mockReturnValue({ loading: true, authenticated: false, setupComplete: true, role: null })

    const ProtectedRoute = (await import('../src/components/ProtectedRoute')).default

    render(
      <QueryClientProvider client={new QueryClient()}>
        <ProtectedRoute><span data-testid="children">Protected content</span></ProtectedRoute>
      </QueryClientProvider>
    )

    expect(screen.getByText('Loading...')).toBeInTheDocument()
    expect(screen.queryByTestId('children')).not.toBeInTheDocument()
    expect(screen.queryByTestId('navigate-to')).not.toBeInTheDocument()
  })

  test('incomplete setup redirects to /setup', async () => {
    mockUseAuth.mockReturnValue({ loading: false, authenticated: false, setupComplete: false, role: null })

    const ProtectedRoute = (await import('../src/components/ProtectedRoute')).default

    render(
      <QueryClientProvider client={new QueryClient()}>
        <ProtectedRoute><span data-testid="children">Protected content</span></ProtectedRoute>
      </QueryClientProvider>
    )

    expect(screen.getByTestId('navigate-to')).toHaveTextContent('/setup')
    expect(screen.queryByTestId('children')).not.toBeInTheDocument()
  })
})
