import { useEffect, useRef, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { AnimatePresence, motion } from 'motion/react'
import { ArrowLeft, Car, Check, Eye, EyeOff, Hotel, Loader2, MapPinned, Mountain, ScanFace, Users } from 'lucide-react'
import AuthShell from './AuthShell'
import { post } from '../../api/client'
import { useAuth } from '../../auth/AuthProvider'
import { useConfig } from '../../config/useConfig'
import { Field, Notice, input, useAction } from '../../components/form'
import { btn } from '../../components/ui'

// Six boxes for the 6-digit code: typing moves on, pasting fills them all
function CodeBoxes({ value, onChange, onComplete, label }) {
  const refs = useRef([])
  const set = (digits) => {
    const next = digits.replace(/\D/g, '').slice(0, 6)
    onChange(next)
    if (next.length === 6) onComplete(next)
    else refs.current[next.length]?.focus()
  }
  return (
    <div className="flex gap-2" role="group" aria-label={label}>
      {Array.from({ length: 6 }, (_, i) => (
        <input
          key={i}
          ref={(el) => (refs.current[i] = el)}
          inputMode="numeric"
          autoComplete={i === 0 ? 'one-time-code' : 'off'}
          maxLength={6}
          value={value[i] ?? ''}
          aria-label={`Digit ${i + 1}`}
          onChange={(e) => set(value.slice(0, i) + e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Backspace' && !value[i]) {
              e.preventDefault()
              onChange(value.slice(0, Math.max(0, i - 1)))
              refs.current[Math.max(0, i - 1)]?.focus()
            }
          }}
          onFocus={(e) => e.target.select()}
          className="font-display h-13 w-full min-w-0 rounded-2xl bg-surface text-center text-xl font-semibold ring-1 ring-line outline-none focus:ring-2 focus:ring-brand"
        />
      ))}
    </div>
  )
}

// One contact (email or mobile) confirmed with a 6-digit code
function CodeField({ channel, label, type, placeholder, value, onChange, proof, onProof }) {
  const [sent, setSent] = useState(null) // { minutes, demoCode }
  const [code, setCode] = useState('')
  const [wait, setWait] = useState(0)
  const a = useAction()
  useEffect(() => {
    if (wait <= 0) return
    const t = setTimeout(() => setWait(wait - 1), 1000)
    return () => clearTimeout(t)
  }, [wait])

  const send = () =>
    a.run(async () => {
      const r = await post('/auth/otp/send', { channel, target: value, purpose: 'REGISTER' })
      setSent(r)
      setCode('')
      setWait(30)
    })
  const verify = (c) =>
    a.run(async () => {
      const r = await post('/auth/otp/verify', { channel, target: value, purpose: 'REGISTER', code: c })
      onProof(r.proof)
    })
  const valid = channel === 'EMAIL' ? /^\S+@\S+\.\S+$/.test(value) : value.replace(/\D/g, '').length >= 9

  return (
    <div>
      <Field label={label}>
        <div className="flex gap-2">
          <input type={type} value={value} disabled={Boolean(proof)} onChange={(e) => { onChange(e.target.value); setSent(null) }} placeholder={placeholder} className={input} autoComplete={channel === 'EMAIL' ? 'email' : 'tel'} />
          {proof ? (
            <span className="inline-flex h-12 shrink-0 items-center gap-1.5 rounded-2xl bg-[color-mix(in_oklab,var(--success)_14%,var(--surface))] px-4 text-sm font-semibold text-success">
              <Check className="h-4 w-4" /> Confirmed
            </span>
          ) : (
            <button type="button" onClick={send} disabled={a.busy || !valid || (sent && wait > 0)} className={`${btn.ghost} h-12 shrink-0 !px-4 text-sm`}>
              {a.busy && !sent ? <Loader2 className="h-4 w-4 animate-spin" /> : sent ? (wait > 0 ? `Send again in ${wait}s` : 'Send again') : 'Send code'}
            </button>
          )}
        </div>
      </Field>
      {sent && !proof && (
        <div className="mt-3 rounded-2xl bg-surface-2 p-4">
          {sent.demoCode ? (
            <p className="mb-3 text-sm">
              <b>Demo mode.</b> No {channel === 'EMAIL' ? 'email' : 'SMS'} service is connected, so here is your code:{' '}
              <button type="button" onClick={() => { setCode(sent.demoCode); verify(sent.demoCode) }} className="font-display rounded-lg bg-accent px-2 py-0.5 font-semibold tracking-widest text-on-accent">{sent.demoCode}</button>
            </p>
          ) : (
            <p className="mb-3 text-sm text-muted">Enter the code we sent to <b className="text-ink">{value}</b>. It lasts {sent.minutes ?? 5} minutes.</p>
          )}
          <CodeBoxes value={code} onChange={setCode} onComplete={verify} label={`Code sent to ${value}`} />
          {a.busy && <p className="mt-2 flex items-center gap-2 text-sm text-muted"><Loader2 className="h-4 w-4 animate-spin" /> Checking</p>}
        </div>
      )}
      {a.error && <p className="mt-2 text-sm font-medium text-danger" role="alert">{a.error}</p>}
    </div>
  )
}

const ROLES = [
  { id: null, title: 'Traveller', text: 'Create trips and join other people', Icon: Users },
  { id: 'DRIVER', title: 'Driver with my own vehicle', text: 'Get trip requests and send offers', Icon: Car },
  { id: 'FLEET', title: 'Fleet or rental company', text: 'Many vehicles and drivers', Icon: MapPinned },
  { id: 'SUPPLIER', title: 'Hotel or restaurant', text: 'Opens in the next phase', Icon: Hotel, soon: true },
  { id: 'GUIDE', title: 'Tour guide', text: 'Opens in the next phase', Icon: Mountain, soon: true },
]
const STEPS = ['Contact', 'About you', 'Your role', 'Agree', 'ID check']

function strength(pw, min) {
  let n = 0
  if (pw.length >= min) n++
  if (pw.length >= min + 4) n++
  if (/[a-z]/.test(pw) && /[A-Z]/.test(pw)) n++
  if (/\d/.test(pw) && /[^A-Za-z0-9]/.test(pw)) n++
  return n
}

export default function Signup() {
  const navigate = useNavigate()
  const [params] = useSearchParams()
  const { login, setMode } = useAuth()
  const config = useConfig()
  const phoneCode = config?.signup?.phoneCode ?? true
  const [step, setStep] = useState(0)
  const [show, setShow] = useState(false)
  const [f, setF] = useState({ email: '', phone: '', emailProof: null, phoneProof: null, fullName: '', gender: '', dateOfBirth: '', nationality: 'LK', password: '', confirm: '', partnerRole: ['DRIVER', 'FLEET'].includes(params.get('role')) ? params.get('role') : null, accept: false })
  const set = (k) => (v) => setF((x) => ({ ...x, [k]: v?.target ? v.target.value : v }))
  const a = useAction()
  const min = config?.settings?.['accounts.password_min'] ?? 10
  const minAge = config?.settings?.['accounts.min_age'] ?? 18
  const legal = Object.fromEntries((config?.legal ?? []).map((p) => [p.slug, p.version]))
  const phoneOk = f.phone.replace(/\D/g, '').length >= 9

  const canNext = [
    f.emailProof && (phoneCode ? f.phoneProof : phoneOk),
    f.fullName.trim().length >= 3 && f.gender && f.dateOfBirth && f.password.length >= min && f.password === f.confirm,
    true,
    f.accept,
  ][step]

  const submit = () =>
    a.run(async () => {
      const session = await post('/auth/register', {
        fullName: f.fullName, email: f.email, phone: f.phone, password: f.password, emailProof: f.emailProof, phoneProof: f.phoneProof,
        gender: f.gender, dateOfBirth: f.dateOfBirth, nationality: f.nationality, partnerRole: f.partnerRole,
        accept: { terms: legal.terms ?? 1, privacy: legal.privacy ?? 1, community: legal.community ?? 1 },
      })
      login(session)
      if (f.partnerRole) setMode('partner')
      // Straight into the camera: the ID check is the last step of signing up
      navigate('/verify?welcome=1')
    })
  // A field the server rejected: go back to the step that holds it
  useEffect(() => {
    if (a.fields.email || a.fields.phone) setStep(0)
    else if (a.fields.fullName || a.fields.dateOfBirth || a.fields.password) setStep(1)
  }, [a.fields])

  const s = strength(f.password, min)
  return (
    <AuthShell title="Create your account" text="Anyone can browse. Joining or hosting a trip needs a verified account.">
      <ol className="mb-8 flex gap-1.5" aria-label="Steps">
        {STEPS.map((label, i) => (
          <li key={label} className="flex-1" aria-current={i === step ? 'step' : undefined}>
            <span className={`block h-1.5 rounded-full ${i < step ? 'bg-brand' : i === step ? 'bg-accent' : 'bg-line'}`} />
            <span className={`mt-2 hidden text-xs font-semibold sm:block ${i === step ? 'text-ink' : 'text-muted'}`}>{label}</span>
          </li>
        ))}
      </ol>
      <AnimatePresence mode="wait">
        <motion.div key={step} initial={{ opacity: 0, x: 16 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -16 }} transition={{ duration: 0.2 }} className="space-y-5">
          {step === 0 && (
            <>
              <CodeField channel="EMAIL" label="Email" type="email" placeholder="you@example.com" value={f.email} onChange={set('email')} proof={f.emailProof} onProof={set('emailProof')} />
              {phoneCode ? (
                <CodeField channel="SMS" label="Mobile number" type="tel" placeholder="077 123 4567" value={f.phone} onChange={set('phone')} proof={f.phoneProof} onProof={set('phoneProof')} />
              ) : (
                <Field label="Mobile number" hint="for trip-day contact" error={a.fields.phone}>
                  <input type="tel" value={f.phone} onChange={set('phone')} placeholder="077 123 4567" className={input} autoComplete="tel" />
                </Field>
              )}
            </>
          )}
          {step === 1 && (
            <>
              <Field label="Full name" hint="as on your NIC or passport" error={a.fields.fullName}>
                <input value={f.fullName} onChange={set('fullName')} className={input} autoComplete="name" />
              </Field>
              <div className="grid grid-cols-2 gap-3">
                <Field label="Gender" hint="checked with your ID">
                  <select value={f.gender} onChange={set('gender')} className={input}>
                    <option value="">Choose</option>
                    <option value="FEMALE">Woman</option>
                    <option value="MALE">Man</option>
                  </select>
                </Field>
                <Field label="Date of birth" hint={`${minAge}+`} error={a.fields.dateOfBirth}>
                  <input type="date" value={f.dateOfBirth} onChange={set('dateOfBirth')} className={input} max={new Date().toISOString().slice(0, 10)} />
                </Field>
              </div>
              <Field label="Nationality">
                <select value={f.nationality} onChange={set('nationality')} className={input}>
                  <option value="LK">Sri Lankan (NIC)</option>
                  <option value="XX">Other country (passport)</option>
                </select>
              </Field>
              <Field label="Password" hint={`at least ${min} characters`} error={a.fields.password}>
                <div className="relative">
                  <input type={show ? 'text' : 'password'} value={f.password} onChange={set('password')} className={`${input} pr-12`} autoComplete="new-password" />
                  <button type="button" onClick={() => setShow(!show)} className="absolute right-1.5 top-1.5 grid h-9 w-9 place-items-center rounded-xl text-muted hover:bg-surface-2" aria-label={show ? 'Hide password' : 'Show password'}>{show ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}</button>
                </div>
                {f.password && (
                  <div className="mt-2 flex items-center gap-2" aria-live="polite">
                    <div className="flex flex-1 gap-1">{[1, 2, 3, 4].map((n) => <span key={n} className={`h-1 flex-1 rounded-full ${n <= s ? (s <= 1 ? 'bg-danger' : s <= 2 ? 'bg-accent' : 'bg-success') : 'bg-line'}`} />)}</div>
                    <span className="text-xs font-medium text-muted">{f.password.length < min ? `${min - f.password.length} more to go` : ['', 'Okay', 'Good', 'Strong', 'Very strong'][s]}</span>
                  </div>
                )}
              </Field>
              <Field label="Type it again" error={f.confirm && f.confirm !== f.password ? 'Does not match' : ''}>
                <input type={show ? 'text' : 'password'} value={f.confirm} onChange={set('confirm')} className={input} autoComplete="new-password" />
              </Field>
            </>
          )}
          {step === 2 && (
            <div className="space-y-2">
              <p className="text-muted">Everyone is a traveller. You can also be one kind of partner, and switch between the two in the menu.</p>
              {ROLES.map((r) => (
                <button
                  key={r.title}
                  type="button"
                  disabled={r.soon}
                  aria-pressed={f.partnerRole === r.id}
                  onClick={() => set('partnerRole')(r.id)}
                  className={`flex w-full items-center gap-4 rounded-2xl p-4 text-left ring-1 transition disabled:opacity-50 ${f.partnerRole === r.id ? 'bg-brand-soft ring-2 ring-brand' : 'bg-surface ring-line hover:ring-ink/40'}`}
                >
                  <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-surface-2"><r.Icon className="h-5 w-5 text-brand" /></span>
                  <span className="min-w-0 flex-1">
                    <span className="block font-semibold">{r.id ? `Traveller and ${r.title.toLowerCase()}` : r.title}</span>
                    <span className="block text-sm text-muted">{r.text}</span>
                  </span>
                  {f.partnerRole === r.id && <Check className="h-5 w-5 text-brand" />}
                </button>
              ))}
            </div>
          )}
          {step === 3 && (
            <>
              <label className="flex items-start gap-3 rounded-2xl bg-surface p-4 ring-1 ring-line">
                <input type="checkbox" checked={f.accept} onChange={(e) => set('accept')(e.target.checked)} className="mt-1 h-5 w-5 accent-[var(--brand)]" />
                <span>
                  I agree to the{' '}
                  <Link to="/legal/terms" target="_blank" className="font-semibold text-brand underline">terms of use</Link>, the{' '}
                  <Link to="/legal/privacy" target="_blank" className="font-semibold text-brand underline">privacy notice</Link> and the{' '}
                  <Link to="/legal/community" target="_blank" className="font-semibold text-brand underline">community guidelines</Link>. Payments for booked services go only through Yaluwo.
                </span>
              </label>
              <div className="flex gap-4 rounded-2xl bg-night p-5 text-white">
                <ScanFace className="h-9 w-9 shrink-0 text-mango" strokeWidth={1.5} />
                <p className="text-white/80"><b className="text-white">Next, the camera.</b> It takes a photo of your face and both sides of your {f.nationality === 'LK' ? 'NIC' : 'passport'} by itself. Have the card with you.</p>
              </div>
            </>
          )}
        </motion.div>
      </AnimatePresence>
      {a.error && <Notice tone="danger" className="mt-5">{a.error}</Notice>}
      <div className="mt-8 flex items-center justify-between gap-3">
        {step > 0 ? (
          <button type="button" onClick={() => setStep(step - 1)} className={btn.ghost}>
            <ArrowLeft className="h-4 w-4" /> Back
          </button>
        ) : (
          <Link to="/login" className="font-semibold text-brand hover:underline">I already have an account</Link>
        )}
        {step < 3 ? (
          <button type="button" disabled={!canNext} onClick={() => setStep(step + 1)} className={btn.primary}>Continue</button>
        ) : (
          <button type="button" disabled={!canNext || a.busy} onClick={submit} className={btn.accent}>
            {a.busy && <Loader2 className="h-4 w-4 animate-spin" />} Create account
          </button>
        )}
      </div>
    </AuthShell>
  )
}
