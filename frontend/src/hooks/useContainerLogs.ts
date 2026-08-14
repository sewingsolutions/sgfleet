/* eslint-disable react-hooks/set-state-in-effect */
import { useState, useEffect, useRef, useCallback, useMemo } from 'react'
import type { LogStreamEvent } from '../api/types'

export interface LogLine {
  text: string
  timestamp: string | null
  content: string
  level: 'ERROR' | 'WARNING' | 'INFO' | 'DEBUG' | 'TIMESTAMP' | 'NORMAL'
}

function classifyLine(raw: string): LogLine {
  let timestamp: string | null = null
  let content = raw

  const tsMatch = raw.match(/^(\d{4}-\d{2}-\d{2}T[\d:.]+Z?)\s(.*)/)
  if (tsMatch) {
    timestamp = tsMatch[1]
    content = tsMatch[2]
  }

  const upper = content.toUpperCase()
  let level: LogLine['level'] = 'NORMAL'
  if (upper.includes('ERROR')) level = 'ERROR'
  else if (upper.includes('WARNING')) level = 'WARNING'
  else if (upper.includes('INFO')) level = 'INFO'
  else if (upper.includes('DEBUG')) level = 'DEBUG'
  else if (content.match(/^\[\d{4}-\d{2}-\d{2}\s[\d:]+\]/)) level = 'TIMESTAMP'

  return { text: raw, timestamp, content, level }
}

export function useContainerLogs(modelId: string, tail: number, active: boolean) {
  const [lines, setLines] = useState<LogLine[]>([])
  const [status, setStatus] = useState<'connecting' | 'streaming' | 'ended' | 'error'>('connecting')
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [reconnectKey, setReconnectKey] = useState(0)
  const abortRef = useRef<AbortController | null>(null)

  const parseLine = useMemo(() => classifyLine, [])

  useEffect(() => {
    if (!active) return

    if (abortRef.current) {
      abortRef.current.abort()
    }

    setLines([])
    setErrorMessage(null)
    setStatus('connecting')

    const abort = new AbortController()
    abortRef.current = abort

    const url = `/admin/api/models/${encodeURIComponent(modelId)}/logs/stream?tail=${tail}`

    fetch(url, { credentials: 'same-origin', signal: abort.signal })
      .then(async (response) => {
        const reader = response.body?.getReader()
        if (!reader) {
          setStatus('error')
          setErrorMessage('Unable to read logs')
          return
        }

        setStatus('streaming')
        const decoder = new TextDecoder()
        let buffer = ''
        const batch: LogLine[] = []
        let batchCount = 0

        while (true) {
          const { done, value } = await reader.read()
          if (done) break

          buffer += decoder.decode(value, { stream: true })
          const lineSegments = buffer.split('\n\n')
          buffer = lineSegments.pop() || ''

          for (const segment of lineSegments) {
            const segLines = segment.split('\n')
            for (const line of segLines) {
              if (!line.startsWith('data: ')) continue
              try {
                const event: LogStreamEvent = JSON.parse(line.slice(6))
                if (event.type === 'line') {
                  batch.push(parseLine(event.line))
                  batchCount++
                  if (batchCount >= 50) {
                    setLines((prev) => [...prev, ...batch])
                    batch.length = 0
                    batchCount = 0
                  }
                } else if (event.type === 'eof') {
                  if (batch.length > 0) {
                    setLines((prev) => [...prev, ...batch])
                    batch.length = 0
                  }
                  setStatus('ended')
                  return
                } else if (event.type === 'error') {
                  if (batch.length > 0) {
                    setLines((prev) => [...prev, ...batch])
                    batch.length = 0
                  }
                  setErrorMessage(event.message)
                  setStatus('error')
                  return
                }
              } catch { /* skip malformed events */ }
            }
          }
        }

        if (batch.length > 0) {
          setLines((prev) => [...prev, ...batch])
        }
        setStatus('ended')
      })
      .catch((e) => {
        if (e.name !== 'AbortError') {
          setErrorMessage(e.message)
          setStatus('error')
        }
      })

    return () => {
      abort.abort()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [modelId, tail, active, reconnectKey])

  const reconnect = useCallback(() => {
    setReconnectKey((k) => k + 1)
  }, [])

  return { lines, status, errorMessage, reconnect }
}
