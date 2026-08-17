import type { SSEEvent } from '../api/types'

export interface ParsedDownloadSSE {
  event: SSEEvent
  progress?: number
  downloadedMb?: number
}

export function parseSSEEvent(line: string): SSEEvent | null {
  const trimmed = line.trim()
  if (!trimmed.startsWith('data: ')) return null
  try {
    return JSON.parse(trimmed.slice(6))
  } catch {
    return null
  }
}

export function parseDownloadSSE(line: string): ParsedDownloadSSE | null {
  const event = parseSSEEvent(line)
  if (!event) return null
  let progress: number | undefined
  let downloadedMb: number | undefined
  if (event.type === 'log' && event.line) {
    const pm = event.line.match(/(\d+)%/)
    if (pm) progress = parseFloat(pm[1])
    const dm = event.line.match(/Downloaded\s+([\d.]+)(MB|GB)/)
    if (dm) {
      const val = parseFloat(dm[1])
      const unit = dm[2]
      downloadedMb = unit === 'GB' ? val * 1024 : val
    }
  } else if (event.type === 'heartbeat' && event.progress !== undefined) {
    progress = event.progress
  }
  return { event, progress, downloadedMb }
}

export function validateDownload(options: {
  pathExists: boolean
  storageBytes: number
  freeBytes: number
  vramGb: number
  selectedVramGb: number
}): { ok: boolean; errors: string[] } {
  const errors: string[] = []
  if (options.pathExists) errors.push('Model files already exist at this path')
  if (options.storageBytes && options.freeBytes < options.storageBytes) errors.push('Not enough disk space')
  if (options.vramGb > options.selectedVramGb) {
    errors.push(`Model needs ${options.vramGb.toFixed(1)} GB but selected GPUs only have ${options.selectedVramGb.toFixed(1)} GB`)
  }
  return { ok: errors.length === 0, errors }
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return bytes + ' B'
  if (bytes < 1024 ** 2) return (bytes / 1024).toFixed(1) + ' KB'
  if (bytes < 1024 ** 3) return (bytes / 1024 ** 2).toFixed(1) + ' MB'
  return (bytes / 1024 ** 3).toFixed(1) + ' GB'
}

export function formatParams(n: number): string {
  if (n >= 1e12) return (n / 1e12).toFixed(1) + 'T'
  if (n >= 1e9) return (n / 1e9).toFixed(1) + 'B'
  if (n >= 1e6) return (n / 1e6).toFixed(1) + 'M'
  return String(n)
}
