import { renderHook, act } from '@testing-library/react'
import { screen } from '@testing-library/react'

describe('useToast', () => {
  test('returns a function when used without provider', async () => {
    const { useToast } = await import('../src/hooks/useToast')
    const { result } = renderHook(() => useToast())
    expect(typeof result.current).toBe('function')
    expect(() => result.current('hello')).not.toThrow()
  })

  test('ToastProvider shows message on toast call', async () => {
    const ToastProvider = (await import('../src/components/Toast')).default
    const { useToast } = await import('../src/hooks/useToast')

    const { result } = renderHook(() => useToast(), {
      wrapper: ({ children }) => <ToastProvider>{children}</ToastProvider>,
    })

    expect(screen.queryByText('Hello toast')).not.toBeInTheDocument()

    act(() => {
      result.current('Hello toast')
    })

    expect(screen.getByText('Hello toast')).toBeInTheDocument()
  })

  test('ToastProvider auto-clears after timeout', async () => {
    vi.useFakeTimers()

    const ToastProvider = (await import('../src/components/Toast')).default
    const { useToast } = await import('../src/hooks/useToast')

    const { result } = renderHook(() => useToast(), {
      wrapper: ({ children }) => <ToastProvider>{children}</ToastProvider>,
    })

    act(() => {
      result.current('Will disappear')
    })

    expect(screen.getByText('Will disappear')).toBeInTheDocument()

    await act(async () => {
      vi.advanceTimersByTime(2000)
    })

    expect(screen.queryByText('Will disappear')).not.toBeInTheDocument()

    vi.useRealTimers()
  })
})
