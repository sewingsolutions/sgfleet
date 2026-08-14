import { useState, useCallback } from 'react'
import UserLayout from '../components/UserLayout'
import CodeBlock from '../components/CodeBlock'
import { api } from '../api/client'
import type { UserConfigResponse, CursorChecklistItem } from '../api/types'

const tools = [
  {
    id: 'opencode',
    name: 'opencode',
    description: 'Generate an .opencode.json configuration snippet for SGFleet access.',
    configType: 'code' as const,
    language: 'json',
  },
  {
    id: 'continue',
    name: 'Continue.dev',
    description: 'Configure Continue.dev to use SGFleet as an OpenAI-compatible provider.',
    configType: 'code' as const,
    language: 'json',
  },
  {
    id: 'cline',
    name: 'Cline / Roo Code',
    description: 'VS Code settings JSON for Cline or Roo Code extension.',
    configType: 'code' as const,
    language: 'json',
  },
  {
    id: 'interpreter',
    name: 'Open Interpreter',
    description: 'YAML profile for Open Interpreter with SGFleet as the model provider.',
    configType: 'code' as const,
    language: 'yaml',
  },
  {
    id: 'cursor',
    name: 'Cursor',
    description: 'Step-by-step checklist to configure Cursor IDE with SGFleet.',
    configType: 'checklist' as const,
  },
  {
    id: 'claude_code',
    name: 'Claude Code',
    description: 'Shell environment variables and command for Claude Code.',
    configType: 'code' as const,
    language: 'shell',
  },
]

const Card = ({
  tool,
  loading,
  result,
  checklist,
  error,
  onGenerate,
}: {
  tool: (typeof tools)[0]
  loading: boolean
  result: UserConfigResponse | null
  checklist: CursorChecklistItem[] | null
  error: string | null
  onGenerate: () => void
}) => {
  const [copiedIndex, setCopiedIndex] = useState<number | null>(null)
  const [copiedApi, setCopiedApi] = useState(false)

  const copyValue = (text: string, idx: number) => {
    navigator.clipboard.writeText(text)
    setCopiedIndex(idx)
    setTimeout(() => setCopiedIndex(null), 2000)
  }

  return (
    <div className="bg-white dark:bg-slate-800 rounded-lg border border-gray-200 dark:border-slate-700 p-6 flex flex-col">
      <h3 className="font-bold text-lg mb-1">{tool.name}</h3>
      <p className="text-gray-600 dark:text-gray-400 text-sm mb-4 flex-1">{tool.description}</p>

      <button
        onClick={onGenerate}
        disabled={loading}
        className="px-4 py-2.5 bg-indigo-600 hover:bg-indigo-700 rounded text-white font-medium transition disabled:opacity-50 text-sm self-start"
      >
        {loading ? 'Generating...' : 'Generate'}
      </button>

      {error && (
        <div className="mt-4 bg-red-50 text-red-700 dark:bg-red-900/50 dark:text-red-300 px-4 py-3 rounded text-sm">
          {error}
        </div>
      )}

      {result && !error && (
        <div className="mt-4 space-y-4">
          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="text-sm font-medium text-gray-700 dark:text-gray-300">Your API Key</label>
              <button
                onClick={() => copyValue(result.api_key)}
                className="text-indigo-600 dark:text-indigo-400 hover:underline text-xs"
              >
                {copiedKey ? 'Copied!' : 'Copy'}
              </button>
            </div>
            <div className="p-3 bg-gray-50 dark:bg-slate-900 rounded border border-gray-200 dark:border-slate-700 font-mono text-sm break-all">
              {result.api_key}
            </div>
          </div>

          {tool.configType === 'code' && result.config_json && (
            <CodeBlock code={result.config_json} language={tool.language} />
          )}
        </div>
      )}

      {checklist && checklist.length > 0 && (
        <div className="mt-4 space-y-3">
          {checklist.map((item, idx) => (
            <div key={idx}>
              <p className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                {idx + 1}. {item.step}
              </p>
              {item.value && (
                <div className="flex gap-2">
                  <code className="flex-1 p-2 bg-gray-50 dark:bg-slate-900 rounded border border-gray-200 dark:border-slate-700 font-mono text-sm break-all">
                    {item.value}
                  </code>
                  <button
                    onClick={() => copyValue(item.value)}
                    className="px-3 py-2 text-indigo-600 dark:text-indigo-400 hover:bg-indigo-50 dark:hover:bg-indigo-900/30 rounded text-sm transition"
                  >
                    {copiedKey ? 'Copied!' : 'Copy'}
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

export default function UserConfigPage() {
  const [generating, setGenerating] = useState<Record<string, boolean>>({})
  const [results, setResults] = useState<Record<string, UserConfigResponse | null>>({})
  const [checklists, setChecklists] = useState<Record<string, CursorChecklistItem[] | null>>({})
  const [errors, setErrors] = useState<Record<string, string | null>>({})

  const handleGenerate = useCallback(async (clientId: string) => {
    setGenerating(prev => ({ ...prev, [clientId]: true }))
    setErrors(prev => ({ ...prev, [clientId]: null }))

    try {
      const res = await api.user.generateConfig(clientId)
      if (res.error) {
        setErrors(prev => ({ ...prev, [clientId]: res.error }))
      } else {
        setResults(prev => ({ ...prev, [clientId]: res }))
        if (res.checklist) {
          setChecklists(prev => ({ ...prev, [clientId]: res.checklist }))
        } else {
          setChecklists(prev => ({ ...prev, [clientId]: null }))
        }
      }
    } catch (e: unknown) {
      setErrors(prev => ({ ...prev, [clientId]: typeof e === 'string' ? e : (e as Error)?.message || 'Failed to generate config' }))
    } finally {
      setGenerating(prev => ({ ...prev, [clientId]: false }))
    }
  }, [])

  return (
    <UserLayout>
      <h1 className="text-2xl font-bold mb-6">Config Generator</h1>
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
        {tools.map(tool => (
          <Card
            key={tool.id}
            tool={tool}
            loading={!!generating[tool.id]}
            result={results[tool.id] || null}
            checklist={checklists[tool.id] || null}
            error={errors[tool.id] || null}
            onGenerate={() => handleGenerate(tool.id)}
          />
        ))}
      </div>
    </UserLayout>
  )
}
