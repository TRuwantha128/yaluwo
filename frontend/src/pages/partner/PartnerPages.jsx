import { useEffect, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { ArrowRight, Check, CheckCircle2, Circle, Loader2, Plus, Route, X } from 'lucide-react'
import { get, post, put, upload } from '../../api/client'
import { useAuth, useLive } from '../../auth/AuthProvider'
import { useConfig } from '../../config/useConfig'
import { Countdown, FilePick, Field, Notice, PageLoader, StatusBadge, input, useAction } from '../../components/form'
import { btn } from '../../components/ui'
import { rs } from '../../lib/format'
import { PLACES } from '../../lib/places'
import PartnerShell from './PartnerShell'

// ---------- Dashboard: the next action first ----------
export function PartnerDashboard() {
  const { user } = useAuth()
  const [params] = useSearchParams()
  const [d, setD] = useState(null)
  const load = () => get('/partner/dashboard').then(setD)
  useEffect(() => {
    load()
  }, [])
  useLive((type) => type === 'notification' && load())
  if (!d) return <PageLoader />
  return (
    <PartnerShell title={`Hello ${user.firstName}`} text="Your requests, trips and earnings.">
      {params.get('welcome') && <Notice tone="success" className="mb-6">Welcome! Finish the steps below and you'll start getting trip requests.</Notice>}
      {d.next && (
        <Link to={d.next.link} className={`group mb-6 flex items-center gap-4 rounded-3xl p-5 ring-1 transition ${d.next.urgent ? 'bg-accent text-on-accent ring-accent' : 'bg-brand-soft ring-brand/20 hover:ring-brand'}`}>
          <div className="min-w-0 flex-1">
            <p className="text-xs font-bold uppercase tracking-wider opacity-80">Next step</p>
            <p className="mt-1 text-lg font-bold">{d.next.text}</p>
            {d.next.dueAt && <Countdown to={d.next.dueAt} className={d.next.urgent ? '!text-on-accent' : ''} />}
          </div>
          <ArrowRight className="h-5 w-5 transition group-hover:translate-x-1" />
        </Link>
      )}
      {d.steps.length > 0 && (
        <section className="mb-8 rounded-3xl bg-surface p-6 ring-1 ring-line">
          <h2 className="text-lg font-extrabold">Get ready to drive with Yaluwo</h2>
          <ul className="mt-4 space-y-2">
            {d.steps.map((s) => (
              <li key={s.text}><Link to={s.link} className="flex items-center gap-3 rounded-2xl px-3 py-2 hover:bg-surface-2"><Circle className="h-5 w-5 text-muted" /> <span className="flex-1 font-semibold">{s.text}</span><ArrowRight className="h-4 w-4 text-muted" /></Link></li>
            ))}
          </ul>
        </section>
      )}
      <div className="grid gap-4 sm:grid-cols-4">
        {[['Held', ['HELD', 'WAITING_SETTLEMENT', 'FROZEN']], ['Ready', ['READY']], ['Sent to bank', ['APPROVED', 'SENT']], ['Paid', ['PAID']]].map(([label, keys]) => (
          <div key={label} className="rounded-3xl bg-surface p-5 ring-1 ring-line">
            <p className="text-sm text-muted">{label}</p>
            <p className="mt-1 text-2xl font-extrabold">{rs(keys.reduce((s, k) => s + (d.earnings[k] ?? 0), 0))}</p>
          </div>
        ))}
      </div>
      <section className="mt-8 grid gap-6 lg:grid-cols-2">
        <div className="rounded-3xl bg-surface p-6 ring-1 ring-line">
          <h2 className="text-lg font-extrabold">New requests</h2>
          {d.requests.length === 0 ? <p className="mt-3 text-sm text-muted">No requests waiting. Find trips near you and send offers.</p> : (
            <ul className="mt-3 space-y-2">{d.requests.map((r) => <li key={r.id}><Link to="/partner/requests" className="flex items-center justify-between rounded-2xl bg-surface-2 px-4 py-3 text-sm"><span><b>{r.trip}</b><span className="block text-muted">{r.startDate} · {rs(r.amount)}</span></span><Countdown to={r.expiresAt} /></Link></li>)}</ul>
          )}
          <Link to="/partner/offers" className="mt-4 inline-flex items-center gap-1.5 text-sm font-semibold text-brand hover:underline">Find trips near you <ArrowRight className="h-4 w-4" /></Link>
        </div>
        <div className="rounded-3xl bg-surface p-6 ring-1 ring-line">
          <h2 className="text-lg font-extrabold">Upcoming trips</h2>
          {d.upcoming.length === 0 ? <p className="mt-3 text-sm text-muted">Nothing booked yet.</p> : (
            <ul className="mt-3 space-y-2">{d.upcoming.map((r) => <li key={r.id} className="flex items-center justify-between rounded-2xl bg-surface-2 px-4 py-3 text-sm"><span><b>{r.trip}</b><span className="block text-muted">{r.startDate} → {r.endDate} · you get {rs(r.net)}</span></span><StatusBadge status={r.tripStatus} /></li>)}</ul>
          )}
        </div>
      </section>
    </PartnerShell>
  )
}

// ---------- Requests ----------
function RequestCard({ b, reload }) {
  const a = useAction()
  const [reason, setReason] = useState('')
  const [cancel, setCancel] = useState(false)
  const [reply, setReply] = useState('')
  return (
    <li className="rounded-3xl bg-surface p-5 ring-1 ring-line">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2"><StatusBadge status={b.status} /><span className="font-mono text-xs text-muted">{b.code}</span></div>
          <p className="mt-2 text-lg font-bold">{b.trip.title}</p>
          <p className="text-sm text-muted">{b.trip.startDate} → {b.trip.endDate} · {b.group} people · {b.trip.km} km · {b.vehicle}</p>
          <p className="mt-1 flex flex-wrap items-center gap-1 text-sm"><Route className="h-4 w-4 text-brand" /> {b.trip.route.map((s) => `${s.name}${s.nights ? ` (${s.nights}n)` : ''}`).join(' → ')}</p>
        </div>
        <div className="text-right">
          <p className="text-2xl font-extrabold">{rs(b.amount)}</p>
          <p className="text-xs text-muted">you receive {rs(b.net)} after {rs(b.commission)} commission</p>
          {b.status === 'REQUESTED' && <Countdown to={b.expiresAt} className="text-sm" />}
        </div>
      </div>
      {b.organiser && <Notice className="mt-4">Organiser: <b>{b.organiser.name}</b> · {b.organiser.phone}. Guests: {b.guests.join(', ')}</Notice>}
      {b.breakdown?.lines && (
        <details className="mt-3 text-sm text-muted"><summary className="cursor-pointer font-semibold">Price breakdown</summary>
          <ul className="mt-1 space-y-0.5">{b.breakdown.lines.map((l) => <li key={l.label} className="flex justify-between"><span>{l.label}</span><span>{rs(l.amount)}</span></li>)}</ul>
        </details>
      )}
      {b.dispute && b.dispute.status === 'OPEN' && (
        <div className="mt-4 rounded-2xl bg-accent-soft p-4">
          <p className="font-semibold">Dispute {b.dispute.code}: "{b.dispute.reason}"</p>
          <p className="text-sm">Reply within <Countdown to={b.dispute.dueAt} />. Your payout for this booking is frozen until Yaluwo decides.</p>
          <textarea value={reply} onChange={(e) => setReply(e.target.value)} rows={2} className={`${input} mt-2 h-auto py-2`} placeholder="Your side" />
          <button disabled={reply.length < 5} onClick={() => a.run(async () => { await upload(`/partner/disputes/${b.dispute.id}/respond`, { response: reply }); reload() })} className={`${btn.primary} mt-2 !py-2 text-sm`}>Send reply</button>
        </div>
      )}
      <div className="mt-4 flex flex-wrap gap-2">
        {b.status === 'REQUESTED' && (
          <>
            <button disabled={a.busy} onClick={() => a.run(async () => { await post(`/partner/bookings/${b.id}/accept`); reload() })} className={btn.primary}><Check className="h-4 w-4" /> Accept</button>
            <button disabled={a.busy} onClick={() => a.run(async () => { await post(`/partner/bookings/${b.id}/decline`, {}); reload() })} className={btn.ghost}><X className="h-4 w-4" /> Decline</button>
          </>
        )}
        {b.status === 'ACCEPTED' && !['ONGOING', 'COMPLETED', 'CLOSED'].includes(b.trip.status) && !cancel && <button onClick={() => setCancel(true)} className={`${btn.ghost} text-danger`}>Cancel booking</button>}
        {['ONGOING', 'CONFIRMED'].includes(b.trip.status) && <Link to={`/trips/${b.trip.code}`} className={btn.ghost}>Trip page (check-in, SOS)</Link>}
        {b.trip.status === 'COMPLETED' && <Link to={`/trips/${b.trip.code}#review`} className={btn.ghost}>Rate the group</Link>}
      </div>
      {cancel && (
        <div className="mt-3 space-y-2 rounded-2xl bg-surface-2 p-4">
          <p className="text-sm">{['PAYMENT_DUE', 'CONFIRMED'].includes(b.trip.status) ? 'The group gets 100% of this booking back and this counts as a strike. 3 strikes in 6 months means a review of your account.' : 'The organiser will choose another driver.'}</p>
          <input value={reason} onChange={(e) => setReason(e.target.value)} className={input} placeholder="Reason" />
          <button disabled={reason.length < 5} onClick={() => a.run(async () => { await post(`/partner/bookings/${b.id}/cancel`, { reason }); reload() })} className={btn.accent}>Cancel booking</button>
        </div>
      )}
      {a.error && <Notice tone="danger" className="mt-3">{a.error}</Notice>}
    </li>
  )
}

export function PartnerRequests() {
  const [rows, setRows] = useState(null)
  const load = () => get('/partner/requests').then((r) => setRows(r.bookings))
  useEffect(() => {
    load()
  }, [])
  useLive((type) => type === 'notification' && load())
  if (!rows) return <PageLoader />
  return (
    <PartnerShell title="Requests and bookings" text="Accept or decline within 24 hours. Names and phone numbers appear once the group has paid.">
      {rows.length === 0 ? <Notice>No requests yet. <Link to="/partner/offers" className="font-semibold underline">Find trips near you</Link> and send an offer.</Notice> : <ul className="space-y-4">{rows.map((b) => <RequestCard key={b.id} b={b} reload={load} />)}</ul>}
    </PartnerShell>
  )
}

// ---------- Offers ----------
function OfferRow({ trip, option, reload }) {
  const [price, setPrice] = useState(String(Math.round(option.suggested)))
  const [note, setNote] = useState('')
  const a = useAction()
  if (option.offered) return <p className="flex items-center gap-2 text-sm"><CheckCircle2 className="h-4 w-4 text-success" /> Offer sent with {option.vehicle}: <b>{rs(option.offered.price)}</b> · <Countdown to={option.offered.validUntil} /></p>
  return (
    <div className="rounded-2xl bg-surface-2 p-4">
      <p className="text-sm font-semibold">{option.vehicle}: suggested {rs(option.suggested)} <span className="font-normal text-muted">(you can ask {rs(option.band.min)} to {rs(option.band.max)})</span></p>
      <div className="mt-2 flex flex-wrap gap-2">
        <input value={price} onChange={(e) => setPrice(e.target.value)} inputMode="numeric" className={`${input} w-36`} aria-label="Your price" />
        <input value={note} onChange={(e) => setNote(e.target.value)} className={`${input} min-w-40 flex-1`} placeholder="A short note (optional)" />
        <button disabled={a.busy} onClick={() => a.run(async () => { await post('/partner/offers', { tripCode: trip.code, vehicleId: option.vehicleId, price: Number(price), note }); reload() })} className={btn.primary}>Send offer</button>
      </div>
      {a.error && <p className="mt-2 text-sm text-danger">{a.error}</p>}
    </div>
  )
}

export function PartnerOffers() {
  const [rows, setRows] = useState(null)
  const load = () => get('/partner/trips-nearby').then((r) => setRows(r.trips))
  useEffect(() => {
    load()
  }, [])
  if (!rows) return <PageLoader />
  return (
    <PartnerShell title="Find trips near you" text="Open and booking trips that start near your base and fit your vehicle. Offers are valid for 48 hours.">
      {rows.length === 0 ? <Notice>No trips near your base right now, or your vehicle isn't approved yet.</Notice> : (
        <ul className="space-y-4">
          {rows.map((t) => (
            <li key={t.code} className="rounded-3xl bg-surface p-5 ring-1 ring-line">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div>
                  <StatusBadge status={t.status} />
                  <p className="mt-2 text-lg font-bold">{t.title}</p>
                  <p className="text-sm text-muted">{t.startDate} → {t.endDate} · {t.group}/{t.seats} people · {t.km} km{t.flexible ? ' · flexible route' : ''}</p>
                  <p className="mt-1 text-sm">{t.route.join(' → ')}</p>
                </div>
              </div>
              <div className="mt-4 space-y-2">{t.options.map((o) => <OfferRow key={o.vehicleId} trip={t} option={o} reload={load} />)}</div>
            </li>
          ))}
        </ul>
      )}
    </PartnerShell>
  )
}

// ---------- Vehicles ----------
const ANGLES = [['FRONT', 'Front'], ['BACK', 'Back'], ['LEFT', 'Left side'], ['RIGHT', 'Right side'], ['FRONT_SEATS', 'Front seats'], ['BACK_SEATS', 'Back seats'], ['LUGGAGE', 'Luggage space']]

function VehicleForm({ types, onSaved, onCancel }) {
  const [f, setF] = useState({ typeId: types[0]?.id ?? '', make: '', model: '', year: 2018, plate: '', seats: 4, ac: true, fuel: 'DIESEL', gearbox: 'MANUAL', base: 'colombo', modes: ['WITH_DRIVER'] })
  const a = useAction()
  const base = PLACES.find((p) => p.id === f.base)
  const set = (k) => (e) => setF({ ...f, [k]: e.target.type === 'checkbox' ? e.target.checked : e.target.value })
  return (
    <form onSubmit={(e) => { e.preventDefault(); a.run(async () => onSaved((await post('/partner/vehicles', { ...f, typeId: Number(f.typeId), year: Number(f.year), seats: Number(f.seats), baseName: base.name, baseLat: base.lat, baseLng: base.lng, districts: [base.district] })).vehicle)) }} className="grid gap-4 rounded-3xl bg-surface p-6 ring-1 ring-line sm:grid-cols-2">
      <Field label="Vehicle type"><select value={f.typeId} onChange={set('typeId')} className={input}>{types.map((t) => <option key={t.id} value={t.id}>{t.name_en} (up to {t.max_passengers})</option>)}</select></Field>
      <Field label="Passenger seats" hint="not counting the driver" error={a.fields.seats}><input type="number" min={1} value={f.seats} onChange={set('seats')} className={input} /></Field>
      <Field label="Make"><input value={f.make} onChange={set('make')} className={input} placeholder="Toyota" /></Field>
      <Field label="Model"><input value={f.model} onChange={set('model')} className={input} placeholder="KDH Hiace" /></Field>
      <Field label="Year"><input type="number" value={f.year} onChange={set('year')} className={input} /></Field>
      <Field label="Number plate" error={a.fields.plate}><input value={f.plate} onChange={set('plate')} className={input} placeholder="PH-4521" /></Field>
      <Field label="Fuel"><select value={f.fuel} onChange={set('fuel')} className={input}>{['PETROL', 'DIESEL', 'HYBRID', 'ELECTRIC'].map((x) => <option key={x}>{x}</option>)}</select></Field>
      <Field label="Gearbox"><select value={f.gearbox} onChange={set('gearbox')} className={input}><option value="MANUAL">Manual</option><option value="AUTO">Automatic</option></select></Field>
      <Field label="Base town" hint="trips starting within 30 km are shown to you"><select value={f.base} onChange={set('base')} className={input}>{PLACES.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</select></Field>
      <label className="flex items-center justify-between gap-3 rounded-2xl bg-surface-2 px-4"><span className="text-sm font-semibold">Air conditioning</span><input type="checkbox" checked={f.ac} onChange={set('ac')} className="h-5 w-5 accent-[var(--brand-ui)]" /></label>
      {a.error && <Notice tone="danger" className="sm:col-span-2">{a.error}</Notice>}
      <div className="flex gap-2 sm:col-span-2"><button type="button" onClick={onCancel} className={btn.ghost}>Cancel</button><button disabled={a.busy || !f.make || !f.model || !f.plate} className={btn.primary}>Save and add photos</button></div>
    </form>
  )
}

function VehicleCard({ v, reload, minPhotos }) {
  const [angle, setAngle] = useState('FRONT')
  const [docs, setDocs] = useState({ revenueLicence: null, insurance: null, emission: null, licenceExpires: '', insuranceExpires: '', insuranceCoversPassengers: false })
  const a = useAction()
  const missing = ANGLES.slice(0, 6).filter(([k]) => !v.photos.some((p) => p.angle === k))
  return (
    <li className="rounded-3xl bg-surface p-6 ring-1 ring-line">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-lg font-bold">{v.make} {v.model} <span className="font-normal text-muted">{v.year} · {v.plate}</span></p>
          <p className="text-sm text-muted">{v.type} · {v.seats} seats{v.ac ? ' · A/C' : ''} · base {v.base.name}</p>
        </div>
        <StatusBadge status={v.status} />
      </div>
      {v.rejectReason && <Notice tone="warning" className="mt-3">{v.rejectReason}</Notice>}
      <div className="mt-4 grid grid-cols-3 gap-2 sm:grid-cols-6">
        {v.photos.map((p) => <figure key={p.id} className="relative"><img src={p.url} alt={p.angle} className="aspect-[4/3] w-full rounded-xl object-cover" /><figcaption className="mt-0.5 text-[10px] text-muted">{p.angle.replace('_', ' ').toLowerCase()}</figcaption></figure>)}
      </div>
      {['DRAFT', 'REJECTED', 'PENDING', 'APPROVED'].includes(v.status) && (
        <div className="mt-4 flex flex-wrap items-center gap-2">
          <select value={angle} onChange={(e) => setAngle(e.target.value)} className={`${input} w-44`}>{ANGLES.map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select>
          <label className={`${btn.ghost} cursor-pointer`}><Plus className="h-4 w-4" /> Add photo<input type="file" accept="image/*" className="sr-only" onChange={(e) => e.target.files?.[0] && a.run(async () => { await upload(`/partner/vehicles/${v.id}/photos`, { photos: [e.target.files[0]], angles: [angle] }); reload() })} /></label>
          {missing.length > 0 && <span className="text-xs text-muted">Still needed: {missing.map(([, l]) => l).join(', ')}</span>}
        </div>
      )}
      {['DRAFT', 'REJECTED'].includes(v.status) && (
        <div className="mt-6 grid gap-4 border-t border-line pt-5 sm:grid-cols-2">
          <p className="text-sm font-bold sm:col-span-2">Documents (checked by Yaluwo)</p>
          <FilePick label="Revenue licence" value={docs.revenueLicence} onChange={(x) => setDocs({ ...docs, revenueLicence: x })} />
          <Field label="Revenue licence expires"><input type="date" value={docs.licenceExpires} onChange={(e) => setDocs({ ...docs, licenceExpires: e.target.value })} className={input} /></Field>
          <FilePick label="Insurance certificate" value={docs.insurance} onChange={(x) => setDocs({ ...docs, insurance: x })} />
          <Field label="Insurance expires"><input type="date" value={docs.insuranceExpires} onChange={(e) => setDocs({ ...docs, insuranceExpires: e.target.value })} className={input} /></Field>
          <FilePick label="Emission certificate" hint="optional" value={docs.emission} onChange={(x) => setDocs({ ...docs, emission: x })} />
          <label className="flex items-center gap-3 rounded-2xl bg-surface-2 px-4 text-sm"><input type="checkbox" checked={docs.insuranceCoversPassengers} onChange={(e) => setDocs({ ...docs, insuranceCoversPassengers: e.target.checked })} className="h-5 w-5 accent-[var(--brand-ui)]" /> The insurance covers paying passengers (hire use)</label>
          {a.error && <Notice tone="danger" className="sm:col-span-2">{a.error}</Notice>}
          <button disabled={a.busy || v.photos.length < minPhotos} onClick={() => a.run(async () => { await upload(`/partner/vehicles/${v.id}/submit`, { ...docs, insuranceCoversPassengers: String(docs.insuranceCoversPassengers) }); reload() })} className={`${btn.accent} sm:col-span-2`}>
            {v.photos.length < minPhotos ? `Add at least ${minPhotos} photos first` : 'Send for review'}
          </button>
        </div>
      )}
      {v.status === 'PENDING' && <Notice className="mt-4">Yaluwo is checking this vehicle (within 24 hours).</Notice>}
    </li>
  )
}

export function PartnerVehicles() {
  const [d, setD] = useState(null)
  const [adding, setAdding] = useState(false)
  const load = () => get('/partner/vehicles').then(setD)
  useEffect(() => {
    load()
  }, [])
  if (!d) return <PageLoader />
  return (
    <PartnerShell title="Your vehicles" text="Each vehicle is checked on its own: at least 6 photos, revenue licence and insurance covering paying passengers." action={!adding && <button onClick={() => setAdding(true)} className={btn.primary}><Plus className="h-4 w-4" /> Add a vehicle</button>}>
      {adding && <div className="mb-6"><VehicleForm types={d.types} onCancel={() => setAdding(false)} onSaved={() => { setAdding(false); load() }} /></div>}
      {d.vehicles.length === 0 && !adding ? <Notice>No vehicles yet.</Notice> : <ul className="space-y-4">{d.vehicles.map((v) => <VehicleCard key={v.id} v={v} reload={load} minPhotos={d.minPhotos} />)}</ul>}
    </PartnerShell>
  )
}

// ---------- Calendar ----------
export function PartnerCalendar() {
  const [vehicles, setVehicles] = useState(null)
  const [days, setDays] = useState([])
  const [vehicleId, setVehicleId] = useState(null)
  const a = useAction()
  const load = () => Promise.all([get('/partner/vehicles'), get('/partner/availability')]).then(([v, av]) => { setVehicles(v.vehicles); setDays(av.days); setVehicleId((x) => x ?? v.vehicles[0]?.id ?? null) })
  useEffect(() => {
    load()
  }, [])
  if (!vehicles) return <PageLoader />
  const dates = Array.from({ length: 60 }, (_, i) => new Date(Date.now() + i * 86400000).toISOString().slice(0, 10))
  const statusOf = (date) => days.find((d) => d.vehicleId === vehicleId && d.date === date)?.status
  const toggle = (date) => {
    const s = statusOf(date)
    if (s === 'BOOKED') return
    a.run(async () => { await put('/partner/availability', { vehicleId, dates: [date], blocked: !s }); load() })
  }
  return (
    <PartnerShell title="Calendar" text="Tap a day to block it. Booked days are added automatically when a trip is confirmed.">
      {vehicles.length === 0 ? <Notice>Add a vehicle first.</Notice> : (
        <>
          <div className="mb-4 flex flex-wrap gap-2">{vehicles.map((v) => <button key={v.id} onClick={() => setVehicleId(v.id)} className={`rounded-full px-4 py-2 text-sm font-semibold ${vehicleId === v.id ? 'bg-ink text-bg' : 'bg-surface ring-1 ring-line'}`}>{v.make} {v.model}</button>)}</div>
          <div className="grid grid-cols-4 gap-2 sm:grid-cols-7 lg:grid-cols-10">
            {dates.map((d) => {
              const s = statusOf(d)
              return (
                <button key={d} onClick={() => toggle(d)} className={`rounded-2xl p-2 text-left text-xs ring-1 transition ${s === 'BOOKED' ? 'bg-brand text-on-brand ring-brand' : s === 'BLOCKED' ? 'bg-surface-2 text-muted line-through ring-line' : 'bg-surface ring-line hover:ring-brand'}`}>
                  <span className="block font-bold">{new Date(d).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}</span>
                  <span>{s === 'BOOKED' ? 'Booked' : s === 'BLOCKED' ? 'Blocked' : new Date(d).toLocaleDateString('en-GB', { weekday: 'short' })}</span>
                </button>
              )
            })}
          </div>
          {a.busy && <Loader2 className="mt-3 h-4 w-4 animate-spin text-brand" />}
        </>
      )}
    </PartnerShell>
  )
}

// ---------- Earnings and bank account ----------
function BankForm({ onDone }) {
  const { user } = useAuth()
  const config = useConfig()
  const [f, setF] = useState({ bank: '', branch: '', accountNumber: '', holderName: user.fullName, proof: null })
  const a = useAction()
  if (!user.twoStep) return <Notice tone="warning">Turn on two-step login before adding a bank account. <Link to="/settings/security" className="font-semibold underline">Settings → Security</Link></Notice>
  return (
    <form onSubmit={(e) => { e.preventDefault(); a.run(async () => { await upload('/partner/bank-accounts', f); onDone() }) }} className="grid gap-4 sm:grid-cols-2">
      <Field label="Bank"><select value={f.bank} onChange={(e) => setF({ ...f, bank: e.target.value })} className={input}><option value="">Choose</option>{(config?.lists?.BANK ?? []).map((b) => <option key={b.code}>{b.label_en}</option>)}</select></Field>
      <Field label="Branch"><input value={f.branch} onChange={(e) => setF({ ...f, branch: e.target.value })} className={input} /></Field>
      <Field label="Account number" error={a.fields.accountNumber}><input value={f.accountNumber} onChange={(e) => setF({ ...f, accountNumber: e.target.value.replace(/\D/g, '') })} inputMode="numeric" className={input} /></Field>
      <Field label="Account holder" hint="must match your verified ID name"><input value={f.holderName} onChange={(e) => setF({ ...f, holderName: e.target.value })} className={input} /></Field>
      <div className="sm:col-span-2"><FilePick label="Passbook page or a recent statement" value={f.proof} onChange={(proof) => setF({ ...f, proof })} /></div>
      {a.error && <Notice tone="danger" className="sm:col-span-2">{a.error}</Notice>}
      <button disabled={a.busy || !f.bank || !f.proof || f.accountNumber.length < 6} className={`${btn.primary} sm:col-span-2`}>Save bank account</button>
      <p className="text-xs text-muted sm:col-span-2">You'll confirm with your password and authenticator code. Changing an account pauses payouts for 48 hours and sends you an email alert.</p>
    </form>
  )
}

export function PartnerEarnings() {
  const [accounts, setAccounts] = useState(null)
  const [payouts, setPayouts] = useState([])
  const [adding, setAdding] = useState(false)
  const load = () => Promise.all([get('/partner/bank-accounts'), get('/partner/payouts')]).then(([a, p]) => { setAccounts(a.accounts); setPayouts(p.payouts) })
  useEffect(() => {
    load()
  }, [])
  if (!accounts) return <PageLoader />
  const account = accounts[0]
  return (
    <PartnerShell title="Earnings" text="Each booking moves Held → Ready → Sent to bank → Paid. Payouts become Ready 24 hours after the trip, once the group's money has reached Yaluwo's bank.">
      <section className="rounded-3xl bg-surface p-6 ring-1 ring-line">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-lg font-extrabold">Payout bank account</h2>
          {account && !adding && <button onClick={() => setAdding(true)} className="text-sm font-semibold text-brand hover:underline">Change</button>}
        </div>
        {account && !adding ? (
          <div className="mt-3 flex flex-wrap items-center gap-3">
            <p className="font-semibold">{account.bank}, {account.branch} · {account.account} · {account.holder}</p>
            <StatusBadge status={account.status} />
            {account.reason && <p className="text-sm text-danger">{account.reason}</p>}
            {account.payoutsHoldUntil && new Date(account.payoutsHoldUntil) > new Date() && <p className="text-sm text-accent">Payouts paused until {new Date(account.payoutsHoldUntil).toLocaleString('en-GB')}</p>}
          </div>
        ) : (
          <div className="mt-4"><BankForm onDone={() => { setAdding(false); load() }} /></div>
        )}
      </section>
      <section className="mt-6 overflow-hidden rounded-3xl bg-surface ring-1 ring-line">
        <table className="w-full text-sm">
          <thead className="bg-surface-2 text-left text-xs uppercase tracking-wider text-muted"><tr><th className="px-4 py-3">Trip</th><th className="px-4 py-3">Type</th><th className="hidden px-4 py-3 sm:table-cell">Booking</th><th className="px-4 py-3">You get</th><th className="px-4 py-3">Status</th></tr></thead>
          <tbody>
            {payouts.length === 0 && <tr><td colSpan={5} className="px-4 py-8 text-center text-muted">No payouts yet</td></tr>}
            {payouts.map((p) => (
              <tr key={p.id} className="border-t border-line">
                <td className="px-4 py-3 font-semibold">{p.trip}<span className="block font-mono text-xs font-normal text-muted">{p.tripCode}</span></td>
                <td className="px-4 py-3">{p.kind === 'FUEL_ADVANCE' ? 'Fuel advance' : 'Booking'}</td>
                <td className="hidden px-4 py-3 sm:table-cell">{rs(p.gross)} − {rs(p.commission)}</td>
                <td className="px-4 py-3 font-bold">{rs(p.amount)}</td>
                <td className="px-4 py-3"><StatusBadge status={p.status} />{p.bankRef && <span className="block text-xs text-muted">{p.bankRef}</span>}{p.failure && <span className="block text-xs text-danger">{p.failure}</span>}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </PartnerShell>
  )
}
