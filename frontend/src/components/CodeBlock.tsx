export default function CodeBlock({code}: { code: string; language?: string; copiedLabel?: string }) {

    return (
        <div>
      <pre
          className="p-4 bg-gray-50 dark:bg-slate-900 rounded border border-gray-200 dark:border-slate-700 text-sm overflow-auto max-h-96 font-mono whitespace-pre-wrap break-all">
        {code}
      </pre>
        </div>
    )
}
