import { useState } from 'react'
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { Loader2, ShieldCheck } from 'lucide-react'
import AuthShell from './AuthShell'
import { post } from '../../api/client'
import { useAuth } from '../../auth/AuthProvider'
import { Field, Notice, input, useAction } from '../../components/form'
import { btn } from '../../components/ui'

function SecondStep({ mfaToken, onDone }) {
  const [code, setCode] = useState('')
  const [backup, setBackup] = useState(false)
  const a = useAction()
  const submit = (e) => {
    e.preventDefault()
    a.run(async () => onDone(await post('/auth/2fa/login', backup ? { mfaToken, backupCode: code } : { mfaToken, code })))
  }
  return (
    <form onSubmit={submit} className="space-y-4">
      <Notice>
        <span className="flex items-center gap-2 font-semibold"><ShieldCheck className="h-4 w-4" /> Two-step login</span>
        {backup ? 'Enter one of your backup codes.' : 'Enter the 6-digit code from your authenticator app.'}
      </Notice>
      <input autoFocus inputMode={backup ? 'text' : 'numeric'} autoComplete="one-time-code" value={code} onChange={(e) => setCode(e.target.value)} className={`${input} text-center tracking-[0.4em]`} aria-label="Code" />
      {a.error && <Notice tone="danger">{a.error}</Notice>}
      <button disabled={a.busy || code.length < 6} className={`${btn.primary} w-full`}>
        {a.busy && <Loader2 className="h-4 w-4 animate-spin" />} Log in
      </button>
      <button type="button" onClick={() => setBackup(!backup)} className="w-full text-sm font-semibold text-brand hover:underline">
        {backup ? 'Use the authenticator code' : 'Use a backup code instead'}
      </button>
    </form>
  )
}

export function LoginForm({ admin = false }) {
  const navigate = useNavigate()
  const [params] = useSearchParams()
  const { login } = useAuth()
  const [identifier, setIdentifier] = useState('')
  const [password, setPassword] = useState('')
  const [mfa, setMfa] = useState(null)
  const a = useAction()

  const finish = (session) => {
    login(session)
    const next = params.get('next')
    navigate(session.user.isAdmin ? '/admin' : next && next.startsWith('/') ? next : '/me', { replace: true })
  }
  const submit = (e) => {
    e.preventDefault()
    a.run(async () => {
      const r = await post('/auth/login', { identifier, password, admin })
      if (r.mfaRequired) setMfa(r.mfaToken)
      else finish(r)
    })
  }
  if (mfa) return <SecondStep mfaToken={mfa} onDone={finish} />
  return (
    <form onSubmit={submit} className="space-y-4">
      <Field label="Email or mobile">
        <input value={identifier} onChange={(e) => setIdentifier(e.target.value)} className={input} autoComplete="username" autoFocus />
      </Field>
      <Field label="Password">
        <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} className={input} autoComplete="current-password" />
      </Field>
      {a.error && <Notice tone="danger">{a.error}</Notice>}
      <button disabled={a.busy || !identifier || !password} className={`${btn.primary} w-full`}>
        {a.busy && <Loader2 className="h-4 w-4 animate-spin" />} Log in
      </button>
      <div className="flex justify-between text-sm">
        <Link to="/forgot-password" className="font-semibold text-brand hover:underline">Forgot password?</Link>
        {!admin && <Link to="/signup" className="font-semibold text-brand hover:underline">Create an account</Link>}
      </div>
    </form>
  )
}

export default function Login() {
  return (
    <AuthShell title="Welcome back" text="Log in to see your trips, messages and payments." photo="sigiriya">
      <LoginForm />
    </AuthShell>
  )
}

export function ForgotPassword() {
  const [identifier, setIdentifier] = useState('')
  const [done, setDone] = useState(null)
  const [sms, setSms] = useState({ code: '', password: '', confirm: '', totp: '' })
  const navigate = useNavigate()
  const a = useAction()
  const send = (e) => {
    e.preventDefault()
    a.run(async () => setDone(await post('/auth/password/forgot', { identifier })))
  }
  const resetBySms = (e) => {
    e.preventDefault()
    a.run(async () => {
      await post('/auth/password/reset', { phone: identifier, smsCode: sms.code, password: sms.password, confirm: sms.confirm, code: sms.totp || undefined })
      navigate('/login?reset=1')
    })
  }
  const byPhone = !identifier.includes('@')
  return (
    <AuthShell title="Reset your password" text="Enter your email or mobile number." photo="horton">
      {!done ? (
        <form onSubmit={send} className="space-y-4">
          <Field label="Email or mobile">
            <input value={identifier} onChange={(e) => setIdentifier(e.target.value)} className={input} autoFocus />
          </Field>
          {a.error && <Notice tone="danger">{a.error}</Notice>}
          <button disabled={a.busy || identifier.length < 5} className={`${btn.primary} w-full`}>Send link or code</button>
        </form>
      ) : (
        <div className="space-y-4">
          <Notice tone="success">{done.message}</Notice>
          {byPhone && (
            <form onSubmit={resetBySms} className="space-y-3">
              <Field label="Code from the SMS"><input value={sms.code} onChange={(e) => setSms({ ...sms, code: e.target.value })} inputMode="numeric" className={input} /></Field>
              <Field label="New password"><input type="password" value={sms.password} onChange={(e) => setSms({ ...sms, password: e.target.value })} className={input} autoComplete="new-password" /></Field>
              <Field label="Type it again"><input type="password" value={sms.confirm} onChange={(e) => setSms({ ...sms, confirm: e.target.value })} className={input} autoComplete="new-password" /></Field>
              <Field label="Authenticator code" hint="only if two-step login is on"><input value={sms.totp} onChange={(e) => setSms({ ...sms, totp: e.target.value })} inputMode="numeric" className={input} /></Field>
              {a.error && <Notice tone="danger">{a.error}</Notice>}
              <button disabled={a.busy} className={`${btn.primary} w-full`}>Set new password</button>
            </form>
          )}
        </div>
      )}
    </AuthShell>
  )
}

export function ResetPassword() {
  const { token } = useParams()
  const navigate = useNavigate()
  const [f, setF] = useState({ password: '', confirm: '', code: '' })
  const a = useAction()
  const submit = (e) => {
    e.preventDefault()
    a.run(async () => {
      await post('/auth/password/reset', { token, password: f.password, confirm: f.confirm, code: f.code || undefined })
      navigate('/login?reset=1')
    })
  }
  return (
    <AuthShell title="Choose a new password" text="All your other devices will be logged out." photo="horton">
      <form onSubmit={submit} className="space-y-4">
        <Field label="New password" error={a.fields.password}><input type="password" value={f.password} onChange={(e) => setF({ ...f, password: e.target.value })} className={input} autoComplete="new-password" /></Field>
        <Field label="Type it again" error={a.fields.confirm}><input type="password" value={f.confirm} onChange={(e) => setF({ ...f, confirm: e.target.value })} className={input} autoComplete="new-password" /></Field>
        <Field label="Authenticator code" hint="only if two-step login is on" error={a.fields.code}><input value={f.code} onChange={(e) => setF({ ...f, code: e.target.value })} className={input} /></Field>
        {a.error && <Notice tone="danger">{a.error}</Notice>}
        <button disabled={a.busy} className={`${btn.primary} w-full`}>Set new password</button>
      </form>
    </AuthShell>
  )
}

// "This wasn't me" link from a security email
export function NotMe() {
  const { token } = useParams()
  const a = useAction()
  const [done, setDone] = useState(null)
  return (
    <AuthShell title="Lock your account?" text="If you didn't change your password or log in, lock the account now. Then reset your password to unlock it." photo="knuckles">
      {done ? (
        <Notice tone="success">{done.message}</Notice>
      ) : (
        <>
          {a.error && <Notice tone="danger" className="mb-4">{a.error}</Notice>}
          <button onClick={() => a.run(async () => setDone(await post(`/auth/not-me/${token}`)))} disabled={a.busy} className={`${btn.accent} w-full`}>
            Lock my account
          </button>
        </>
      )}
    </AuthShell>
  )
}
