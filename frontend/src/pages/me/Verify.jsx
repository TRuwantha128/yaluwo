import { useEffect, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { ArrowRight, BadgeCheck, Camera, Clock, Loader2, ShieldCheck } from 'lucide-react'
import { get, upload } from '../../api/client'
import { useAuth } from '../../auth/AuthProvider'
import { FilePick, Field, Notice, PageLoader, StatusBadge, input, useAction } from '../../components/form'
import { btn } from '../../components/ui'

const TYPES = {
  NIC: { label: 'NIC', need: ['front', 'back', 'selfie'], hint: '9 digits + V/X, or 12 digits' },
  PASSPORT: { label: 'Passport', need: ['front', 'selfie'], hint: 'For visitors from other countries' },
  LICENCE: { label: 'Driving licence', need: ['front', 'back'], hint: 'For drivers and self-drive' },
  POLICE: { label: 'Police clearance', need: ['front'], hint: 'Optional badge for drivers' },
}

function UploadForm({ type, onDone }) {
  const t = TYPES[type]
  const [number, setNumber] = useState('')
  const [expiresOn, setExpiresOn] = useState('')
  const [files, setFiles] = useState({})
  const a = useAction()
  const submit = (e) => {
    e.preventDefault()
    a.run(async () => {
      await upload('/me/verifications', { type, number, expiresOn: expiresOn || undefined, ...files })
      onDone()
    })
  }
  return (
    <form onSubmit={submit} className="space-y-5 rounded-3xl bg-surface p-6 ring-1 ring-line">
      <Field label={`${t.label} number`} hint={t.hint} error={a.fields.number}>
        <input value={number} onChange={(e) => setNumber(e.target.value)} className={input} autoComplete="off" />
      </Field>
      {(type === 'LICENCE' || type === 'PASSPORT') && (
        <Field label="Expiry date" error={a.fields.expiresOn}>
          <input type="date" value={expiresOn} onChange={(e) => setExpiresOn(e.target.value)} className={input} />
        </Field>
      )}
      <div className="grid gap-4 sm:grid-cols-2">
        {t.need.includes('front') && <FilePick label="Front" value={files.front} onChange={(f) => setFiles({ ...files, front: f })} error={a.fields.front} />}
        {t.need.includes('back') && <FilePick label="Back" value={files.back} onChange={(f) => setFiles({ ...files, back: f })} error={a.fields.back} />}
      </div>
      {t.need.includes('selfie') && (
        <div>
          <FilePick label="Live selfie" hint="a 3-second video turning your head, or a photo" accept="video/*,image/*" capture="user" value={files.selfie} onChange={(f) => setFiles({ ...files, selfie: f })} error={a.fields.selfie} />
          <p className="mt-1.5 flex items-center gap-1.5 text-xs text-muted"><Camera className="h-3.5 w-3.5" /> On a phone this opens the front camera.</p>
        </div>
      )}
      {a.error && <Notice tone="danger">{a.error}</Notice>}
      <button disabled={a.busy || !number || t.need.some((k) => !files[k])} className={`${btn.primary} w-full`}>
        {a.busy && <Loader2 className="h-4 w-4 animate-spin" />} Send for checking
      </button>
      <p className="text-xs text-muted">Your number is encrypted. Only Yaluwo's verification team sees your documents, and every view is logged.</p>
    </form>
  )
}

export default function Verify() {
  const { user, reloadUser } = useAuth()
  const [params] = useSearchParams()
  const [me, setMe] = useState(null)
  const [type, setType] = useState(params.get('type') ?? (user?.nationality === 'LK' ? 'NIC' : 'PASSPORT'))
  const load = () => get('/me').then(setMe)
  useEffect(() => {
    load()
  }, [])
  if (!me) return <PageLoader />
  const latest = (t) => me.verifications.find((v) => v.type === t)
  const current = latest(type)
  const isDriver = user.roles.some((r) => ['DRIVER', 'FLEET'].includes(r))
  const showTypes = ['NIC', 'PASSPORT', ...(isDriver ? ['LICENCE', 'POLICE'] : ['LICENCE'])]

  return (
    <div className="mx-auto max-w-3xl px-4 pb-16 pt-28">
      {params.get('welcome') && <Notice tone="success" className="mb-6">Welcome to Yaluwo, {user.firstName}! One more step: verify your ID so you can join and host trips.</Notice>}
      <div className="flex items-start gap-4">
        <span className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-brand-soft text-brand"><ShieldCheck className="h-6 w-6" /></span>
        <div>
          <h1 className="text-3xl font-extrabold tracking-tight">Verification</h1>
          <p className="mt-1 text-muted">Anyone can browse. Joining, hosting and driving need a verified ID. We check within 24 hours.</p>
        </div>
      </div>

      {user.verified && (
        <Notice tone="success" className="mt-6">
          <span className="flex items-center gap-1.5 font-semibold"><BadgeCheck className="h-4 w-4" /> Your ID is verified.</span>
        </Notice>
      )}

      <div className="mt-8 flex flex-wrap gap-2">
        {showTypes.map((t) => {
          const v = latest(t)
          return (
            <button key={t} onClick={() => setType(t)} className={`inline-flex items-center gap-2 rounded-full px-4 py-2 text-sm font-semibold transition ${type === t ? 'bg-ink text-bg' : 'bg-surface ring-1 ring-line hover:ring-ink/30'}`}>
              {TYPES[t].label} {v && <StatusBadge status={v.status} />}
            </button>
          )
        })}
      </div>

      <div className="mt-6">
        {current?.status === 'PENDING' ? (
          <div className="rounded-3xl bg-surface p-6 ring-1 ring-line">
            <p className="flex items-center gap-2 font-semibold"><Clock className="h-5 w-5 text-accent" /> Being checked</p>
            <p className="mt-1 text-sm text-muted">Sent {new Date(current.submittedAt).toLocaleString('en-GB')}. You'll get an email when it's done.</p>
          </div>
        ) : current?.status === 'APPROVED' ? (
          <div className="rounded-3xl bg-surface p-6 ring-1 ring-line">
            <p className="flex items-center gap-2 font-semibold text-success"><BadgeCheck className="h-5 w-5" /> Approved</p>
            {current.expiresOn && <p className="mt-1 text-sm text-muted">Valid until {current.expiresOn}. We remind you 30 days before it expires.</p>}
          </div>
        ) : (
          <>
            {current && ['REJECTED', 'RESUBMIT'].includes(current.status) && <Notice tone="warning" className="mb-4"><b>{current.status === 'RESUBMIT' ? 'Please send it again.' : 'Not accepted.'}</b> {current.reason}</Notice>}
            <UploadForm type={type} onDone={() => { load(); reloadUser() }} />
          </>
        )}
      </div>

      <div className="mt-10 flex flex-wrap gap-3">
        <Link to="/me/profile" className={btn.ghost}>Take the travel-style quiz <ArrowRight className="h-4 w-4" /></Link>
        {isDriver && <Link to="/partner" className={btn.ghost}>Driver dashboard <ArrowRight className="h-4 w-4" /></Link>}
      </div>
    </div>
  )
}
