import { useEffect, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { BadgeCheck, Camera, Check, Clock, ImageUp, Loader2, RefreshCw, ShieldCheck } from 'lucide-react'
import { get, upload } from '../../api/client'
import { useAuth } from '../../auth/AuthProvider'
import { FilePick, Field, Notice, PageLoader, StatusBadge, input, useAction } from '../../components/form'
import { btn } from '../../components/ui'
import CaptureStudio from '../../components/capture/CaptureStudio'

const TYPES = {
  NIC: { label: 'NIC', need: ['selfie', 'front', 'back'], hint: '9 digits + V/X, or 12 digits', camera: true },
  PASSPORT: { label: 'Passport', need: ['selfie', 'front'], hint: 'For visitors from other countries', camera: true },
  LICENCE: { label: 'Driving licence', need: ['front', 'back'], hint: 'For drivers and self-drive', camera: true },
  POLICE: { label: 'Police clearance', need: ['front'], hint: 'Optional badge for drivers', camera: false },
}
const SHOT = (label) => ({
  selfie: { key: 'selfie', kind: 'face', title: 'Your face', hint: 'Fit your face in the oval. No sunglasses or cap.' },
  front: { key: 'front', kind: 'card', title: label === 'Passport' ? 'Passport photo page' : `Front of your ${label}`, hint: 'Fill the frame. Avoid glare.' },
  back: { key: 'back', kind: 'card', title: `Back of your ${label}`, hint: 'Turn the card over.' },
})
const SLOT_LABEL = { selfie: 'Your face', front: 'Front', back: 'Back' }

function Thumb({ file }) {
  const [url, setUrl] = useState(null)
  useEffect(() => {
    if (!file?.type?.startsWith('image/')) return setUrl(null)
    const u = URL.createObjectURL(file)
    setUrl(u)
    return () => URL.revokeObjectURL(u)
  }, [file])
  return url ? <img src={url} alt="" className="absolute inset-0 h-full w-full object-cover" /> : null
}

function CheckForm({ type, autoOpen, onDone }) {
  const t = TYPES[type]
  const shots = SHOT(t.label)
  const [number, setNumber] = useState('')
  const [expiresOn, setExpiresOn] = useState('')
  const [files, setFiles] = useState({})
  const [studio, setStudio] = useState(autoOpen && t.camera ? t.need : null) // which shots the camera is taking
  const [uploads, setUploads] = useState(!t.camera)
  const a = useAction()
  const missing = t.need.filter((k) => !files[k])
  const submit = (e) => {
    e.preventDefault()
    a.run(async () => {
      await upload('/me/verifications', { type, number, expiresOn: expiresOn || undefined, ...files })
      onDone()
    })
  }
  return (
    <form onSubmit={submit} className="space-y-6 rounded-3xl bg-surface p-6 ring-1 ring-line sm:p-8">
      <div>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="font-bold">Photos</p>
          {t.camera && (
            <button type="button" onClick={() => setUploads(!uploads)} className="inline-flex items-center gap-1.5 text-sm font-semibold text-brand hover:underline">
              {uploads ? <><Camera className="h-4 w-4" /> Use the camera</> : <><ImageUp className="h-4 w-4" /> Upload files instead</>}
            </button>
          )}
        </div>
        {uploads ? (
          <div className="mt-3 grid gap-4 sm:grid-cols-2">
            {t.need.map((k) => (
              <FilePick key={k} label={k === 'selfie' ? 'A photo of your face' : SLOT_LABEL[k]} accept={k === 'selfie' ? 'image/*' : 'image/*,application/pdf'} capture={k === 'selfie' ? 'user' : undefined} value={files[k]} onChange={(f) => setFiles({ ...files, [k]: f })} error={a.fields[k]} />
            ))}
          </div>
        ) : (
          <>
            <div className={`mt-3 grid gap-3 ${t.need.length === 3 ? 'grid-cols-3' : 'grid-cols-2'}`}>
              {t.need.map((k) => (
                <button key={k} type="button" onClick={() => setStudio([k])} className={`group relative aspect-[4/3] overflow-hidden rounded-2xl text-left ring-1 transition ${files[k] ? 'ring-success' : a.fields[k] ? 'ring-2 ring-danger' : 'bg-surface-2 ring-line hover:ring-brand'}`} aria-label={`${SLOT_LABEL[k]}: ${files[k] ? 'taken, take it again' : 'not taken yet'}`}>
                  <Thumb file={files[k]} />
                  {files[k] ? (
                    <>
                      <span className="absolute left-2 top-2 grid h-6 w-6 place-items-center rounded-full bg-success text-white"><Check className="h-3.5 w-3.5" /></span>
                      <span className="absolute inset-x-0 bottom-0 flex items-center justify-between bg-gradient-to-t from-black/70 to-transparent p-2 pt-6 text-xs font-semibold text-white">{SLOT_LABEL[k]} <RefreshCw className="h-3.5 w-3.5 opacity-0 transition group-hover:opacity-100" /></span>
                    </>
                  ) : (
                    <span className="absolute inset-0 grid place-items-center text-center text-sm font-semibold text-muted"><span><Camera className="mx-auto mb-1 h-5 w-5" />{SLOT_LABEL[k]}</span></span>
                  )}
                </button>
              ))}
            </div>
            <button type="button" onClick={() => setStudio(missing.length ? missing : t.need)} className={`${missing.length ? btn.accent : btn.ghost} mt-4 w-full`}>
              <Camera className="h-5 w-5" /> {missing.length === t.need.length ? 'Open the camera' : missing.length ? `Take the ${missing.length === 1 ? 'last photo' : `other ${missing.length} photos`}` : 'Take all photos again'}
            </button>
          </>
        )}
      </div>

      <Field label={`${t.label} number`} hint={t.hint} error={a.fields.number}>
        <input value={number} onChange={(e) => setNumber(e.target.value)} className={`${input} font-display tracking-wider`} autoComplete="off" autoCapitalize="characters" />
      </Field>
      {(type === 'LICENCE' || type === 'PASSPORT') && (
        <Field label="Expiry date" error={a.fields.expiresOn}>
          <input type="date" value={expiresOn} onChange={(e) => setExpiresOn(e.target.value)} className={input} />
        </Field>
      )}

      {a.error && <Notice tone="danger">{a.error}</Notice>}
      <button disabled={a.busy || !number || missing.length > 0} className={`${btn.primary} w-full`}>
        {a.busy && <Loader2 className="h-4 w-4 animate-spin" />} Send for checking
      </button>
      <p className="text-sm text-muted">Your number is encrypted. Only Yaluwo's verification team sees your photos, and every view is logged.</p>

      {studio && (
        <CaptureStudio
          shots={studio.map((k) => shots[k])}
          onCancel={() => setStudio(null)}
          onUseUploads={() => { setStudio(null); setUploads(true) }}
          onDone={(taken) => { setFiles((f) => ({ ...f, ...taken })); setStudio(null) }}
        />
      )}
    </form>
  )
}

export default function Verify() {
  const { user, reloadUser } = useAuth()
  const [params] = useSearchParams()
  const welcome = Boolean(params.get('welcome'))
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
  const idDone = ['NIC', 'PASSPORT'].some((t) => ['PENDING', 'APPROVED'].includes(latest(t)?.status))

  return (
    <div className="mx-auto max-w-2xl px-4 pb-20 pt-28">
      {welcome && (
        <ol className="mb-8 flex gap-1.5" aria-label="Sign-up steps">
          {['Contact', 'About you', 'Your role', 'Agree', 'ID check'].map((label, i) => (
            <li key={label} className="flex-1">
              <span className={`block h-1.5 rounded-full ${i < 4 || idDone ? 'bg-brand' : 'bg-accent'}`} />
              <span className={`mt-2 hidden text-xs font-semibold sm:block ${i === 4 ? 'text-ink' : 'text-muted'}`}>{label}</span>
            </li>
          ))}
        </ol>
      )}
      <div className="flex items-start gap-4">
        <span className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-brand-soft text-brand"><ShieldCheck className="h-6 w-6" /></span>
        <div>
          <h1 className="text-[clamp(1.6rem,3.2vw,2.2rem)]">{welcome ? `One last step, ${user.firstName}` : 'Verification'}</h1>
          <p className="mt-2 text-muted">{welcome ? 'Your account is ready. Show us it is really you, and you can join, host or drive.' : 'Anyone can browse. Joining, hosting and driving need a verified ID.'}</p>
        </div>
      </div>

      {user.verified && (
        <Notice tone="success" className="mt-6">
          <span className="flex items-center gap-1.5 font-semibold"><BadgeCheck className="h-4 w-4" /> Your ID is verified.</span>
        </Notice>
      )}

      <div className="mt-8 flex flex-wrap gap-2" role="tablist" aria-label="Document">
        {showTypes.map((t) => {
          const v = latest(t)
          return (
            <button key={t} role="tab" aria-selected={type === t} onClick={() => setType(t)} className={`inline-flex items-center gap-2 rounded-full px-4 py-2 text-sm font-semibold transition ${type === t ? 'bg-ink text-bg' : 'bg-surface ring-1 ring-line hover:ring-ink/40'}`}>
              {TYPES[t].label} {v && <StatusBadge status={v.status} />}
            </button>
          )
        })}
      </div>

      <div className="mt-6">
        {current?.status === 'PENDING' ? (
          <div className="rounded-3xl bg-surface p-8 ring-1 ring-line">
            <p className="flex items-center gap-2 text-lg font-bold"><Clock className="h-5 w-5 text-accent" /> Being checked</p>
            <p className="mt-2 text-muted">Sent {new Date(current.submittedAt).toLocaleString('en-GB')}. A person on the Yaluwo team looks at every ID. You'll get an email when it's done.</p>
            <div className="mt-6 flex flex-wrap gap-3">
              <Link to="/trips" className={btn.primary}>Browse trips while you wait</Link>
              <Link to="/me/profile" className={btn.ghost}>Take the travel-style quiz</Link>
            </div>
          </div>
        ) : current?.status === 'APPROVED' ? (
          <div className="rounded-3xl bg-surface p-8 ring-1 ring-line">
            <p className="flex items-center gap-2 text-lg font-bold text-success"><BadgeCheck className="h-5 w-5" /> Approved</p>
            {current.expiresOn && <p className="mt-2 text-muted">Valid until {current.expiresOn}. We remind you 30 days before it expires.</p>}
          </div>
        ) : (
          <>
            {current && ['REJECTED', 'RESUBMIT'].includes(current.status) && <Notice tone="warning" className="mb-4"><b>{current.status === 'RESUBMIT' ? 'Please send it again.' : 'Not accepted.'}</b> {current.reason}</Notice>}
            <CheckForm key={type} type={type} autoOpen={welcome && !current} onDone={() => { load(); reloadUser() }} />
          </>
        )}
      </div>

      {!welcome && (
        <div className="mt-10 flex flex-wrap gap-3">
          <Link to="/me/profile" className={btn.ghost}>Take the travel-style quiz</Link>
          {isDriver && <Link to="/partner" className={btn.ghost}>Driver dashboard</Link>}
        </div>
      )}
    </div>
  )
}
