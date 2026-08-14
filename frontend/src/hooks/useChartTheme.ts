import { useMemo } from 'react'
import { useTheme } from '../context/ThemeContext'

export interface ChartTheme {
  gridColor: string
  tickColor: string
  legendColor: string
  p50: string
  p95: string
  c429: string
  requests: string
  cost: string
  prompt: string
  completion: string
}

const light: ChartTheme = {
  gridColor: '#e5e7eb',
  tickColor: '#6b7280',
  legendColor: '#6b7280',
  p50: '#059669',
  p95: '#d97706',
  c429: '#dc2626',
  requests: '#4f46e5',
  cost: '#d97706',
  prompt: '#7c3aed',
  completion: '#0891b2',
}

const dark: ChartTheme = {
  gridColor: '#1e293b',
  tickColor: '#9ca3af',
  legendColor: '#9ca3af',
  p50: '#10b981',
  p95: '#f59e0b',
  c429: '#ef4444',
  requests: '#6366f1',
  cost: '#f59e0b',
  prompt: '#8b5cf6',
  completion: '#06b6d4',
}

export function useChartTheme(): ChartTheme {
  const { resolvedTheme } = useTheme()

  return useMemo(() => (resolvedTheme === 'dark' ? dark : light), [resolvedTheme])
}
