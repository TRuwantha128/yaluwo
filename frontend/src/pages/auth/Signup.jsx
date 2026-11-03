import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { AnimatePresence, motion } from 'motion/react'
import { ArrowLeft, ArrowRight, Car, Check, Hotel, Loader2, MapPinned, Mountain, Users } from 'lucide-react'
import AuthShell from './AuthShell'
import { post } from '../../api/client'
import { useAuth } from '../../auth/AuthProvider'
import { useConfig } from '../../config/useConfig'
import { Field, Notice, input, useAction } from '../../components/form'
import { btn } from '../../components/ui'

// One contact (email or mobile) confirmed with a 6-digit code
function CodeField({ channel, label, type, placeholder, value, onChange, proof, onProof, local }) {
  const [sent, setSent] = useState(false)
  const [code, setCode] = useState('')
  const a = useAction()
  const send = () =>
    a.run(async () => {
      await post('/auth/otp/send', { channel, target: value, purpose: 'REGISTER' })
      setSent(true)
    })
  const verify = () =>
    a.run(async () => {
      const r = await post('/auth/otp/verify', { channel, target: value, purpose: 'REGISTER', code })
      onProof(r.proof)
    })
  return (
    <div>
      <Field label={label} error={a.error}>
        <div className="flex gap-2">
          <input type={type} value={value} disabled={Boolean(proof)} onChange={(e) => { onChange(e.target.value); setSent(false) }} placeholder={placeholder} className={input} autoComplete={channel === 'EMAIL' ? 'email' : 'tel'} />
          {proof ? (
            <span className="inline-flex h-12 shrink-0 items-center gap-1.5 rounded-2xl bg-[color-mix(in_oklab,#16a34a_14%,var(--surface))] px-4 text-sm font-semibold text-success">
              <Check className="h-4 w-4" /> Confirmed
            </span>
          ) : (
            <button type="button" onClick={send} disabled={a.busy || value.length < 5} className={`${btn.ghost} h-12 shrink-0 !px-4 text-sm`}>
              {a.busy && !sent ? <Loader2 className="h-4 w-4 animate-spin" /> : sent ? 'Resend' : 'Send code'}
            </button>
          )}
        </div>
      </Field>
      {sent && !proof && (
        <div className="mt-2 flex gap-2">
          <input inputMode="numeric" autoComplete="one-time-code" maxLength={6} value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))} placeholder="6-digit code" className={`${input} tracking-[0.4em]`} aria-label={`Code sent to ${value}`} />
          <button type="button" onClick={verify} disabled={code.length !== 6 || a.busy} className={`${btn.primary} h-12 shrink-0 !px-5 text-sm`}>
            Confirm
          </button>
        </div>
      )}
      {sent && !proof && <p className="mt-1.5 text-xs text-muted">{local ? 'Local mode: the code is printed in the backend terminal (and in Admin → Dev outbox).' : `We sent a code to ${value}. It expires in 5 minutes.`}</p>}
    </div>
  )
}

const ROLES = [
  { id: null, title: 'Traveller', text: 'Create trips and join other people', Icon: Users },
  { id: 'DRIVER', title: 'Driver with my own vehicle', text: 'Get trip requests and send offers', Icon: Car },
  { id: 'FLEET', title: 'Fleet or rental company', text: 'Many vehicles and drivers', Icon: MapPinned },
  { id: 'SUPPLIER', title: 'Hotel or restaurant', text: 'Coming in the next phase', Icon: Hotel, soon: true },
  { id: 'GUIDE', title: 'Tour guide', text: 'Coming in the next phase', Icon: Mountain, soon: true },
]

export default function Signup() {
  const navigate = useNavigate()
  const { login, setMode } = useAuth()
  const config = useConfig()
  const local = config?.environment === 'local'
  const [step, setStep] = useState(0)
  const [f, setF] = useState({ email: '', phone: '', emailProof: null, phoneProof: null, fullName: '', gender: '', dateOfBirth: '', nationality: 'LK', password: '', confirm: '', partnerRole: null, accept: false })
  const set = (k) => (v) => setF((x) => ({ ...x, [k]: v?.target ? v.target.value : v }))
  const a = useAction()
  const min = config?.settings?.['accounts.password_min'] ?? 10
  const legal = Object.fromEntries((config?.legal ?? []).map((p) => [p.slug, p.version]))

  const canNext = [
    f.emailProof && f.phoneProof,
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
      navigate(f.partnerRole ? '/partner?welcome=1' : '/verify?welcome=1')
    })

  const steps = ['Contact', 'About you', 'Your role', 'Agree']
  return (
    <AuthShell title="Create your account" text="Anyone can browse. To join or host a trip, you need a verified account.">
      <ol className="mb-8 flex gap-2" aria-label="Steps">
        {steps.map((s, i) => (
          <li key={s} className={`h-1.5 flex-1 rounded-full ${i <= step ? 'bg-brand' : 'bg-line'}`} aria-label={`${s}${i === step ? ' (current)' : ''}`} />
        ))}
      </ol>
      <AnimatePresence mode="wait">
        <motion.div key={step} initial={{ opacity: 0, x: 16 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -16 }} transition={{ duration: 0.2 }} className="space-y-5">
          {step === 0 && (
            <>
              <CodeField channel="EMAIL" label="Email" type="email" placeholder="you@example.com" value={f.email} onChange={set('email')} proof={f.emailProof} onProof={set('emailProof')} local={local} />
              <CodeField channel="SMS" label="Mobile number" type="tel" placeholder="077 123 4567" value={f.phone} onChange={set('phone')} proof={f.phoneProof} onProof={set('phoneProof')} local={local} />
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
                <Field label="Date of birth" error={a.fields.dateOfBirth}>
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
                <input type="password" value={f.password} onChange={set('password')} className={input} autoComplete="new-password" />
              </Field>
              <Field label="Type it again" error={f.confirm && f.confirm !== f.password ? 'Does not match' : ''}>
                <input type="password" value={f.confirm} onChange={set('confirm')} className={input} autoComplete="new-password" />
              </Field>
            </>
          )}
          {step === 2 && (
            <div className="space-y-2">
              <p className="text-sm text-muted">Everyone is a traveller. You can also be one partner type; switch between them in the menu.</p>
              {ROLES.map((r) => (
                <button
                  key={r.title}
                  type="button"
                  disabled={r.soon}
                  onClick={() => set('partnerRole')(r.id)}
                  className={`flex w-full items-center gap-4 rounded-2xl p-4 text-left ring-1 transition disabled:opacity-50 ${f.partnerRole === r.id ? 'bg-brand-soft ring-2 ring-brand' : 'bg-surface ring-line hover:ring-ink/30'}`}
                >
                  <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-surface-2"><r.Icon className="h-5 w-5 text-brand" /></span>
                  <span className="min-w-0 flex-1">
                    <span className="block font-semibold">{r.id ? `Traveller + ${r.title}` : r.title}</span>
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
                <input type="checkbox" checked={f.accept} onChange={(e) => set('accept')(e.target.checked)} className="mt-1 h-5 w-5 accent-[var(--brand-ui)]" />
                <span className="text-sm">
                  I agree to the{' '}
                  <Link to="/legal/terms" target="_blank" className="font-semibold text-brand underline">terms of use</Link>, the{' '}
                  <Link to="/legal/privacy" target="_blank" className="font-semibold text-brand underline">privacy notice</Link> and the{' '}
                  <Link to="/legal/community" target="_blank" className="font-semibold text-brand underline">community guidelines</Link>. Payments for booked services go only through Yaluwo.
                </span>
              </label>
              <Notice>Next you'll verify your ID with your NIC (or passport) and a live selfie. Your ID number is encrypted and never shown to other people.</Notice>
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
          <Link to="/login" className="text-sm font-semibold text-brand hover:underline">I already have an account</Link>
        )}
        {step < 3 ? (
          <button type="button" disabled={!canNext} onClick={() => setStep(step + 1)} className={btn.primary}>
            Continue <ArrowRight className="h-4 w-4" />
          </button>
        ) : (
          <button type="button" disabled={!canNext || a.busy} onClick={submit} className={btn.accent}>
            {a.busy && <Loader2 className="h-4 w-4 animate-spin" />} Create account
          </button>
        )}
      </div>
    </AuthShell>
  )
}
