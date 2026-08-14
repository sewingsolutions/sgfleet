import { useState } from 'react'

export default function CodeBlock({ code, language, copiedLabel = 'Copied!' }: { code: string; language?: string; copiedLabel?: string }) {
  const [copied, setCopied] = useState(false)

  const handleCopy = () => {
    navigator.clipboard.writeText(code)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-1">
        <span className="text-xs text-gray-400 dark:text-gray-500">{language}</span>
        <button
          onClick={handleCopy}
          className="text-indigo-600 dark:text-indigo-400 hover:underline text-xs transition"
        >
          {copied ? copiedLabel : 'Copy'}
        </button>
      </div>
      <pre className="p-4 bg-gray-50 dark:bg-slate-900 rounded border border-gray-200 dark:border-slate-700 text-sm overflow-auto max-h-96 font-mono whitespace-pre-wrap break-all">
        {code}
      </pre>
    </div>
  )
}
