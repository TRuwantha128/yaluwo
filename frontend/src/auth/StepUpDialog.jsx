import { useState } from 'react'
import { motion } from 'motion/react'
import { Loader2, ShieldCheck } from 'lucide-react'
import { post, stepUp } from '../api/client'
import { btn } from '../components/ui'
import { input } from '../components/form'

// "Confirm it's you": password plus authenticator code, valid for 5 minutes
export default function StepUpDialog({ twoStep, onDone }) {
  const [password, setPassword] = useState('')
  const [code, setCode] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  const submit = async (e) => {
    e.preventDefault()
    setBusy(true)
    setError('')
    try {
      const r = await post('/auth/step-up', { password, code: code || undefined })
      stepUp.set(r.stepUpToken, r.expiresIn)
      onDone(true)
    } catch (err) {
      setError(err.message)
      setBusy(false)
    }
  }

  return (
    <div className="fixed inset-0 z-[90] grid place-items-center bg-black/50 p-4 backdrop-blur-sm" role="dialog" aria-modal="true" aria-labelledby="stepup-title">
      <motion.form initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} onSubmit={submit} className="w-full max-w-sm rounded-3xl bg-surface p-6 shadow-2xl ring-1 ring-line">
        <span className="grid h-11 w-11 place-items-center rounded-2xl bg-brand-soft text-brand">
          <ShieldCheck className="h-6 w-6" />
        </span>
        <h2 id="stepup-title" className="mt-4 text-xl font-bold tracking-tight">Confirm it's you</h2>
        <p className="mt-1 text-sm text-muted">This action needs your password{twoStep ? ' and the code from your authenticator app' : ''}. It stays confirmed for 5 minutes.</p>
        <label className="mt-5 block text-sm font-semibold">
          Password
          <input type="password" autoComplete="current-password" autoFocus value={password} onChange={(e) => setPassword(e.target.value)} className={`${input} mt-1.5`} />
        </label>
        {twoStep && (
          <label className="mt-3 block text-sm font-semibold">
            6-digit code
            <input inputMode="numeric" autoComplete="one-time-code" maxLength={6} value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))} className={`${input} mt-1.5 tracking-[0.4em]`} />
          </label>
        )}
        {error && <p className="mt-3 text-sm font-medium text-danger">{error}</p>}
        <div className="mt-6 flex gap-2">
          <button type="button" onClick={() => onDone(false)} className={`${btn.ghost} flex-1`}>
            Cancel
          </button>
          <button disabled={busy || !password} className={`${btn.primary} flex-1`}>
            {busy && <Loader2 className="h-4 w-4 animate-spin" />} Confirm
          </button>
        </div>
      </motion.form>
    </div>
  )
}
