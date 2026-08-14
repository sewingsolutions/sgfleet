import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook } from '@testing-library/react'
import { useChartTheme } from './useChartTheme'
import { ThemeProvider } from '../context/ThemeContext'

describe('useChartTheme', () => {
  beforeEach(() => {
    vi.stubGlobal('matchMedia', (query: string) => ({
      matches: query.includes('dark'),
      media: query,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: () => false,
    }))
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('returns dark theme colors when resolvedTheme is dark', () => {
    const { result } = renderHook(
      () => useChartTheme(),
      {
        wrapper: ({ children }) => (
          <ThemeProvider>
            {children}
          </ThemeProvider>
        ),
      }
    )

    const theme = result.current
    expect(theme.gridColor).toBe('#1e293b')
    expect(theme.tickColor).toBe('#9ca3af')
    expect(theme.legendColor).toBe('#9ca3af')
    expect(theme.p50).toBe('#10b981')
    expect(theme.p95).toBe('#f59e0b')
    expect(theme.c429).toBe('#ef4444')
    expect(theme.requests).toBe('#6366f1')
    expect(theme.cost).toBe('#f59e0b')
    expect(theme.prompt).toBe('#8b5cf6')
    expect(theme.completion).toBe('#06b6d4')
  })

  it('returns light theme colors when resolvedTheme is light', () => {
    vi.stubGlobal('matchMedia', () => ({
      matches: false,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: () => false,
    }))

    const { result } = renderHook(
      () => useChartTheme(),
      {
        wrapper: ({ children }) => (
          <ThemeProvider>
            {children}
          </ThemeProvider>
        ),
      }
    )

    const theme = result.current
    expect(theme.gridColor).toBe('#e5e7eb')
    expect(theme.tickColor).toBe('#6b7280')
    expect(theme.legendColor).toBe('#6b7280')
    expect(theme.p50).toBe('#059669')
    expect(theme.p95).toBe('#d97706')
    expect(theme.c429).toBe('#dc2626')
    expect(theme.requests).toBe('#4f46e5')
    expect(theme.cost).toBe('#d97706')
    expect(theme.prompt).toBe('#7c3aed')
    expect(theme.completion).toBe('#0891b2')
  })
})
