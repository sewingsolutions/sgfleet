import { render, screen, waitFor, fireEvent } from '@testing-library/react'

vi.mock('../src/hooks/useToast', () => ({
  useToast: () => vi.fn(),
}))

const mockGenerateConfig = vi.fn().mockResolvedValue({
  config_json: '{"endpoint": "http://localhost"}',
  api_key: 'sk-rotated-key',
  rotated: false,
})

vi.mock('../src/api/client', () => ({
  api: {
    generateConfig: (...args: unknown[]) => mockGenerateConfig(...args),
  },
}))

describe('ConfigModal', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  test('renders without model selection', async () => {
    const ConfigModal = (await import('../src/components/ConfigModal')).default
    render(<ConfigModal userId={1} userName="alice" onClose={vi.fn()} />)

    expect(screen.getByText('Generate opencode.json for')).toBeInTheDocument()
    expect(screen.getByText('alice')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Generate Config' })).toBeInTheDocument()
    // No model dropdown should be present
    expect(screen.queryByRole('combobox')).not.toBeInTheDocument()
  })

  test('displays rotate option checkbox', async () => {
    const ConfigModal = (await import('../src/components/ConfigModal')).default
    render(<ConfigModal userId={1} userName="alice" onClose={vi.fn()} />)

    expect(screen.getByText('Rotate API key (generates a new key)')).toBeInTheDocument()
  })

  test('submits config generation request', async () => {
    const onClose = vi.fn()
    const ConfigModal = (await import('../src/components/ConfigModal')).default
    render(<ConfigModal userId={1} userName="alice" onClose={onClose} />)

    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Generate Config' })).toBeEnabled()
    })

    await fireEvent.click(screen.getByRole('button', { name: 'Generate Config' }))

    await waitFor(() => {
      expect(mockGenerateConfig).toHaveBeenCalledWith(1, false)
    })

    await waitFor(() => {
      expect(screen.getByText('opencode.json config:')).toBeInTheDocument()
    })
  })

  test('handles rotate option', async () => {
    mockGenerateConfig.mockResolvedValue({
      config_json: '{"endpoint": "http://localhost"}',
      api_key: 'sk-rotated-key',
      rotated: true,
    })

    const ConfigModal = (await import('../src/components/ConfigModal')).default
    render(<ConfigModal userId={1} userName="alice" onClose={vi.fn()} />)

    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Generate Config' })).toBeEnabled()
    })

    const rotateCheckbox = screen.getByLabelText('Rotate API key (generates a new key)')
    await fireEvent.click(rotateCheckbox)
    expect(rotateCheckbox).toBeChecked()

    await fireEvent.click(screen.getByRole('button', { name: 'Generate Config' }))

    await waitFor(() => {
      expect(mockGenerateConfig).toHaveBeenCalledWith(1, true)
    })
  })
})
