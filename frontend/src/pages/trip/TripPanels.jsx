import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { BadgeCheck, Car, Check, Loader2, MapPin, MessageCircle, Phone, ShieldAlert, Siren, Star, Users, X } from 'lucide-react'
import { get, post, upload } from '../../api/client'
import { useConfig, settingOf } from '../../config/useConfig'
import { Countdown, Field, Notice, StatusBadge, input, useAction } from '../../components/form'
import { Avatar, btn } from '../../components/ui'
import { rs } from '../../lib/format'

const Section = ({ id, title, text, children, action }) => (
  <section id={id} className="scroll-mt-28 rounded-3xl bg-surface p-6 ring-1 ring-line">
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div>
        <h2 className="text-xl font-extrabold tracking-tight">{title}</h2>
        {text && <p className="mt-1 text-sm text-muted">{text}</p>}
      </div>
      {action}
    </div>
    <div className="mt-5">{children}</div>
  </section>
)
export { Section }

export function PersonChip({ p, sub }) {
  return (
    <span className="flex items-center gap-3">
      {p.photo ? <img src={p.photo} alt="" className="h-10 w-10 rounded-full object-cover" /> : <Avatar name={p.firstName ?? p.name} size="h-10 w-10 text-sm" ring={false} />}
      <span className="min-w-0">
        <span className="flex items-center gap-1 font-semibold">{p.firstName ?? p.name}{p.verified && <BadgeCheck className="h-4 w-4 text-brand" aria-label="Verified" />}</span>
        <span className="block text-xs text-muted">{sub ?? (p.rating ? <><Star className="inline h-3 w-3 fill-accent text-accent" /> {Number(p.rating).toFixed(1)} · {p.reviews} reviews</> : `${p.tripsCompleted ?? 0} trips`)}{p.badges?.length ? ` · ${p.badges.join(', ')}` : ''}</span>
      </span>
    </span>
  )
}

// ---------- Join requests (organiser) ----------
export function RequestsPanel({ trip, reload }) {
  const a = useAction()
  if (!trip.requests?.length) return null
  return (
    <Section id="requests" title={`Join requests (${trip.requests.length})`} text="Chat privately before you decide. Unanswered requests expire automatically.">
      <ul className="space-y-3">
        {trip.requests.map((r) => (
          <li key={r.memberId} className="rounded-2xl bg-surface-2 p-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <PersonChip p={r.person} />
              <div className="flex items-center gap-2 text-xs">
                {r.match != null && <span className="rounded-full bg-brand-soft px-2.5 py-1 font-semibold text-brand">{r.match}% match</span>}
                <Countdown to={r.expiresAt} />
              </div>
            </div>
            <p className="mt-3 text-sm">"{r.message}"</p>
            {!r.person.verified && <p className="mt-2 flex items-center gap-1.5 text-xs font-semibold text-accent"><ShieldAlert className="h-3.5 w-3.5" /> Still being verified: you can accept once their ID is approved.</p>}
            <div className="mt-3 flex flex-wrap gap-2">
              <button disabled={a.busy || !r.person.verified} onClick={() => a.run(async () => { await post(`/trips/${trip.code}/members/${r.memberId}/approve`); reload() })} className={`${btn.primary} !py-2 text-sm`}><Check className="h-4 w-4" /> Accept</button>
              <button disabled={a.busy} onClick={() => a.run(async () => { await post(`/trips/${trip.code}/members/${r.memberId}/reject`); reload() })} className={`${btn.ghost} !py-2 text-sm`}><X className="h-4 w-4" /> Decline</button>
              {r.threadId && <Link to={`/messages/${r.threadId}`} className={`${btn.ghost} !py-2 text-sm`}><MessageCircle className="h-4 w-4" /> Chat</Link>}
            </div>
          </li>
        ))}
      </ul>
      {a.error && <Notice tone="danger" className="mt-3">{a.error}</Notice>}
    </Section>
  )
}

// ---------- Members ----------
export function MembersPanel({ trip, reload }) {
  const organiser = trip.viewer.role === 'ORGANISER'
  const [removing, setRemoving] = useState(null)
  const [reason, setReason] = useState('')
  const a = useAction()
  const canRemove = organiser && ['OPEN', 'FULL', 'BOOKING'].includes(trip.status)
  return (
    <Section title={`Who's going (${trip.members.length}/${trip.seats})`} text={trip.seatsLeft > 0 && ['OPEN'].includes(trip.status) ? `${trip.seatsLeft} seats left` : undefined}>
      <ul className="grid gap-3 sm:grid-cols-2">
        {trip.members.map((m) => (
          <li key={m.id} className="flex items-center justify-between gap-2 rounded-2xl bg-surface-2 p-3">
            <PersonChip p={m} sub={m.role === 'ORGANISER' ? 'Organiser' : undefined} />
            {canRemove && m.role !== 'ORGANISER' && <button onClick={() => setRemoving(m)} className="text-xs font-semibold text-muted hover:text-danger">Remove</button>}
          </li>
        ))}
      </ul>
      {removing && (
        <div className="mt-4 space-y-3 rounded-2xl bg-surface-2 p-4">
          <p className="text-sm font-semibold">Remove {removing.firstName}? The reason is only seen by Yaluwo.</p>
          <input value={reason} onChange={(e) => setReason(e.target.value)} className={input} placeholder="Why?" />
          {a.error && <Notice tone="danger">{a.error}</Notice>}
          <div className="flex gap-2">
            <button onClick={() => setRemoving(null)} className={btn.ghost}>Keep</button>
            <button disabled={reason.length < 5} onClick={() => a.run(async () => {
              await post(`/trips/${trip.code}/members/${removing.memberId}/remove`, { reason })
              setRemoving(null)
              reload()
            })} className={btn.accent}>Remove</button>
          </div>
        </div>
      )}
    </Section>
  )
}

// ---------- Booking transport (organiser, in Booking) ----------
export function BookingPanel({ trip, reload }) {
  const [data, setData] = useState(null)
  const [offers, setOffers] = useState([])
  const a = useAction()
  const organiser = trip.viewer.role === 'ORGANISER'
  const load = () => {
    get(`/trips/${trip.code}/partners`).then(setData).catch(() => setData({ vehicles: [], summary: [] }))
    get(`/trips/${trip.code}/offers`).then((r) => setOffers(r.offers)).catch(() => null)
  }
  useEffect(() => {
    if (trip.status === 'BOOKING') load()
  }, [trip.status, trip.bookings?.length])
  const active = trip.bookings?.filter((b) => ['REQUESTED', 'ACCEPTED', 'COMPLETED'].includes(b.status)) ?? []
  const pending = active.some((b) => b.status === 'REQUESTED')
  const accepted = active.filter((b) => b.status === 'ACCEPTED')
  const act = (fn) => a.run(async () => { await fn(); reload(); load() })

  return (
    <Section id="booking" title="Transport" text={trip.status === 'BOOKING' ? 'Choose a driver from the suggestions or accept an offer. The driver has 24 hours to accept.' : undefined}>
      {trip.needsRebook && <Notice tone="warning" className="mb-4">A partner cancelled. The money for that booking was refunded. Book another driver, then ask the group to pay the new shares.</Notice>}
      {active.length > 0 && (
        <ul className="mb-5 space-y-2">
          {active.map((b) => (
            <li key={b.id} className="flex flex-wrap items-center justify-between gap-3 rounded-2xl bg-surface-2 p-4">
              <div>
                <p className="font-semibold">{b.vehicle?.name} · {b.vehicle?.type} · {b.vehicle?.seats} seats</p>
                <p className="text-sm text-muted">Driver {b.partner.firstName}{b.partner.phone ? ` · ${b.partner.phone}` : ''}{b.vehicle?.plate ? ` · ${b.vehicle.plate}` : ''} · {rs(b.amount)}</p>
              </div>
              <div className="flex items-center gap-2">
                <StatusBadge status={b.status} />
                {b.status === 'REQUESTED' && <Countdown to={b.expiresAt} />}
                {organiser && trip.status === 'BOOKING' && <button onClick={() => act(() => post(`/bookings/${b.id}/cancel-request`))} className="text-xs font-semibold text-muted hover:text-danger">Withdraw</button>}
              </div>
            </li>
          ))}
        </ul>
      )}
      {organiser && trip.status === 'BOOKING' && (
        <>
          {offers.length > 0 && (
            <div className="mb-5">
              <p className="text-sm font-bold">Offers from drivers</p>
              <ul className="mt-2 space-y-2">
                {offers.map((o) => (
                  <li key={o.id} className="flex flex-wrap items-center justify-between gap-3 rounded-2xl bg-accent-soft p-4 ring-1 ring-accent/20">
                    <div>
                      <p className="font-semibold">{rs(o.price)} · {o.vehicle} ({o.type}, {o.seats} seats)</p>
                      <p className="text-sm text-muted">{o.driver}{o.note ? ` · "${o.note}"` : ''} · <Countdown to={o.validUntil} /></p>
                    </div>
                    <div className="flex gap-2">
                      <Link to={`/drivers/${o.driverId}`} className={`${btn.ghost} !py-2 text-sm`}>Profile</Link>
                      <button disabled={a.busy} onClick={() => act(() => post(`/offers/${o.id}/accept`))} className={`${btn.accent} !py-2 text-sm`}>Accept offer</button>
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          )}
          <p className="text-sm font-bold">Suggested drivers for this route</p>
          {!data ? (
            <p className="mt-3 flex items-center gap-2 text-sm text-muted"><Loader2 className="h-4 w-4 animate-spin" /> Finding drivers…</p>
          ) : data.vehicles.length === 0 ? (
            <Notice className="mt-3">No verified drivers are free near the start on these dates yet. Drivers in the area can still send you an offer.</Notice>
          ) : (
            <>
              <div className="mt-2 flex flex-wrap gap-2 text-xs">
                {data.summary.map((s) => <span key={s.type} className="rounded-full bg-surface-2 px-3 py-1.5 font-semibold">{s.type}: {s.average ? `average ${rs(s.average)} · ` : ''}from {rs(s.lowest)}</span>)}
              </div>
              <ul className="mt-3 grid gap-3 md:grid-cols-2">
                {data.vehicles.map((v) => {
                  const asked = active.some((b) => b.vehicle?.id === v.vehicleId)
                  return (
                    <li key={v.vehicleId} className="overflow-hidden rounded-2xl bg-surface-2">
                      {v.photo && <img src={v.photo} alt={v.name} className="h-36 w-full object-cover" />}
                      <div className="p-4">
                        <div className="flex items-start justify-between gap-2">
                          <div>
                            <p className="font-bold">{v.name} <span className="font-normal text-muted">{v.year}</span></p>
                            <p className="text-xs text-muted"><Car className="inline h-3.5 w-3.5" /> {v.type} · {v.seats} seats{v.ac ? ' · A/C' : ''} · from {v.base}</p>
                          </div>
                          <p className="text-right text-lg font-extrabold">{rs(v.price)}<span className="block text-xs font-normal text-muted">{rs(v.price / trip.members.length)} each</span></p>
                        </div>
                        <div className="mt-3 flex items-center justify-between gap-2">
                          <Link to={`/drivers/${v.driver.id}`} className="text-sm"><PersonChip p={{ firstName: v.driver.firstName, rating: v.driver.rating, reviews: v.driver.reviews, photo: v.driver.photo, verified: true }} /></Link>
                          <button disabled={asked || a.busy} onClick={() => act(() => post(`/trips/${trip.code}/bookings`, { vehicleId: v.vehicleId }))} className={`${btn.primary} !py-2 text-sm`}>{asked ? 'Requested' : 'Request'}</button>
                        </div>
                        <details className="mt-2 text-xs text-muted">
                          <summary className="cursor-pointer font-semibold">How this price is worked out</summary>
                          <ul className="mt-1 space-y-0.5">{v.breakdown.map((l) => <li key={l.label} className={`flex justify-between ${l.bold ? 'font-semibold text-ink' : ''}`}><span>{l.label}</span><span>{rs(l.amount)}</span></li>)}</ul>
                        </details>
                      </div>
                    </li>
                  )
                })}
              </ul>
            </>
          )}
          <div className="mt-6 flex flex-wrap items-center gap-3 border-t border-line pt-5">
            <button disabled={a.busy || pending || accepted.length === 0} onClick={() => act(() => post(`/trips/${trip.code}/request-payment`))} className={btn.accent}>Ask everyone to pay</button>
            <span className="text-sm text-muted">{pending ? 'Waiting for a driver to answer.' : accepted.length ? 'Shares are split from the accepted bookings, plus the booking fee.' : 'Book at least one vehicle first.'}</span>
          </div>
        </>
      )}
      {!organiser && active.length === 0 && <p className="text-sm text-muted">The organiser is choosing transport.</p>}
      {a.error && <Notice tone="danger" className="mt-3">{a.error}</Notice>}
    </Section>
  )
}

// ---------- Payment status (organiser) ----------
export function PaymentStatusPanel({ trip, reload }) {
  const a = useAction()
  if (!trip.paymentStatus || !['PAYMENT_DUE', 'CONFIRMED'].includes(trip.status)) return null
  const decision = trip.history?.some((h) => h.event === 'UNPAID_REMOVED') && trip.status === 'PAYMENT_DUE'
  return (
    <Section title="Who has paid">
      <ul className="space-y-2">
        {trip.paymentStatus.map((p, i) => (
          <li key={i} className="flex items-center justify-between rounded-2xl bg-surface-2 px-4 py-3 text-sm">
            <span className="font-semibold">{p.name}</span>
            <span>{p.balance > 0 ? <span className="text-accent">{rs(p.balance)} to pay</span> : <span className="font-semibold text-success">Paid {rs(p.credit)}</span>}</span>
          </li>
        ))}
      </ul>
      {decision && (
        <div className="mt-4 rounded-2xl bg-accent-soft p-4">
          <p className="text-sm font-semibold">Someone didn't pay in time. What now?</p>
          <div className="mt-3 flex flex-wrap gap-2">
            <button onClick={() => a.run(async () => { await post(`/trips/${trip.code}/unpaid-decision`, { action: 'REOPEN' }); reload() })} className={btn.ghost}>Reopen the seat for 24 hours</button>
            <button onClick={() => a.run(async () => { await post(`/trips/${trip.code}/unpaid-decision`, { action: 'CONTINUE' }); reload() })} className={btn.primary}>Continue with fewer people</button>
          </div>
          {a.error && <Notice tone="danger" className="mt-3">{a.error}</Notice>}
        </div>
      )}
    </Section>
  )
}

// ---------- During the trip ----------
export function DuringTripPanel({ trip, reload }) {
  const a = useAction()
  const [sos, setSos] = useState(null)
  // Sri Lanka date (UTC+5:30); the server marks the trip Ongoing at midnight
  const today = new Date(Date.now() + 330 * 60000).toISOString().slice(0, 10)
  if (!(trip.status === 'ONGOING' || (trip.status === 'CONFIRMED' && trip.startDate <= today))) return null
  const sendSos = () =>
    a.run(async () => {
      const pos = await new Promise((resolve) => navigator.geolocation ? navigator.geolocation.getCurrentPosition((p) => resolve(p.coords), () => resolve(null), { timeout: 5000 }) : resolve(null))
      setSos(await post(`/trips/${trip.code}/sos`, pos ? { lat: pos.latitude, lng: pos.longitude } : {}))
    })
  return (
    <Section title="Today" text="Check in at the first pickup. SOS tells your group and Yaluwo where you are.">
      <div className="flex flex-wrap gap-3">
        {trip.checkedIn ? (
          <span className="inline-flex items-center gap-2 rounded-full bg-[color-mix(in_oklab,#16a34a_14%,var(--surface))] px-5 py-3 font-semibold text-success"><Check className="h-5 w-5" /> Checked in</span>
        ) : (
          <button onClick={() => a.run(async () => { await post(`/trips/${trip.code}/checkin`); reload() })} className={btn.primary}><MapPin className="h-5 w-5" /> Check in</button>
        )}
        <button onClick={sendSos} className="inline-flex items-center gap-2 rounded-full bg-danger px-6 py-3 font-bold text-white"><Siren className="h-5 w-5" /> SOS</button>
      </div>
      {sos && (
        <Notice tone="danger" className="mt-4">
          <p className="font-semibold">Your group and Yaluwo have been told{sos.numbers ? '' : ''}. If you are in danger, call now:</p>
          <div className="mt-2 flex flex-wrap gap-2">{sos.numbers.map((n) => <a key={n.number} href={`tel:${n.number}`} className="inline-flex items-center gap-1 rounded-full bg-surface px-3 py-1.5 font-bold"><Phone className="h-4 w-4" /> {n.label} {n.number}</a>)}</div>
        </Notice>
      )}
      {a.error && <Notice tone="danger" className="mt-3">{a.error}</Notice>}
    </Section>
  )
}

// ---------- Reviews (blind) ----------
function Stars({ value, onChange, label }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="text-sm capitalize">{label.replace(/_/g, ' ')}</span>
      <span className="flex">
        {[1, 2, 3, 4, 5].map((n) => (
          <button key={n} type="button" onClick={() => onChange(n)} aria-label={`${n} stars for ${label}`}>
            <Star className={`h-6 w-6 ${n <= value ? 'fill-accent text-accent' : 'text-line'}`} />
          </button>
        ))}
      </span>
    </div>
  )
}

function ReviewItem({ trip, item, onDone }) {
  const [scores, setScores] = useState(Object.fromEntries(item.criteria.map((c) => [c, 0])))
  const [comment, setComment] = useState('')
  const a = useAction()
  if (item.done) return <li className="flex items-center justify-between rounded-2xl bg-surface-2 p-4 text-sm"><span className="font-semibold">{item.label}</span><span className="flex items-center gap-1 text-success"><Check className="h-4 w-4" /> Rated</span></li>
  return (
    <li className="rounded-2xl bg-surface-2 p-4">
      <p className="font-semibold">{item.label}</p>
      <div className="mt-3 space-y-2">{item.criteria.map((c) => <Stars key={c} label={c} value={scores[c]} onChange={(v) => setScores({ ...scores, [c]: v })} />)}</div>
      <textarea value={comment} onChange={(e) => setComment(e.target.value)} rows={2} placeholder="A few words (optional)" className={`${input} mt-3 h-auto py-2`} />
      {a.error && <Notice tone="danger" className="mt-2">{a.error}</Notice>}
      <button disabled={Object.values(scores).some((v) => !v) || a.busy} onClick={() => a.run(async () => { await post(`/trips/${trip.code}/reviews`, { subjectType: item.subjectType, subjectId: item.subjectId, scores, comment }); onDone() })} className={`${btn.primary} mt-3 !py-2 text-sm`}>Send rating</button>
    </li>
  )
}

export function ReviewPanel({ trip }) {
  const [todo, setTodo] = useState(null)
  const load = () => get(`/trips/${trip.code}/reviews/todo`).then(setTodo).catch(() => null)
  useEffect(() => {
    if (trip.status === 'COMPLETED') load()
  }, [trip.status])
  if (trip.status !== 'COMPLETED' || !todo?.open) return null
  return (
    <Section id="review" title="Rate your trip" text="Ratings stay hidden until both sides have rated each other, or the 14-day window closes.">
      {todo.items.length === 0 ? <p className="text-sm text-muted">Only people who checked in can rate.</p> : <ul className="space-y-3">{todo.items.map((i) => <ReviewItem key={`${i.subjectType}${i.subjectId}`} trip={trip} item={i} onDone={load} />)}</ul>}
    </Section>
  )
}

// ---------- Problems: disputes about a booked service ----------
export function DisputePanel({ trip }) {
  const [open, setOpen] = useState(null)
  const [reason, setReason] = useState('')
  const [done, setDone] = useState(false)
  const a = useAction()
  const bookings = trip.bookings?.filter((b) => ['ACCEPTED', 'COMPLETED'].includes(b.status)) ?? []
  if (!['CONFIRMED', 'ONGOING', 'COMPLETED'].includes(trip.status) || !bookings.length || trip.viewer.role === 'ADMIN') return null
  return (
    <Section title="A problem with a booked service?" text="Open a dispute until 24 hours after the trip. The partner's payout is frozen until Yaluwo decides (within 72 hours).">
      {done ? (
        <Notice tone="success">Dispute opened. The partner replies within 24 hours, then Yaluwo decides.</Notice>
      ) : open ? (
        <div className="space-y-3">
          <Field label={`What went wrong with ${open.vehicle?.name ?? 'this booking'}?`}><textarea value={reason} onChange={(e) => setReason(e.target.value)} rows={3} className={`${input} h-auto py-3`} /></Field>
          {a.error && <Notice tone="danger">{a.error}</Notice>}
          <div className="flex gap-2">
            <button onClick={() => setOpen(null)} className={btn.ghost}>Cancel</button>
            <button disabled={reason.length < 10 || a.busy} onClick={() => a.run(async () => { await upload(`/bookings/${open.id}/disputes`, { reason }); setDone(true) })} className={btn.accent}>Open dispute</button>
          </div>
        </div>
      ) : (
        <div className="flex flex-wrap gap-2">{bookings.map((b) => <button key={b.id} onClick={() => setOpen(b)} className={btn.ghost}>Report a problem with {b.vehicle?.name ?? b.code}</button>)}</div>
      )}
    </Section>
  )
}

// ---------- Visitors: ask to join ----------
export function JoinPanel({ trip, user, reload }) {
  const [message, setMessage] = useState('')
  const a = useAction()
  const config = useConfig()
  const hours = settingOf(config, 'trips.join_request_hours', 72)
  if (trip.viewer.memberStatus === 'REQUESTED') {
    return (
      <Section title="Request sent" text={`The organiser answers within ${hours} hours, or the request expires.`}>
        <div className="flex flex-wrap gap-2">
          {trip.requestThreadId && <Link to={`/messages/${trip.requestThreadId}`} className={btn.primary}><MessageCircle className="h-4 w-4" /> Chat with the organiser</Link>}
          <button onClick={() => a.run(async () => { await post(`/trips/${trip.code}/leave`); reload() })} className={btn.ghost}>Withdraw request</button>
        </div>
        {trip.viewer.requestExpiresAt && <p className="mt-3 text-sm">Answer due: <Countdown to={trip.viewer.requestExpiresAt} /></p>}
      </Section>
    )
  }
  if (trip.status !== 'OPEN') return null
  if (!user) {
    return (
      <Section title="Want to come along?" text="Log in or create an account to ask the organiser.">
        <div className="flex gap-2"><Link to={`/login?next=/trips/${trip.code}`} className={btn.primary}>Log in</Link><Link to="/signup" className={btn.ghost}>Sign up</Link></div>
      </Section>
    )
  }
  if (['ORGANISER', 'MEMBER', 'ADMIN', 'PARTNER'].includes(trip.viewer.role)) return null
  return (
    <Section title="Ask to join" text="Say a little about yourself. You and the organiser can chat privately before they decide.">
      {!user.verified && <Notice tone="warning" className="mb-3">You can ask now, but the organiser can accept you only once your ID is verified. <Link to="/verify" className="font-semibold underline">Verify now</Link></Notice>}
      <textarea value={message} onChange={(e) => setMessage(e.target.value)} rows={3} maxLength={500} placeholder="Hi! I'm..." className={`${input} h-auto py-3`} />
      {a.error && <Notice tone="danger" className="mt-3">{a.error}</Notice>}
      <button disabled={message.trim().length < 5 || a.busy} onClick={() => a.run(async () => { await post(`/trips/${trip.code}/join-requests`, { message }); reload() })} className={`${btn.accent} mt-3`}><Users className="h-4 w-4" /> Send request</button>
    </Section>
  )
}
