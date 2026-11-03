import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { BadgeCheck, Copy, KeyRound, Loader2, LogOut, ShieldCheck, Smartphone } from 'lucide-react'
import { post } from '../../api/client'
import { useAuth } from '../../auth/AuthProvider'
import { useConfig } from '../../config/useConfig'
import { Field, Notice, input, useAction } from '../../components/form'
import { btn } from '../../components/ui'

function TwoStep() {
  const { user, reloadUser } = useAuth()
  const [setup, setSetup] = useState(null)
  const [code, setCode] = useState('')
  const [codes, setCodes] = useState(null)
  const a = useAction()
  if (codes) {
    return (
      <div>
        <Notice tone="success">Two-step login is on. Print or copy these backup codes and keep them offline. Each works once.</Notice>
        <div className="mt-4 grid grid-cols-2 gap-2 rounded-2xl bg-surface-2 p-4 font-mono text-sm sm:grid-cols-5">{codes.map((c) => <span key={c}>{c}</span>)}</div>
        <button onClick={() => navigator.clipboard?.writeText(codes.join('\n'))} className={`${btn.ghost} mt-3`}><Copy className="h-4 w-4" /> Copy codes</button>
      </div>
    )
  }
  if (user.twoStep) return <p className="flex items-center gap-2 font-semibold text-success"><BadgeCheck className="h-5 w-5" /> Two-step login is on</p>
  if (!setup) {
    return (
      <div>
        <p className="text-sm text-muted">Use an authenticator app (Google Authenticator, Microsoft Authenticator or Authy). Required for drivers and partners who receive payouts.</p>
        {a.error && <Notice tone="danger" className="mt-3">{a.error}</Notice>}
        <button onClick={() => a.run(async () => setSetup(await post('/auth/2fa/setup')))} className={`${btn.primary} mt-4`}><Smartphone className="h-4 w-4" /> Turn on two-step login</button>
      </div>
    )
  }
  return (
    <div className="grid gap-6 sm:grid-cols-[auto_1fr]">
      <img src={setup.qr} alt="QR code for your authenticator app" className="h-44 w-44 rounded-2xl bg-white p-2 ring-1 ring-line" />
      <div>
        <p className="text-sm">1. Scan the code with your authenticator app, or type this key:</p>
        <p className="mt-1 break-all rounded-xl bg-surface-2 px-3 py-2 font-mono text-sm">{setup.secret}</p>
        <p className="mt-4 text-sm">2. Enter the 6-digit code it shows:</p>
        <div className="mt-2 flex gap-2">
          <input value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))} maxLength={6} inputMode="numeric" className={`${input} tracking-[0.4em]`} aria-label="Code" />
          <button disabled={code.length !== 6 || a.busy} onClick={() => a.run(async () => { const r = await post('/auth/2fa/enable', { code }); setCodes(r.backupCodes); reloadUser() })} className={`${btn.primary} shrink-0`}>Turn on</button>
        </div>
        {a.error && <Notice tone="danger" className="mt-3">{a.error}</Notice>}
      </div>
    </div>
  )
}

export default function Security() {
  const { user, logout } = useAuth()
  const navigate = useNavigate()
  const config = useConfig()
  const [f, setF] = useState({ current: '', next: '', confirm: '', code: '' })
  const [done, setDone] = useState(false)
  const a = useAction()
  const out = useAction()
  const min = config?.settings?.[user.isAdmin ? 'accounts.admin_password_min' : 'accounts.password_min'] ?? 10

  return (
    <div className="mx-auto max-w-3xl space-y-8 px-4 pb-16 pt-28">
      <div className="flex items-start gap-4">
        <span className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-brand-soft text-brand"><ShieldCheck className="h-6 w-6" /></span>
        <div>
          <h1 className="text-3xl font-extrabold tracking-tight">Security</h1>
          <p className="mt-1 text-muted">Nobody at Yaluwo can see your password, not even the admin.</p>
        </div>
      </div>

      <section className="rounded-3xl bg-surface p-6 ring-1 ring-line">
        <h2 className="flex items-center gap-2 text-xl font-extrabold tracking-tight"><KeyRound className="h-5 w-5" /> Change password</h2>
        {done ? (
          <Notice tone="success" className="mt-4">Password changed. Your other devices were logged out, and we sent an email with a "This wasn't me" link.</Notice>
        ) : (
          <form onSubmit={(e) => { e.preventDefault(); a.run(async () => { await post('/auth/password/change', { ...f, code: f.code || undefined }); setDone(true) }) }} className="mt-5 grid gap-4 sm:grid-cols-2">
            <Field label="Current password" error={a.fields.current} className="sm:col-span-2"><input type="password" value={f.current} onChange={(e) => setF({ ...f, current: e.target.value })} className={input} autoComplete="current-password" /></Field>
            <Field label="New password" hint={`${min}+ characters, not one of your last 5`}><input type="password" value={f.next} onChange={(e) => setF({ ...f, next: e.target.value })} className={input} autoComplete="new-password" /></Field>
            <Field label="Type it again" error={a.fields.confirm}><input type="password" value={f.confirm} onChange={(e) => setF({ ...f, confirm: e.target.value })} className={input} autoComplete="new-password" /></Field>
            {user.twoStep && <Field label="Authenticator code" error={a.fields.code}><input value={f.code} onChange={(e) => setF({ ...f, code: e.target.value })} inputMode="numeric" className={input} /></Field>}
            {a.error && <Notice tone="danger" className="sm:col-span-2">{a.error}</Notice>}
            <div className="sm:col-span-2"><button disabled={a.busy} className={btn.primary}>{a.busy && <Loader2 className="h-4 w-4 animate-spin" />} Change password</button></div>
          </form>
        )}
      </section>

      <section className="rounded-3xl bg-surface p-6 ring-1 ring-line">
        <h2 className="mb-4 flex items-center gap-2 text-xl font-extrabold tracking-tight"><Smartphone className="h-5 w-5" /> Two-step login</h2>
        <TwoStep />
      </section>

      <section className="rounded-3xl bg-surface p-6 ring-1 ring-line">
        <h2 className="flex items-center gap-2 text-xl font-extrabold tracking-tight"><LogOut className="h-5 w-5" /> Devices</h2>
        <p className="mt-1 text-sm text-muted">Logged in somewhere you don't recognise? End every session, including this one.</p>
        {out.error && <Notice tone="danger" className="mt-3">{out.error}</Notice>}
        <button onClick={() => out.run(async () => { await post('/auth/sessions/revoke-all'); await logout(); navigate('/login') })} className={`${btn.ghost} mt-4`}>Log out of all devices</button>
      </section>
    </div>
  )
}
