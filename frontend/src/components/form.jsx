import { useEffect, useState } from 'react'
import { AlertCircle, CheckCircle2, Loader2, Upload, X } from 'lucide-react'

// Shared form pieces so every screen looks and behaves the same
export const input = 'h-12 w-full rounded-2xl bg-surface px-4 text-sm font-medium ring-1 ring-line outline-none transition placeholder:text-muted focus:ring-2 focus:ring-brand disabled:opacity-60'

export function Field({ label, hint, error, children, className = '' }) {
  return (
    <label className={`block ${className}`}>
      <span className="text-sm font-semibold">{label}</span>
      {hint && <span className="ml-2 text-xs text-muted">{hint}</span>}
      <div className="mt-1.5">{children}</div>
      {error && <span className="mt-1 block text-xs font-medium text-danger">{error}</span>}
    </label>
  )
}

export function Notice({ tone = 'info', children, className = '' }) {
  const tones = {
    info: 'bg-brand-soft text-ink ring-brand/20',
    success: 'bg-[color-mix(in_oklab,var(--success)_12%,var(--surface))] ring-[var(--success)]/25',
    warning: 'bg-accent-soft ring-accent/30',
    danger: 'bg-[color-mix(in_oklab,var(--danger)_10%,var(--surface))] ring-[var(--danger)]/25',
  }
  const Icon = tone === 'success' ? CheckCircle2 : AlertCircle
  return (
    <div className={`flex gap-3 rounded-2xl px-4 py-3 text-sm ring-1 ${tones[tone]} ${className}`} role={tone === 'danger' ? 'alert' : 'status'}>
      <Icon className={`mt-0.5 h-4 w-4 shrink-0 ${tone === 'danger' ? 'text-danger' : tone === 'success' ? 'text-success' : tone === 'warning' ? 'text-accent' : 'text-brand'}`} />
      <div className="min-w-0 flex-1">{children}</div>
    </div>
  )
}

export function Spinner({ className = '' }) {
  return <Loader2 className={`h-5 w-5 animate-spin text-brand ${className}`} />
}

export function PageLoader() {
  return (
    <div className="grid min-h-[60vh] place-items-center">
      <Spinner className="h-7 w-7" />
    </div>
  )
}

// Run an async action with a busy flag and an error message
export function useAction() {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [fields, setFields] = useState({})
  const run = async (fn) => {
    setBusy(true)
    setError('')
    setFields({})
    try {
      return await fn()
    } catch (e) {
      setError(e.message)
      setFields(e.fields ?? {})
      return undefined
    } finally {
      setBusy(false)
    }
  }
  return { busy, error, fields, run, setError }
}

// A file picker that shows a preview
export function FilePick({ label, hint, value, onChange, accept = 'image/*,application/pdf', capture, error }) {
  const [url, setUrl] = useState(null)
  useEffect(() => {
    if (!value || !value.type?.startsWith('image/')) {
      setUrl(null)
      return
    }
    const u = URL.createObjectURL(value)
    setUrl(u)
    return () => URL.revokeObjectURL(u)
  }, [value])
  return (
    <div>
      <span className="text-sm font-semibold">{label}</span>
      {hint && <span className="ml-2 text-xs text-muted">{hint}</span>}
      {value ? (
        <div className="relative mt-1.5 flex items-center gap-3 rounded-2xl bg-surface p-2 ring-1 ring-line">
          {url ? <img src={url} alt="" className="h-14 w-20 rounded-xl object-cover" /> : <span className="grid h-14 w-20 place-items-center rounded-xl bg-surface-2 text-xs font-bold text-muted">FILE</span>}
          <span className="min-w-0 flex-1 truncate text-sm font-medium">{value.name}</span>
          <button type="button" onClick={() => onChange(null)} className="grid h-8 w-8 place-items-center rounded-full text-muted hover:bg-surface-2" aria-label={`Remove ${label}`}>
            <X className="h-4 w-4" />
          </button>
        </div>
      ) : (
        <label className="mt-1.5 flex h-20 cursor-pointer items-center justify-center gap-2 rounded-2xl border-2 border-dashed border-line bg-surface text-sm font-semibold text-muted transition hover:border-brand hover:text-brand">
          <Upload className="h-4 w-4" /> Choose or take a photo
          <input type="file" accept={accept} capture={capture} className="sr-only" onChange={(e) => onChange(e.target.files?.[0] ?? null)} />
        </label>
      )}
      {error && <span className="mt-1 block text-xs font-medium text-danger">{error}</span>}
    </div>
  )
}

// "2 h 14 min left", ticking
export function Countdown({ to, className = '' }) {
  const [, tick] = useState(0)
  useEffect(() => {
    const t = setInterval(() => tick((x) => x + 1), 30000)
    return () => clearInterval(t)
  }, [])
  const ms = new Date(to) - Date.now()
  if (ms <= 0) return <span className={`font-semibold text-danger ${className}`}>Time is up</span>
  const h = Math.floor(ms / 3600000)
  const m = Math.floor((ms % 3600000) / 60000)
  const d = Math.floor(h / 24)
  const text = d >= 2 ? `${d} days left` : h >= 1 ? `${h} h ${m} min left` : `${m} min left`
  return <span className={`font-semibold ${h < 6 ? 'text-accent' : 'text-muted'} ${className}`}>{text}</span>
}

export function Badge({ children, tone = 'neutral' }) {
  const tones = {
    neutral: 'bg-surface-2 text-muted',
    brand: 'bg-brand-soft text-brand',
    accent: 'bg-accent-soft text-accent',
    success: 'bg-[color-mix(in_oklab,var(--success)_14%,var(--surface))] text-success',
    danger: 'bg-[color-mix(in_oklab,var(--danger)_12%,var(--surface))] text-danger',
  }
  return <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-semibold ${tones[tone]}`}>{children}</span>
}

export const STATUS_TONE = {
  DRAFT: 'neutral', UNDER_REVIEW: 'accent', OPEN: 'success', FULL: 'brand', BOOKING: 'brand', PAYMENT_DUE: 'accent', CONFIRMED: 'success', ONGOING: 'success', COMPLETED: 'neutral', CLOSED: 'neutral', CANCELLED: 'danger',
  PENDING: 'accent', APPROVED: 'success', REJECTED: 'danger', RESUBMIT: 'accent', PAID: 'success', READY: 'brand', HELD: 'neutral', SENT: 'brand', FAILED: 'danger', FROZEN: 'danger', REQUESTED: 'accent', ACCEPTED: 'success', DECLINED: 'danger', EXPIRED: 'neutral', VERIFIED: 'success', UNDER_REVIEW_SLIP: 'accent', WAITING_SETTLEMENT: 'neutral', REFUNDED: 'neutral', PART_REFUNDED: 'neutral', PROCESSED: 'success',
}
export const statusLabel = (s = '') => s.replace(/_/g, ' ').toLowerCase().replace(/^\w/, (c) => c.toUpperCase())
export const StatusBadge = ({ status }) => <Badge tone={STATUS_TONE[status] ?? 'neutral'}>{statusLabel(status)}</Badge>
