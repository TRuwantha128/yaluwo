import { useEffect, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { AlertTriangle, ArrowRight, Check, CheckCircle2, ExternalLink, Search, XCircle } from 'lucide-react'
import { get, post } from '../../api/client'
import { useLive } from '../../auth/AuthProvider'
import { Countdown, Field, Notice, PageLoader, StatusBadge, input, useAction } from '../../components/form'
import { btn } from '../../components/ui'
import { rs } from '../../lib/format'
import { PageTitle } from './AdminShell'

const when = (d) => (d ? new Date(d).toLocaleString('en-GB', { dateStyle: 'medium', timeStyle: 'short' }) : '')

// ---------- Today inbox ----------
export function AdminToday() {
  const [d, setD] = useState(null)
  const a = useAction()
  const load = () => get('/admin/today').then(setD)
  useEffect(() => {
    load()
  }, [])
  useLive((type) => (type === 'inbox' || type === 'notification') && load())
  if (!d) return <PageLoader />
  const groups = { 1: 'Urgent', 2: 'Disputes and chargebacks', 3: 'Verifications and trips to review', 4: 'Money', 6: 'Reports and reviews', 7: 'For information' }
  return (
    <div>
      <PageTitle title="Today" text="Everything to do, sorted by deadline. Overdue items are red." />
      {d.items.length === 0 && <Notice tone="success">Nothing waiting. Nice.</Notice>}
      {Object.entries(groups).map(([order, label]) => {
        const items = d.items.filter((i) => String(i.order) === order)
        if (!items.length) return null
        return (
          <section key={order} className="mb-6">
            <h2 className="mb-2 text-xs font-bold uppercase tracking-wider text-muted">{label}</h2>
            <ul className="space-y-2">
              {items.map((i, n) => (
                <li key={n} className={`flex flex-wrap items-center gap-3 rounded-2xl bg-surface px-4 py-3 ring-1 ${i.kind === 'SOS' ? 'ring-2 ring-danger' : i.overdue ? 'ring-danger/40' : 'ring-line'}`}>
                  {i.kind === 'SOS' && <AlertTriangle className="h-5 w-5 text-danger" />}
                  <span className="min-w-0 flex-1 font-semibold">{i.title}</span>
                  {i.dueAt && <Countdown to={i.dueAt} className="text-xs" />}
                  {i.kind === 'SOS' ? (
                    <>
                      {i.lat && <a href={`https://maps.google.com/?q=${i.lat},${i.lng}`} target="_blank" rel="noreferrer" className="text-sm font-semibold text-brand">Location</a>}
                      <button onClick={() => a.run(async () => { await post(`/admin/sos/${i.id}/handled`); load() })} className={`${btn.primary} !py-1.5 text-sm`}>Handled</button>
                    </>
                  ) : (
                    <Link to={i.link} className="inline-flex items-center gap-1 text-sm font-semibold text-brand">Open <ArrowRight className="h-4 w-4" /></Link>
                  )}
                </li>
              ))}
            </ul>
          </section>
        )
      })}
    </div>
  )
}

// ---------- Verifications ----------
export function AdminVerifications() {
  const [rows, setRows] = useState(null)
  const [status, setStatus] = useState('PENDING')
  useEffect(() => {
    setRows(null)
    get('/admin/verifications', { status }).then((r) => setRows(r.verifications))
  }, [status])
  return (
    <div>
      <PageTitle title="Verifications" text="People, licences, vehicles and bank accounts. Decide within 24 hours." />
      <div className="mb-4 flex gap-2">{['PENDING', 'APPROVED', 'REJECTED', 'RESUBMIT'].map((s) => <button key={s} onClick={() => setStatus(s)} className={`rounded-full px-4 py-2 text-sm font-semibold ${status === s ? 'bg-ink text-bg' : 'bg-surface ring-1 ring-line'}`}>{s.toLowerCase()}</button>)}</div>
      {!rows ? <PageLoader /> : rows.length === 0 ? <Notice>Nothing here.</Notice> : (
        <ul className="space-y-2">
          {rows.map((v) => (
            <li key={v.id}><Link to={`/admin/verifications/${v.id}`} className="flex flex-wrap items-center gap-3 rounded-2xl bg-surface px-4 py-3 ring-1 ring-line hover:ring-brand">
              <span className="w-28 text-sm font-bold">{v.type}</span>
              <span className="flex-1 font-semibold">{v.full_name}</span>
              <span className="text-xs text-muted">sent {when(v.created_at)}</span>
              {v.status === 'PENDING' && <Countdown to={v.due_at} className="text-xs" />}
            </Link></li>
          ))}
        </ul>
      )}
    </div>
  )
}

export function AdminVerification() {
  const { id } = useParams()
  const navigate = useNavigate()
  const [d, setD] = useState(null)
  const [reason, setReason] = useState('')
  const a = useAction()
  useEffect(() => {
    get(`/admin/verifications/${id}`).then(setD)
  }, [id])
  if (!d) return <PageLoader />
  const v = d.verification
  const decide = (decision) => a.run(async () => { await post(`/admin/verifications/${id}/decide`, { decision, reason: reason || undefined }); navigate('/admin/verifications') })
  return (
    <div>
      <PageTitle title={`${v.type} · ${d.user.fullName}`} text="Opening documents is recorded in the audit log." action={<StatusBadge status={v.status} />} />
      <div className="grid gap-6 xl:grid-cols-[1.4fr_1fr]">
        <div className="space-y-4">
          {Object.entries(v.files).map(([k, url]) => (
            <figure key={k} className="overflow-hidden rounded-3xl bg-surface ring-1 ring-line">
              <figcaption className="flex items-center justify-between px-4 py-2 text-sm font-semibold capitalize">{k.replace(/([A-Z])/g, ' $1')}<a href={url} target="_blank" rel="noreferrer" className="text-brand"><ExternalLink className="h-4 w-4" /></a></figcaption>
              {/\.(mp4|webm|mov)/.test(url) ? <video src={url} controls className="w-full" /> : /\.pdf/.test(url) ? <iframe src={url} title={k} className="h-96 w-full" /> : <img src={url} alt={k} className="max-h-[480px] w-full object-contain bg-surface-2" />}
            </figure>
          ))}
          {d.vehicle && (
            <div className="rounded-3xl bg-surface p-5 ring-1 ring-line">
              <p className="font-bold">{d.vehicle.make} {d.vehicle.model} {d.vehicle.year} · {d.vehicle.plate} · {d.vehicle.type} · {d.vehicle.seats} seats</p>
              <p className="text-sm text-muted">Photos must match the plate number.</p>
              <div className="mt-3 grid grid-cols-3 gap-2">{d.vehicle.photos.map((p) => <figure key={p.id}><img src={p.url} alt={p.angle} className="aspect-[4/3] w-full rounded-xl object-cover" /><figcaption className="text-xs text-muted">{p.angle}</figcaption></figure>)}</div>
            </div>
          )}
        </div>
        <div className="space-y-4">
          <div className="rounded-3xl bg-surface p-5 ring-1 ring-line text-sm">
            <p className="font-bold">What they entered</p>
            <dl className="mt-2 grid grid-cols-[auto_1fr] gap-x-4 gap-y-1">
              <dt className="text-muted">Name</dt><dd>{d.user.fullName}</dd>
              <dt className="text-muted">Gender</dt><dd>{d.user.gender}</dd>
              <dt className="text-muted">Birth date</dt><dd>{d.user.dateOfBirth}</dd>
              {v.number && <><dt className="text-muted">Number</dt><dd className="font-mono">{v.number}</dd></>}
              {v.expiresOn && <><dt className="text-muted">Expires</dt><dd>{v.expiresOn}</dd></>}
              {v.details?.bank && <><dt className="text-muted">Bank</dt><dd>{v.details.bank}, {v.details.branch} · {v.details.holderName}</dd></>}
            </dl>
          </div>
          <div className="rounded-3xl bg-surface p-5 ring-1 ring-line">
            <p className="text-sm font-bold">Automatic checks</p>
            <ul className="mt-2 space-y-1.5 text-sm">
              {(v.details?.checks ?? []).map((c) => (
                <li key={c.name} className="flex items-start gap-2">
                  {c.ok === true ? <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-success" /> : c.ok === false ? <XCircle className="mt-0.5 h-4 w-4 shrink-0 text-danger" /> : <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-accent" />}
                  <span><b>{c.name}</b>{c.note && <span className="block text-muted">{c.note}</span>}</span>
                </li>
              ))}
            </ul>
          </div>
          {v.status === 'PENDING' && (
            <div className="rounded-3xl bg-surface p-5 ring-1 ring-line">
              <Field label="Reason" hint="needed to reject or ask again"><textarea value={reason} onChange={(e) => setReason(e.target.value)} rows={2} className={`${input} h-auto py-2`} /></Field>
              {a.error && <Notice tone="danger" className="mt-3">{a.error}</Notice>}
              <div className="mt-4 grid gap-2">
                <button disabled={a.busy} onClick={() => decide('APPROVE')} className={btn.primary}><Check className="h-4 w-4" /> Approve</button>
                <div className="grid grid-cols-2 gap-2">
                  <button disabled={a.busy || !reason} onClick={() => decide('RESUBMIT')} className={btn.ghost}>Ask for a clearer photo</button>
                  <button disabled={a.busy || !reason} onClick={() => decide('REJECT')} className={`${btn.ghost} text-danger`}>Reject</button>
                </div>
              </div>
            </div>
          )}
          <Link to={`/admin/users/${d.user.id}`} className="block text-sm font-semibold text-brand hover:underline">Open user profile</Link>
        </div>
      </div>
    </div>
  )
}

// ---------- Trips ----------
export function AdminTrips() {
  const [rows, setRows] = useState(null)
  const [status, setStatus] = useState('UNDER_REVIEW')
  const [q, setQ] = useState('')
  const load = () => get('/admin/trips', { status: status || undefined, q: q || undefined }).then((r) => setRows(r.trips))
  useEffect(() => {
    load()
  }, [status])
  return (
    <div>
      <PageTitle title="Trips" />
      <div className="mb-4 flex flex-wrap gap-2">
        {['UNDER_REVIEW', 'OPEN', 'BOOKING', 'PAYMENT_DUE', 'CONFIRMED', 'ONGOING', 'COMPLETED', 'CANCELLED', ''].map((s) => <button key={s} onClick={() => setStatus(s)} className={`rounded-full px-3 py-1.5 text-xs font-semibold ${status === s ? 'bg-ink text-bg' : 'bg-surface ring-1 ring-line'}`}>{s ? s.replace('_', ' ').toLowerCase() : 'all'}</button>)}
        <form onSubmit={(e) => { e.preventDefault(); load() }} className="flex items-center gap-2 rounded-full bg-surface px-3 ring-1 ring-line"><Search className="h-4 w-4 text-muted" /><input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Code or title" className="h-9 bg-transparent text-sm outline-none" /></form>
      </div>
      {!rows ? <PageLoader /> : (
        <ul className="space-y-2">
          {rows.map((t) => (
            <li key={t.code}><Link to={`/admin/trips/${t.code}`} className="flex flex-wrap items-center gap-3 rounded-2xl bg-surface px-4 py-3 ring-1 ring-line hover:ring-brand">
              <span className="font-mono text-xs">{t.code}</span><span className="flex-1 font-semibold">{t.title}</span>
              <span className="text-sm text-muted">{t.organiser}{t.organiserVerified ? '' : ' (unverified)'} · {t.startDate}</span>
              {t.reports > 0 && <span className="text-xs font-semibold text-danger">{t.reports} reports{t.hidden ? ' · hidden' : ''}</span>}
              <StatusBadge status={t.status} />
            </Link></li>
          ))}
        </ul>
      )}
    </div>
  )
}

export function AdminTrip() {
  const { code } = useParams()
  const [t, setT] = useState(null)
  const [reason, setReason] = useState('')
  const a = useAction()
  const load = () => get(`/trips/${code}`).then((r) => setT(r.trip))
  useEffect(() => {
    load()
  }, [code])
  if (!t) return <PageLoader />
  const act = (fn) => a.run(async () => { await fn(); load() })
  return (
    <div>
      <PageTitle title={t.title} text={`${t.code} · ${t.startDate} · ${t.stops.map((s) => s.name).join(' → ')}`} action={<StatusBadge status={t.status} />} />
      <div className="grid gap-6 xl:grid-cols-[1.3fr_1fr]">
        <div className="space-y-4 rounded-3xl bg-surface p-5 ring-1 ring-line text-sm">
          <p><b>Organiser:</b> {t.organiser.firstName} {t.organiser.verified ? '(verified)' : '(not verified)'}</p>
          <p><b>Group:</b> {t.members.length}/{t.seats} · {t.genderRule} · {t.flexible ? 'flexible' : 'fixed route'}</p>
          <p><b>Estimate:</b> {rs(t.price)} per person · {t.km} km</p>
          {t.description && <p className="whitespace-pre-wrap rounded-2xl bg-surface-2 p-3">{t.description}</p>}
          {t.deposit && <p><b>Deposit:</b> {rs(t.deposit.amount)} · {t.deposit.status}</p>}
          <Link to={`/trips/${t.code}`} target="_blank" className="inline-flex items-center gap-1 font-semibold text-brand">Open the public page <ExternalLink className="h-4 w-4" /></Link>
          {t.bookings?.length > 0 && <div><p className="font-bold">Bookings</p>{t.bookings.map((b) => <p key={b.id}>{b.code} · {b.vehicle?.name} · {rs(b.amount)} · {b.status}</p>)}</div>}
          {t.history?.length > 0 && <div><p className="font-bold">History</p><ul className="mt-1 space-y-1">{t.history.map((h, i) => <li key={i} className="flex justify-between gap-3"><span>{h.text}</span><span className="text-xs text-muted">{when(h.at)}</span></li>)}</ul></div>}
        </div>
        <div className="space-y-4">
          <div className="rounded-3xl bg-surface p-5 ring-1 ring-line">
            <Field label="Reason" hint="for rejecting, cancelling or hiding"><textarea value={reason} onChange={(e) => setReason(e.target.value)} rows={2} className={`${input} h-auto py-2`} /></Field>
            {a.error && <Notice tone="danger" className="mt-3">{a.error}</Notice>}
            <div className="mt-4 grid gap-2">
              {t.status === 'UNDER_REVIEW' && (
                <>
                  <Notice>Check the ID matches the selfie (in Verifications) and the trip is genuine: no outside contact details, realistic prices, no duplicate.</Notice>
                  <button onClick={() => act(() => post(`/admin/trips/${code}/decide`, { decision: 'APPROVE' }))} className={btn.primary}>Approve and publish</button>
                  <button disabled={!reason} onClick={() => act(() => post(`/admin/trips/${code}/decide`, { decision: 'REJECT', reason }))} className={btn.ghost}>Send back to draft (deposit refunded)</button>
                </>
              )}
              <button onClick={() => act(() => post(`/admin/trips/${code}/visibility`, { hidden: true }))} className={btn.ghost}>Hide from the Trip Board</button>
              <button onClick={() => act(() => post(`/admin/trips/${code}/visibility`, { hidden: false }))} className={btn.ghost}>Show on the Trip Board</button>
              {!['ONGOING', 'COMPLETED', 'CLOSED', 'CANCELLED'].includes(t.status) && <button disabled={reason.length < 5} onClick={() => act(() => post(`/admin/trips/${code}/cancel`, { reason }))} className={`${btn.ghost} text-danger`}>Cancel trip (fraud, safety, weather): 100% refund</button>}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

// ---------- Users ----------
export function AdminUsers() {
  const [rows, setRows] = useState(null)
  const [q, setQ] = useState('')
  const load = () => get('/admin/users', { q: q || undefined }).then((r) => setRows(r.users))
  useEffect(() => {
    load()
  }, [])
  return (
    <div>
      <PageTitle title="Users and partners" text="The admin never sees or sets a password." />
      <form onSubmit={(e) => { e.preventDefault(); load() }} className="mb-4 flex max-w-md items-center gap-2 rounded-2xl bg-surface px-4 ring-1 ring-line"><Search className="h-4 w-4 text-muted" /><input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Name, email or phone" className="h-11 flex-1 bg-transparent text-sm outline-none" /></form>
      {!rows ? <PageLoader /> : (
        <ul className="space-y-2">{rows.map((u) => (
          <li key={u.id}><Link to={`/admin/users/${u.id}`} className="flex flex-wrap items-center gap-3 rounded-2xl bg-surface px-4 py-3 ring-1 ring-line hover:ring-brand">
            <span className="flex-1 font-semibold">{u.name} {u.verified && <CheckCircle2 className="inline h-4 w-4 text-brand" />}</span>
            <span className="text-sm text-muted">{u.email} · {u.phone}</span>
            <span className="text-xs">{u.roles.join(', ')}</span>
            <StatusBadge status={u.status} />
          </Link></li>
        ))}</ul>
      )}
    </div>
  )
}

export function AdminUser() {
  const { id } = useParams()
  const [d, setD] = useState(null)
  const [reason, setReason] = useState('')
  const a = useAction()
  const load = () => get(`/admin/users/${id}`).then(setD)
  useEffect(() => {
    load()
  }, [id])
  if (!d) return <PageLoader />
  const u = d.user
  const act = (action) => a.run(async () => { await post(`/admin/users/${id}/action`, { action, reason: reason || undefined }); load() })
  return (
    <div>
      <PageTitle title={u.name} text={`${u.email} · ${u.phone} · joined ${when(u.createdAt)}`} action={<StatusBadge status={u.status} />} />
      {u.statusReason && <Notice tone="warning" className="mb-4">{u.statusReason}</Notice>}
      <div className="grid gap-6 xl:grid-cols-[1.3fr_1fr]">
        <div className="space-y-4">
          <div className="rounded-3xl bg-surface p-5 text-sm ring-1 ring-line">
            <p><b>Roles:</b> {u.roles.join(', ')} · <b>Verified:</b> {u.verified ? 'yes' : 'no'} · <b>Two-step:</b> {u.twoStep ? 'on' : 'off'} · <b>Sessions:</b> {u.activeSessions}</p>
            <p className="mt-1"><b>Gender:</b> {u.gender} · <b>Born:</b> {u.dateOfBirth} · <b>Last login:</b> {when(u.lastLoginAt)}</p>
            {d.bank && <p className="mt-1"><b>Bank:</b> {d.bank.bank} {d.bank.account} ({d.bank.status})</p>}
          </div>
          <div className="rounded-3xl bg-surface p-5 ring-1 ring-line"><p className="font-bold">Trips</p><ul className="mt-2 space-y-1 text-sm">{d.trips.map((t) => <li key={t.code}><Link to={`/admin/trips/${t.code}`} className="hover:underline">{t.code} · {t.title}</Link> · {t.role} · {t.member_status}{t.removed_reason ? ` · removed: ${t.removed_reason}` : ''}</li>)}</ul></div>
          <div className="rounded-3xl bg-surface p-5 ring-1 ring-line"><p className="font-bold">Verifications</p><ul className="mt-2 space-y-1 text-sm">{d.verifications.map((v) => <li key={v.id}><Link to={`/admin/verifications/${v.id}`} className="hover:underline">{v.type}</Link> · {v.status} · {when(v.created_at)}</li>)}</ul></div>
          {d.strikes.length > 0 && <div className="rounded-3xl bg-surface p-5 ring-1 ring-line"><p className="font-bold text-danger">Strikes ({d.strikes.length})</p><ul className="mt-2 space-y-1 text-sm">{d.strikes.map((s) => <li key={s.id}>{s.reason} · {when(s.created_at)}</li>)}</ul></div>}
        </div>
        <div className="rounded-3xl bg-surface p-5 ring-1 ring-line">
          <Field label="Reason" hint="needed to suspend, ban or lock"><textarea value={reason} onChange={(e) => setReason(e.target.value)} rows={2} className={`${input} h-auto py-2`} /></Field>
          {a.error && <Notice tone="danger" className="mt-3">{a.error}</Notice>}
          <div className="mt-4 grid gap-2">
            {u.status !== 'ACTIVE' && <button onClick={() => act('RESTORE')} className={btn.primary}>Restore account</button>}
            <button onClick={() => act('SEND_RESET')} className={btn.ghost}>Send a password reset link</button>
            <button onClick={() => act('LOGOUT_ALL')} className={btn.ghost}>Log out of all devices</button>
            <button disabled={!reason} onClick={() => act('SUSPEND')} className={btn.ghost}>Suspend</button>
            <button disabled={!reason} onClick={() => act('LOCK')} className={btn.ghost}>Lock</button>
            <button disabled={!reason} onClick={() => act('BAN')} className={`${btn.ghost} text-danger`}>Ban</button>
          </div>
        </div>
      </div>
    </div>
  )
}

// ---------- Reports ----------
export function AdminReports() {
  const [rows, setRows] = useState(null)
  const a = useAction()
  const load = () => get('/admin/reports').then((r) => setRows(r.reports))
  useEffect(() => {
    load()
  }, [])
  if (!rows) return <PageLoader />
  return (
    <div>
      <PageTitle title="Reports" text="Reported messages are the only chat the admin reads. Decide within 48 hours." />
      {rows.length === 0 ? <Notice tone="success">No open reports.</Notice> : (
        <ul className="space-y-3">{rows.map((r) => (
          <li key={r.id} className="rounded-3xl bg-surface p-5 ring-1 ring-line">
            <p className="font-bold">{r.type.toLowerCase()} · {r.reason}</p>
            <p className="text-sm text-muted">by {r.reporter} · {when(r.createdAt)}{r.details ? ` · "${r.details}"` : ''}</p>
            {r.target?.message && <div className="mt-3 rounded-2xl bg-surface-2 p-3 text-sm"><p><b>{r.target.sender}:</b> {r.target.message}</p><details className="mt-1"><summary className="cursor-pointer text-xs font-semibold text-muted">Messages around it</summary>{r.target.context.map((m) => <p key={m.id} className="text-xs"><b>{m.full_name ?? 'System'}:</b> {m.content}</p>)}</details></div>}
            {r.target?.code && <p className="mt-2 text-sm"><Link to={`/admin/trips/${r.target.code}`} className="font-semibold text-brand">{r.target.code} · {r.target.title}</Link>{r.target.hidden ? ' (hidden)' : ''}</p>}
            {r.target?.name && <p className="mt-2 text-sm"><Link to={`/admin/users/${r.target.id}`} className="font-semibold text-brand">{r.target.name}</Link> ({r.target.status})</p>}
            <div className="mt-3 flex gap-2">
              <button onClick={() => a.run(async () => { await post(`/admin/reports/${r.id}/decide`, { decision: 'UPHOLD' }); load() })} className={btn.primary}>Uphold</button>
              <button onClick={() => a.run(async () => { await post(`/admin/reports/${r.id}/decide`, { decision: 'DISMISS' }); load() })} className={btn.ghost}>Dismiss</button>
              {r.target?.senderId && <Link to={`/admin/users/${r.target.senderId}`} className={btn.ghost}>Sender's account</Link>}
            </div>
          </li>
        ))}</ul>
      )}
    </div>
  )
}

// ---------- Audit log and dev outbox ----------
export function AdminAudit() {
  const [rows, setRows] = useState(null)
  useEffect(() => {
    get('/admin/audit-log').then((r) => setRows(r.entries))
  }, [])
  if (!rows) return <PageLoader />
  return (
    <div>
      <PageTitle title="Audit log" text="Every admin action and every view of ID documents. It can't be edited, even in the database." />
      <div className="overflow-x-auto rounded-3xl bg-surface ring-1 ring-line">
        <table className="w-full text-sm">
          <thead className="bg-surface-2 text-left text-xs uppercase tracking-wider text-muted"><tr><th className="px-4 py-3">When</th><th className="px-4 py-3">Who</th><th className="px-4 py-3">Action</th><th className="px-4 py-3">Target</th><th className="px-4 py-3">Amount</th><th className="px-4 py-3">IP</th></tr></thead>
          <tbody>{rows.map((e) => <tr key={e.id} className="border-t border-line"><td className="whitespace-nowrap px-4 py-2">{when(e.at)}</td><td className="px-4 py-2">{e.actor}</td><td className="px-4 py-2 font-mono text-xs">{e.action}</td><td className="px-4 py-2">{e.target}</td><td className="px-4 py-2">{e.amount ? rs(e.amount) : ''}</td><td className="px-4 py-2 text-xs text-muted">{e.ip}</td></tr>)}</tbody>
        </table>
      </div>
    </div>
  )
}

// Local demo only: jump forward in time to show the trip day, completion and payouts
function DemoClock() {
  const [c, setC] = useState(null)
  const a = useAction()
  useEffect(() => {
    get('/admin/dev/clock').then(setC).catch(() => null)
  }, [])
  if (!c) return null
  const move = (days) => a.run(async () => setC(await post('/admin/dev/clock', { days })))
  return (
    <div className="mb-6 rounded-3xl bg-accent-soft p-5 ring-1 ring-accent/30">
      <p className="font-bold">Demo clock</p>
      <p className="text-sm">The server thinks it is <b>{when(c.now)}</b>{c.offsetDays ? ` (${c.offsetDays} days ahead)` : ''}. Moving it forward runs the daily jobs: trips start at midnight, end, and payouts become ready. Only in local mode; restart the server to go back.</p>
      <div className="mt-3 flex flex-wrap gap-2">
        {[1, 7, 14].map((d) => <button key={d} disabled={a.busy} onClick={() => move(d)} className={`${btn.ghost} !py-2 text-sm`}>+{d} {d === 1 ? 'day' : 'days'}</button>)}
        {c.offsetDays > 0 && <button disabled={a.busy} onClick={() => move(0)} className={`${btn.ghost} !py-2 text-sm`}>Back to today</button>}
      </div>
      {a.error && <p className="mt-2 text-sm text-danger">{a.error}</p>}
    </div>
  )
}

export function AdminOutbox() {
  const [rows, setRows] = useState(null)
  const load = () => get('/admin/dev-outbox').then((r) => setRows(r.messages))
  useEffect(() => {
    load()
  }, [])
  if (!rows) return <PageLoader />
  return (
    <div>
      <PageTitle title="Dev outbox" text="Local mode only: the emails and SMS (with codes) that would be sent. Connect SMTP and an SMS gateway for real messages." action={<button onClick={load} className={btn.ghost}>Refresh</button>} />
      <DemoClock />
      <ul className="space-y-2">{rows.map((m) => <li key={m.id} className="rounded-2xl bg-surface p-4 ring-1 ring-line"><p className="text-xs text-muted">{m.channel} → {m.to} · {when(m.created_at)}</p>{m.subject && <p className="font-semibold">{m.subject}</p>}<p className="whitespace-pre-wrap text-sm">{m.body}</p></li>)}</ul>
    </div>
  )
}
