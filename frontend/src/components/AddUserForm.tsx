import { useState } from 'react'
import { api } from '../api/client'
import { useToast } from '../hooks/useToast'

interface AddUserFormProps {
  onCreated: () => void
}

export default function AddUserForm({ onCreated }: AddUserFormProps) {
  const showToast = useToast()
  const [name, setName] = useState('')
  const [showKey, setShowKey] = useState('')

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (name.length < 2) return
    try {
      const user = await api.createUser({ name })
      setShowKey(user.api_key || '')
      setName('')
      setTimeout(onCreated, 2000)
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Failed to create user')
    }
  }

  return (
    <>
      <form onSubmit={handleSubmit} className="flex flex-col sm:flex-row gap-3">
        <input
          name="name"
          type="text"
          placeholder="Username"
          value={name}
          onChange={(e) => setName(e.target.value)}
          className="px-3 py-2 bg-gray-50 dark:bg-slate-800 border border-gray-300 dark:border-slate-600 rounded text-gray-900 dark:text-white focus:outline-none focus:border-indigo-500"
          required
        />
        <button className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 rounded text-gray-900 dark:text-white font-medium transition">
          Add
        </button>
      </form>
      {showKey && (
        <div className="mt-3 bg-gray-50 dark:bg-slate-800 border border-indigo-500/30 rounded p-4">
          <p className="text-sm text-gray-500 dark:text-gray-400 mb-1">New key for <span className="text-gray-900 dark:text-white font-medium">{name}</span>:</p>
          <div className="flex gap-2 items-center">
            <code className="flex-1 bg-gray-50 dark:bg-slate-900 px-3 py-2 rounded text-sm text-indigo-600 dark:text-indigo-300 font-mono">{showKey}</code>
            <button
              onClick={async () => {
                try {
                  await navigator.clipboard.writeText(showKey)
                } catch {
                  const ta = document.createElement('textarea')
                  ta.value = showKey
                  ta.style.position = 'fixed'
                  ta.style.opacity = '0'
                  document.body.appendChild(ta)
                  ta.select()
                  document.execCommand('copy')
                  document.body.removeChild(ta)
                }
                setShowKey('')
                showToast('Key copied!')
              }}
              className="px-3 py-1 bg-gray-100 dark:bg-slate-700 hover:bg-gray-200 dark:hover:bg-slate-600 rounded text-sm transition"
            >
              Copy
            </button>
          </div>
        </div>
      )}
    </>
  )
}
