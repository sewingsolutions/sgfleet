import { render, screen, waitFor, fireEvent } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'

vi.mock('../src/utils/copyToClipboard', () => ({
  copyToClipboard: vi.fn(),
}))
const { copyToClipboard } = await import('../src/utils/copyToClipboard')

const mockGenerateConfig = vi.fn().mockResolvedValue({
  config_json: '{"key": "value"}',
  api_key: 'sk-test-key-123',
})

vi.mock('../src/api/client', () => ({
  api: {
    user: {
      generateConfig: (...args: unknown[]) => mockGenerateConfig(...args),
    },
    getGitLog: vi.fn().mockResolvedValue({ head: 'abc123', commits: [] }),
  },
}))

vi.mock('../src/context/AuthContext', () => ({
  useAuth: () => ({ user: { id: 1, name: 'test', email: 'test@test.com' }, name: 'test', logout: vi.fn() }),
}))

vi.mock('../src/context/ThemeContext', () => ({
  useTheme: () => ({ theme: 'system', setTheme: vi.fn() }),
}))

const renderPage = async () => {
  const UserConfigPage = (await import('../src/pages/user/UserConfigPage')).default
  return render(
    <QueryClientProvider client={new QueryClient()}>
      <MemoryRouter initialEntries={['/user/config']}>
        <UserConfigPage />
      </MemoryRouter>
    </QueryClientProvider>
  )
}

describe('UserConfigPage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  test('renders all tool cards', async () => {
    await renderPage()

    expect(screen.getByText('opencode')).toBeInTheDocument()
    expect(screen.getByText('Continue.dev')).toBeInTheDocument()
    expect(screen.getByText('Cline / Roo Code')).toBeInTheDocument()
    expect(screen.getByText('Open Interpreter')).toBeInTheDocument()
    expect(screen.getByText('Cursor')).toBeInTheDocument()
    expect(screen.getByText('Claude Code')).toBeInTheDocument()
  })

  test('renders Show token button', async () => {
    await renderPage()
    expect(screen.getByText('Show token')).toBeInTheDocument()
  })

  test('opens token panel on Show token click', async () => {
    await renderPage()
    await fireEvent.click(screen.getByText('Show token'))
    expect(screen.getByText('Generate a config below to see your token.')).toBeInTheDocument()
  })

  test('hides token panel on Hide click', async () => {
    await renderPage()
    await fireEvent.click(screen.getByText('Show token'))
    expect(screen.getByText('Generate a config below to see your token.')).toBeInTheDocument()

    await fireEvent.click(screen.getByRole('button', { name: 'Hide' }))
    expect(screen.queryByText('Generate a config below to see your token.')).not.toBeInTheDocument()
    expect(screen.getByText('Show token')).toBeInTheDocument()
  })

  test('displays API key after generating config', async () => {
    mockGenerateConfig.mockResolvedValue({
      config_json: '{"key": "value"}',
      api_key: 'sk-new-key-456',
    })

    await renderPage()
    await fireEvent.click(screen.getByText('Show token'))

    const generateBtn = screen.getAllByRole('button', { name: 'Generate' })[0]
    await fireEvent.click(generateBtn)

    await waitFor(() => {
      expect(screen.getByText('sk-new-key-456')).toBeInTheDocument()
    })
  })

  test('hides generated content without re-fetching', async () => {
    await renderPage()
    const generateBtn = screen.getAllByRole('button', { name: 'Generate' })[0]
    await fireEvent.click(generateBtn)

    await waitFor(() => {
      expect(screen.getByText('Hide')).toBeInTheDocument()
    })

    expect(mockGenerateConfig).toHaveBeenCalledTimes(1)

    await fireEvent.click(screen.getByRole('button', { name: 'Hide' }))

    await waitFor(() => {
      expect(screen.queryByText('Hide')).not.toBeInTheDocument()
    })

    expect(mockGenerateConfig).toHaveBeenCalledTimes(1)
  })

  test('reuses cached result on second Generate click', async () => {
    await renderPage()
    const generateBtn = screen.getAllByRole('button', { name: 'Generate' })[0]
    await fireEvent.click(generateBtn)

    await waitFor(() => {
      expect(screen.getByText('Hide')).toBeInTheDocument()
    })

    expect(mockGenerateConfig).toHaveBeenCalledTimes(1)

    await fireEvent.click(screen.getByRole('button', { name: 'Hide' }))

    await waitFor(() => {
      expect(screen.queryByText('Hide')).not.toBeInTheDocument()
    })

    await fireEvent.click(generateBtn)

    await waitFor(() => {
      expect(screen.getByText('Hide')).toBeInTheDocument()
    })

    expect(mockGenerateConfig).toHaveBeenCalledTimes(1)
  })

  test('uses copyToClipboard on Copy button click', async () => {
    await renderPage()
    const generateBtn = screen.getAllByRole('button', { name: 'Generate' })[0]
    await fireEvent.click(generateBtn)

    await waitFor(() => {
      expect(screen.getByText('Hide')).toBeInTheDocument()
    })

    const copyButtons = screen.getAllByRole('button', { name: 'Copy' })
    const cardCopyBtn = copyButtons.find(btn => btn.className.includes('bg-gray-200'))
    expect(cardCopyBtn).not.toBeNull()
    await fireEvent.click(cardCopyBtn!)

    expect(copyToClipboard).toHaveBeenCalled()
  })
})
