import { useState, useCallback, type ReactNode } from 'react'
import { ToastContext } from '../hooks/useToast'

export default function ToastProvider({ children }: { children: ReactNode }) {
  const [message, setMessage] = useState('')

  const showToast = useCallback((msg: string) => {
    setMessage(msg)
    setTimeout(() => setMessage(''), 2000)
  }, [])

  return (
    <ToastContext.Provider value={showToast}>
      {children}
      {message && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-[100] bg-indigo-50 dark:bg-indigo-600 text-gray-900 dark:text-white px-4 py-2 rounded-lg shadow-lg shadow-indigo-200/30 dark:shadow-indigo-600/30 text-sm font-medium">
          {message}
        </div>
      )}
    </ToastContext.Provider>
  )
}
