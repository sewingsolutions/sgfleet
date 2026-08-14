import { useState, useCallback, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { copyToClipboard } from '../utils/copyToClipboard'
import { useSetupStatus, useCompleteSetupMutation } from '../hooks/useSetup'

const steps = ['Welcome', 'Admin Name', 'Base URL', 'HF Token', 'Complete']

export default function SetupWizard() {
  const navigate = useNavigate()
  const [step, setStep] = useState(0)
  const [adminName, setAdminName] = useState('')
  const [baseUrl, setBaseUrl] = useState('')
  const [hfToken, setHfToken] = useState('')
  const [resultKey, setResultKey] = useState('')
  const [keyCopied, setKeyCopied] = useState(false)
  const [error, setError] = useState('')

  const { data: setupStatus } = useSetupStatus()
  const completeMutation = useCompleteSetupMutation()

  // If setup is already complete, redirect to login.
  useEffect(() => {
    if (setupStatus?.setup_complete && !resultKey) {
      navigate('/login', { replace: true })
    }
  }, [setupStatus, resultKey, navigate])

  const canNext = useCallback(() => {
    if (step === 1) return adminName.trim().length > 0
    return true
  }, [step, adminName])

  const handleNext = () => {
    if (step < 4) setStep(step + 1)
  }

  const handleBack = () => {
    if (step > 0) setStep(step - 1)
  }

  const handleComplete = async () => {
    setError('')
    try {
      const result = await completeMutation.mutateAsync({
        admin_name: adminName.trim(),
        base_url: baseUrl.trim(),
        hf_token: hfToken.trim() || undefined,
      })
      setResultKey(result.admin_api_key)
      setStep(4)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Setup failed')
    }
  }

  const handleRedirect = () => {
    navigate('/login', { replace: true })
  }

  const copyKey = () => {
    copyToClipboard(resultKey)
    setKeyCopied(true)
    setTimeout(() => setKeyCopied(false), 2000)
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-900">
      <div className="w-full max-w-lg">
        <div className="bg-slate-800 rounded-lg p-8 border border-slate-700">
          <h1 className="text-2xl font-bold text-indigo-400 mb-1">SGFleet</h1>
          <p className="text-gray-400 mb-6 text-sm">First-time setup wizard</p>

          {/* Step indicators */}
          <div className="flex items-center justify-between mb-8">
            {steps.map((label, i) => (
              <div key={label} className="flex items-center">
                <div className="flex flex-col items-center">
                  <div
                    className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-medium transition-colors ${
                      i < step
                        ? 'bg-emerald-600 text-white'
                        : i === step
                          ? 'bg-indigo-600 text-white'
                          : 'bg-slate-700 text-gray-400'
                    }`}
                  >
                    {i < step ? '✓' : i + 1}
                  </div>
                  <span className="text-[10px] text-gray-500 mt-1 hidden sm:block">{label}</span>
                </div>
                {i < steps.length - 1 && (
                  <div className={`w-8 sm:w-12 h-px mx-1 ${i < step ? 'bg-emerald-600' : 'bg-slate-700'}`} />
                )}
              </div>
            ))}
          </div>

          {error && (
            <div className="bg-red-900/50 text-red-300 px-4 py-3 rounded mb-4 text-sm">{error}</div>
          )}

          {/* Step 0: Welcome */}
          {step === 0 && (
            <div className="space-y-6">
              <div>
                <h2 className="text-xl font-semibold text-white mb-2">Welcome to SGFleet</h2>
                <p className="text-gray-400 text-sm leading-relaxed">
                  This wizard will help you configure your SGFleet instance. You&apos;ll create an admin account, set your base URL, and optionally configure a HuggingFace token. At the end, you&apos;ll receive an API key that you&apos;ll need to log in.
                </p>
              </div>
              <button
                onClick={handleNext}
                className="w-full px-4 py-3 bg-indigo-600 hover:bg-indigo-700 rounded text-white font-medium transition"
              >
                Get Started
              </button>
            </div>
          )}

          {/* Step 1: Admin Name */}
          {step === 1 && (
            <div className="space-y-4">
              <h2 className="text-xl font-semibold text-white mb-2">Admin Display Name</h2>
              <p className="text-gray-400 text-sm">Enter a display name for the admin account.</p>
              <input
                type="text"
                value={adminName}
                onChange={(e) => setAdminName(e.target.value)}
                className="w-full px-3 py-3 bg-slate-900 border border-slate-600 rounded text-white focus:outline-none focus:border-indigo-500 text-sm"
                placeholder="e.g. Admin"
                autoFocus
              />
              <div className="flex justify-end gap-2 pt-2">
                <button
                  onClick={handleBack}
                  className="px-4 py-2 text-gray-400 hover:text-white text-sm transition"
                >
                  Back
                </button>
                <button
                  onClick={handleNext}
                  disabled={!canNext()}
                  className="px-6 py-2 bg-indigo-600 hover:bg-indigo-700 rounded text-white font-medium transition text-sm disabled:opacity-50"
                >
                  Next
                </button>
              </div>
            </div>
          )}

          {/* Step 2: Base URL */}
          {step === 2 && (
            <div className="space-y-4">
              <h2 className="text-xl font-semibold text-white mb-2">Base URL</h2>
              <p className="text-gray-400 text-sm">
                The base URL for your SGFleet gateway. Used for generated config files. Leave empty if unsure.
              </p>
              <input
                type="text"
                value={baseUrl}
                onChange={(e) => setBaseUrl(e.target.value)}
                className="w-full px-3 py-3 bg-slate-900 border border-slate-600 rounded text-white focus:outline-none focus:border-indigo-500 text-sm font-mono"
                placeholder="https://api.example.com/v1"
              />
              <p className="text-gray-500 text-xs">Example: <code className="bg-slate-900 px-1.5 py-0.5 rounded">https://your-server.com/v1</code></p>
              <div className="flex justify-between items-center pt-2">
                <button
                  onClick={() => setBaseUrl('')}
                  className="text-xs text-gray-500 hover:text-gray-300 transition"
                >
                  Clear
                </button>
                <div className="flex gap-2">
                  <button
                    onClick={handleBack}
                    className="px-4 py-2 text-gray-400 hover:text-white text-sm transition"
                  >
                    Back
                  </button>
                  <button
                    onClick={handleNext}
                    className="px-6 py-2 bg-indigo-600 hover:bg-indigo-700 rounded text-white font-medium transition text-sm"
                  >
                    Next
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Step 3: HF Token */}
          {step === 3 && (
            <div className="space-y-4">
              <h2 className="text-xl font-semibold text-white mb-2">HuggingFace Token</h2>
              <p className="text-gray-400 text-sm">
                Optional. Required for downloading gated models from HuggingFace Hub.
              </p>
              <input
                type="text"
                value={hfToken}
                onChange={(e) => setHfToken(e.target.value)}
                className="w-full px-3 py-3 bg-slate-900 border border-slate-600 rounded text-white focus:outline-none focus:border-indigo-500 text-sm font-mono"
                placeholder="hf_xxxxxxxxxxxx"
              />
              <div className="flex justify-between items-center pt-2">
                <span className="text-xs text-gray-500">Optional</span>
                <div className="flex gap-2">
                  <button
                    onClick={handleBack}
                    className="px-4 py-2 text-gray-400 hover:text-white text-sm transition"
                  >
                    Back
                  </button>
                  <button
                    onClick={handleNext}
                    className="px-6 py-2 bg-indigo-600 hover:bg-indigo-700 rounded text-white font-medium transition text-sm"
                  >
                    Next
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Step 4: Confirm / Complete */}
          {step === 4 && !resultKey && (
            <div className="space-y-4">
              <h2 className="text-xl font-semibold text-white mb-2">Review &amp; Complete</h2>
              <div className="bg-slate-900 rounded p-4 space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-gray-400">Admin Name</span>
                  <span className="text-white">{adminName || '—'}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-400">Base URL</span>
                  <span className="text-white font-mono text-xs">{baseUrl || '—'}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-400">HF Token</span>
                  <span className="text-white">{hfToken ? '••••••' : '—'}</span>
                </div>
              </div>
              <p className="text-gray-400 text-sm">
                Clicking &quot;Complete Setup&quot; will create your admin account and generate an API key.
              </p>
              <div className="flex justify-between items-center pt-2">
                <button
                  onClick={handleBack}
                  className="px-4 py-2 text-gray-400 hover:text-white text-sm transition"
                >
                  Back
                </button>
                <button
                  onClick={handleComplete}
                  disabled={completeMutation.isPending}
                  className="px-6 py-3 bg-indigo-600 hover:bg-indigo-700 rounded text-white font-medium transition text-sm disabled:opacity-50"
                >
                  {completeMutation.isPending ? 'Setting up...' : 'Complete Setup'}
                </button>
              </div>
            </div>
          )}

          {/* Step 4: Success - show key */}
          {step === 4 && resultKey && (
            <div className="space-y-4">
              <h2 className="text-xl font-semibold text-emerald-400 mb-2">Setup Complete!</h2>
              <div className="bg-amber-900/30 border border-amber-700/50 text-amber-300 px-4 py-3 rounded text-sm">
                <p className="font-medium mb-1">⚠ Save this key now — it will not be shown again.</p>
              </div>
              <div>
                <label className="text-gray-400 text-xs block mb-1">Admin API Key</label>
                <div className="flex gap-2">
                  <code className="flex-1 px-3 py-3 bg-slate-900 border border-slate-600 rounded text-white font-mono text-sm break-all">
                    {resultKey}
                  </code>
                  <button
                    onClick={copyKey}
                    className="px-3 py-3 bg-slate-700 hover:bg-slate-600 rounded text-white text-sm font-medium transition whitespace-nowrap"
                  >
                    {keyCopied ? 'Copied!' : 'Copy'}
                  </button>
                </div>
              </div>
              <button
                onClick={handleRedirect}
                className="w-full px-4 py-3 bg-emerald-600 hover:bg-emerald-700 rounded text-white font-medium transition"
              >
                Go to Login
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
