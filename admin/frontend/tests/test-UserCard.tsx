import { render, screen, waitFor, fireEvent } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'

const mockUpdateUser = vi.fn().mockResolvedValue({})
const mockRotateKey = vi.fn().mockResolvedValue({ api_key: 'new-key-123' })
const mockDeleteUser = vi.fn().mockResolvedValue({})

vi.mock('../src/hooks/useUsers', () => ({
  useUpdateUserMutation: () => ({ mutateAsync: mockUpdateUser }),
  useRotateKeyMutation: () => ({ mutateAsync: mockRotateKey }),
  useDeleteUserMutation: () => ({ mutateAsync: mockDeleteUser }),
}))

vi.mock('../src/hooks/useToast', () => ({
  useToast: () => vi.fn(),
}))

vi.mock('../src/components/ConfigModal', () => ({
  default: vi.fn(() => null),
}))

const makeWrapper = () => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return ({ children }: { children: React.ReactNode }) =>
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
}

const mockUser = {
  id: 1,
  name: 'alice',
  is_active: true,
  rate_limit: 5,
  max_concurrent: 3,
  request_cost: 0.001,
  daily_quota: 1000,
  today_requests: 500,
  total_requests: 10000,
  created_at: '2024-01-15T00:00:00Z',
  api_key: 'sk-xxxx',
  email: 'alice@example.com',
  notes: null,
}

describe('UserCard', () => {
  let UserCard: React.ComponentType

  beforeAll(async () => {
    UserCard = (await import('../src/components/UserCard')).default
  })

  beforeEach(() => {
    vi.clearAllMocks()
  })

  test('renders user name, badge, and stats', () => {
    render(<UserCard user={mockUser} />, { wrapper: makeWrapper() })

    expect(screen.getByText('alice')).toBeInTheDocument()
    expect(screen.getByText('Active')).toBeInTheDocument()
    expect(screen.getByText('5')).toBeInTheDocument()
  })

  test('shows quota progress bar when daily_quota is set', () => {
    render(<UserCard user={mockUser} />, { wrapper: makeWrapper() })

    expect(screen.getByText('500 / 1k today')).toBeInTheDocument()
    expect(screen.getByText('50%')).toBeInTheDocument()
  })

  test('quota color is green when under 80%', () => {
    render(<UserCard user={{ ...mockUser, today_requests: 400, daily_quota: 1000 }} />, { wrapper: makeWrapper() })

    const bar = document.querySelector('[style*="width"]')
    expect(bar?.className).toContain('bg-emerald-500')
  })

  test('quota color is amber at 80%', () => {
    render(<UserCard user={{ ...mockUser, today_requests: 800, daily_quota: 1000 }} />, { wrapper: makeWrapper() })

    const bar = document.querySelector('[style*="width"]')
    expect(bar?.className).toContain('bg-amber-500')
  })

  test('quota color is red at 100%', () => {
    render(<UserCard user={{ ...mockUser, today_requests: 1000, daily_quota: 1000 }} />, { wrapper: makeWrapper() })

    const bar = document.querySelector('[style*="width"]')
    expect(bar?.className).toContain('bg-red-500')
  })

  test('toggle button fires update mutation', async () => {
    render(<UserCard user={mockUser} />, { wrapper: makeWrapper() })

    const disableBtn = screen.getByText('Disable')
    await fireEvent.click(disableBtn)

    expect(mockUpdateUser).toHaveBeenCalledWith({
      id: 1,
      data: { is_active: false },
    })
  })

  test('rotate key button shows key display', async () => {
    render(<UserCard user={mockUser} />, { wrapper: makeWrapper() })

    const rotateBtn = screen.getByText('Rotate Key')
    await fireEvent.click(rotateBtn)

    await waitFor(() => {
      expect(screen.getByText('new-key-123')).toBeInTheDocument()
    })
  })
})
