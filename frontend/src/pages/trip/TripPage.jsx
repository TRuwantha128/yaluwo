import { useState } from 'react'
import { Link, useParams, useSearchParams } from 'react-router-dom'
import { CalendarDays, Car, Check, Clock, Flag, Lock, MapPinned, MessageCircle, Pencil, Route, Share2 } from 'lucide-react'
import { get, post } from '../../api/client'
import { useAuth } from '../../auth/AuthProvider'
import { useTrip } from '../../hooks/useTrips'
import { useConfig, vehicleName, settingOf } from '../../config/useConfig'
import RouteMap from '../../maps/RouteMap'
import Chat from '../../components/Chat'
import { Notice, PageLoader, StatusBadge, input, useAction } from '../../components/form'
import { Cover, btn } from '../../components/ui'
import { dateRange, googleMapsRouteUrl, rs, stopDates, tripDays } from '../../lib/format'
import NotFound from '../NotFound'
import { PayPanel } from './TripMoney'
import { BookingPanel, DisputePanel, DuringTripPanel, JoinPanel, MembersPanel, PaymentStatusPanel, PersonChip, RequestsPanel, ReviewPanel, Section } from './TripPanels'

const TRACK = [
  ['OPEN', 'Open'],
  ['BOOKING', 'Booking'],
  ['PAYMENT_DUE', 'Payment'],
  ['CONFIRMED', 'Confirmed'],
  ['ONGOING', 'On the trip'],
  ['COMPLETED', 'Reviews'],
  ['CLOSED', 'Closed'],
]
const ORDER = ['DRAFT', 'UNDER_REVIEW', 'OPEN', 'FULL', 'BOOKING', 'PAYMENT_DUE', 'CONFIRMED', 'ONGOING', 'COMPLETED', 'CLOSED']

// Every trip has exactly one status; this shows where it is on the path
function StatusTrack({ status }) {
  if (status === 'CANCELLED') return null
  const at = ORDER.indexOf(status === 'FULL' ? 'OPEN' : status)
  return (
    <ol className="scrollbar-none flex gap-1 overflow-x-auto" aria-label="Trip progress">
      {TRACK.map(([s, label]) => {
        const i = ORDER.indexOf(s)
        const done = at > i
        const now = at === i || (s === 'OPEN' && status === 'FULL')
        return (
          <li key={s} className={`flex shrink-0 items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-semibold ${now ? 'bg-brand text-on-brand' : done ? 'bg-brand-soft text-brand' : 'bg-surface-2 text-muted'}`}>
            {done && <Check className="h-3.5 w-3.5" />} {label}
          </li>
        )
      })}
    </ol>
  )
}

function OrganiserBar({ trip, reload }) {
  const a = useAction()
  const config = useConfig()
  const [cancel, setCancel] = useState(false)
  const [reason, setReason] = useState('')
  const min = settingOf(config, 'trips.min_group', 2)
  return (
    <Section title="Organiser" text={{ DRAFT: 'Your trip is a draft. Finish it and publish.', UNDER_REVIEW: 'Yaluwo is checking your first trip (within 24 hours).', OPEN: 'Accept people who fit. When you are ready, lock the group and book transport.', FULL: 'Every seat is taken. Lock the group to book transport.', BOOKING: 'Book transport, then ask everyone to pay.', PAYMENT_DUE: 'Everyone pays their own share. The trip is confirmed when all have paid.', CONFIRMED: 'Everything is booked and paid.', ONGOING: 'Have a great trip! Everyone checks in at the first pickup.', COMPLETED: 'The trip is over. Rate your driver and trip mates.', CLOSED: 'This trip is closed.', CANCELLED: 'This trip was cancelled. Refunds go back the way people paid.' }[trip.status]}>
      <div className="flex flex-wrap gap-2">
        {['DRAFT', 'OPEN', 'FULL'].includes(trip.status) && <Link to={`/trips/${trip.code}/edit`} className={btn.ghost}><Pencil className="h-4 w-4" /> Edit</Link>}
        {trip.status === 'DRAFT' && <Link to={`/trips/${trip.code}/edit`} className={btn.accent}>Finish and publish</Link>}
        {['OPEN', 'FULL'].includes(trip.status) && (
          <button disabled={a.busy || trip.members.length < min} onClick={() => a.run(async () => { await post(`/trips/${trip.code}/lock`); reload() })} className={btn.primary} title={trip.members.length < min ? `At least ${min} people` : ''}>
            <Lock className="h-4 w-4" /> Lock the group ({trip.members.length})
          </button>
        )}
        {!['ONGOING', 'COMPLETED', 'CLOSED', 'CANCELLED'].includes(trip.status) && <button onClick={() => setCancel(!cancel)} className={`${btn.ghost} text-danger`}>Cancel trip</button>}
      </div>
      {cancel && (
        <div className="mt-4 space-y-3 rounded-2xl bg-surface-2 p-4">
          <p className="text-sm">Everyone who paid gets 100% back. {trip.status === 'PAYMENT_DUE' || trip.status === 'CONFIRMED' ? 'Your listing deposit (if any) is kept and this counts as a strike.' : ''}</p>
          <input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Tell the group why" className={input} />
          <button disabled={reason.length < 3 || a.busy} onClick={() => a.run(async () => { await post(`/trips/${trip.code}/cancel`, { reason }); reload() })} className={btn.accent}>Cancel the trip</button>
        </div>
      )}
      {a.error && <Notice tone="danger" className="mt-3">{a.error}</Notice>}
    </Section>
  )
}

function MemberBar({ trip, reload }) {
  const a = useAction()
  const [terms, setTerms] = useState(null)
  const beforePay = ['OPEN', 'FULL', 'BOOKING'].includes(trip.status)
  const paying = ['PAYMENT_DUE', 'CONFIRMED'].includes(trip.status)
  if (!beforePay && !paying) return null
  return (
    <div className="flex flex-wrap items-center gap-3 text-sm">
      {beforePay && <button onClick={() => a.run(async () => { await post(`/trips/${trip.code}/leave`); reload() })} className="font-semibold text-muted hover:text-danger">Leave this trip</button>}
      {paying && !terms && <button onClick={() => a.run(async () => setTerms(await get(`/trips/${trip.code}/cancel-seat`)))} className="font-semibold text-muted hover:text-danger">Cancel my seat</button>}
      {terms && (
        <div className="w-full rounded-2xl bg-surface-2 p-4">
          <p className="font-semibold">{terms.rule}</p>
          <p className="mt-1 text-muted">Refund: {rs(terms.refund)} of {rs(terms.paid)} paid.</p>
          <div className="mt-3 flex gap-2">
            <button onClick={() => setTerms(null)} className={btn.ghost}>Keep my seat</button>
            <button onClick={() => a.run(async () => { await post(`/trips/${trip.code}/cancel-seat`, {}); reload() })} className={btn.accent}>Cancel my seat</button>
          </div>
        </div>
      )}
      {a.error && <Notice tone="danger" className="w-full">{a.error}</Notice>}
    </div>
  )
}

function ReportTrip({ trip }) {
  const [open, setOpen] = useState(false)
  const [reason, setReason] = useState('')
  const [done, setDone] = useState(false)
  const config = useConfig()
  if (done) return <p className="text-xs text-muted">Reported. Thank you.</p>
  if (!open) return <button onClick={() => setOpen(true)} className="inline-flex items-center gap-1 text-xs font-semibold text-muted hover:text-danger"><Flag className="h-3.5 w-3.5" /> Report</button>
  return (
    <span className="flex items-center gap-2">
      <select value={reason} onChange={(e) => setReason(e.target.value)} className="rounded-full bg-surface-2 px-3 py-1.5 text-xs">
        <option value="">Why?</option>
        {(config?.lists?.REPORT_REASON ?? []).map((r) => <option key={r.code}>{r.label_en}</option>)}
      </select>
      <button disabled={!reason} onClick={async () => { await post('/reports', { targetType: 'TRIP', tripCode: trip.code, reason }); setDone(true) }} className="text-xs font-semibold text-danger">Send</button>
    </span>
  )
}

export default function TripPage() {
  const { id } = useParams()
  const [params] = useSearchParams()
  const { user } = useAuth()
  const config = useConfig()
  const { trip, loading, error, reload } = useTrip(id)
  if (loading) return <PageLoader />
  if (error === 'NOT_FOUND' || !trip) return <NotFound />

  const role = trip.viewer.role
  const inside = ['ORGANISER', 'MEMBER', 'ADMIN'].includes(role)
  const legs = trip.legs ?? []
  const hm = (m) => `${Math.floor(m / 60)} h ${m % 60} min`

  return (
    <div className="pb-16 pt-20">
      <div className="relative h-[38vh] min-h-64 overflow-hidden">
        <Cover src={trip.cover} kind={trip.stops[1]?.kind ?? trip.stops[0]?.kind} alt={trip.title} />
        <div className="absolute inset-0 bg-gradient-to-t from-bg via-bg/30 to-transparent" />
      </div>
      <div className="wrap -mt-28">
        <div className="relative">
          <div className="flex flex-wrap items-center gap-2">
            <StatusBadge status={trip.status} />
            {trip.womenOnly && <span className="rounded-full bg-accent px-2.5 py-1 text-xs font-semibold text-on-accent">Women only</span>}
            {trip.genderRule === 'MEN' && <span className="rounded-full bg-brand px-2.5 py-1 text-xs font-semibold text-on-brand">Men only</span>}
            {trip.flexible && <span className="rounded-full bg-surface px-2.5 py-1 text-xs font-semibold ring-1 ring-line">Flexible route</span>}
            <span className="rounded-full bg-surface px-2.5 py-1 font-mono text-xs ring-1 ring-line">{trip.code}</span>
          </div>
          <h1 className="mt-3 text-4xl font-bold tracking-[-0.03em] md:text-5xl">{trip.title}</h1>
          <p className="mt-2 flex flex-wrap items-center gap-x-5 gap-y-1 text-muted">
            <span className="flex items-center gap-1.5"><CalendarDays className="h-4 w-4" /> {dateRange(trip.startDate, trip.stops)}</span>
            <span className="flex items-center gap-1.5"><Clock className="h-4 w-4" /> {tripDays(trip.stops)} days</span>
            {trip.km && <span className="flex items-center gap-1.5"><Route className="h-4 w-4" /> {trip.km} km{trip.routeSource === 'ESTIMATE' ? ' (est.)' : ''}</span>}
            {trip.vehicle && <span className="flex items-center gap-1.5"><Car className="h-4 w-4" /> {vehicleName(config, trip.vehicle)}</span>}
          </p>
          <div className="mt-5"><StatusTrack status={trip.status} /></div>
        </div>

        {params.get('published') && <Notice tone="success" className="mt-6">Your trip is live on the Trip Board. Share it with friends!</Notice>}
        {params.get('review') && <Notice className="mt-6">Thanks! Yaluwo checks your first trip within 24 hours. You'll get an email.</Notice>}
        {trip.status === 'CANCELLED' && <Notice tone="danger" className="mt-6">This trip was cancelled{trip.cancelReason ? `: ${trip.cancelReason}` : '.'} Anything paid is refunded.</Notice>}
        {trip.rejectedReason && trip.status === 'DRAFT' && <Notice tone="warning" className="mt-6">Yaluwo asked for changes: {trip.rejectedReason}</Notice>}

        <div className="mt-8 grid gap-6 lg:grid-cols-[1.35fr_1fr]">
          <div className="space-y-6">
            {role === 'ORGANISER' && <OrganiserBar trip={trip} reload={reload} />}
            {role === 'ORGANISER' && <RequestsPanel trip={trip} reload={reload} />}
            <JoinPanel trip={trip} user={user} reload={reload} />
            {inside && trip.myMoney && ['PAYMENT_DUE', 'CONFIRMED', 'ONGOING'].includes(trip.status) && <PayPanel trip={trip} />}
            {inside && ['BOOKING', 'PAYMENT_DUE', 'CONFIRMED', 'ONGOING', 'COMPLETED'].includes(trip.status) && <BookingPanel trip={trip} reload={reload} />}
            {role === 'ORGANISER' && <PaymentStatusPanel trip={trip} reload={reload} />}
            {(inside || role === 'PARTNER') && role !== 'ADMIN' && <DuringTripPanel trip={trip} reload={reload} />}
            {inside && <ReviewPanel trip={trip} />}

            <Section title="Route" action={<a href={googleMapsRouteUrl(trip.stops)} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 text-sm font-semibold text-brand hover:underline"><MapPinned className="h-4 w-4" /> Open in Google Maps</a>}>
              <RouteMap stops={trip.stops} className="h-[300px] rounded-2xl ring-1 ring-line md:h-[360px]" />
              <ol className="mt-5">
                {trip.stops.map((s, i) => (
                  <li key={i}>
                    <div className="flex items-center gap-3 text-sm">
                      <span className={`grid h-7 w-7 shrink-0 place-items-center rounded-full text-xs font-bold ${i === 0 || i === trip.stops.length - 1 ? 'bg-accent text-on-accent' : 'bg-brand text-on-brand'}`}>{i + 1}</span>
                      <span className="font-semibold">{s.name}</span>
                      <span className="text-muted">{stopDates(trip.startDate, trip.stops)[i]}{s.nights > 0 && ` · ${s.nights} ${s.nights === 1 ? 'night' : 'nights'}`}</span>
                    </div>
                    {legs[i] && i < trip.stops.length - 1 && <p className="ml-3.5 border-l-2 border-dotted border-line py-2 pl-6 text-xs text-muted">{legs[i].km} km · {hm(legs[i].minutes)}</p>}
                  </li>
                ))}
              </ol>
            </Section>
            {trip.description && <Section title="About this trip"><p className="whitespace-pre-wrap">{trip.description}</p></Section>}
            {inside && <DisputePanel trip={trip} />}
          </div>

          <aside className="space-y-6 lg:sticky lg:top-24 lg:self-start">
            <div className="rounded-3xl bg-surface p-6 ring-1 ring-line">
              {trip.price && <p className="text-sm text-muted">Estimated per person<span className="block text-3xl font-bold tracking-tight text-ink">{rs(trip.price)}</span><span className="text-xs">transport share + booking fee; stays and food extra</span></p>}
              <div className="mt-5 border-t border-line pt-5"><PersonChip p={trip.organiser} sub={`Organiser${trip.organiser.tripsCompleted ? ` · ${trip.organiser.tripsCompleted} trips` : ''}`} /></div>
              {trip.match != null && <p className="mt-4 rounded-2xl bg-brand-soft px-4 py-2 text-sm font-semibold text-brand">{trip.match}% match with your travel style</p>}
              <div className="mt-4 flex items-center justify-between">
                <button onClick={() => navigator.share?.({ title: trip.title, url: window.location.href }) ?? navigator.clipboard?.writeText(window.location.href)} className="inline-flex items-center gap-1.5 text-sm font-semibold text-brand"><Share2 className="h-4 w-4" /> Share</button>
                {user && !inside && <ReportTrip trip={trip} />}
              </div>
              {role === 'MEMBER' && <div className="mt-4 border-t border-line pt-4"><MemberBar trip={trip} reload={reload} /></div>}
            </div>
            <MembersPanel trip={trip} reload={reload} />
            {inside && trip.threadId && (
              <div>
                <p className="mb-2 flex items-center gap-2 text-sm font-bold"><MessageCircle className="h-4 w-4" /> Group chat</p>
                <Chat threadId={trip.threadId} compact className="h-[480px]" />
              </div>
            )}
            {inside && trip.history?.length > 0 && (
              <Section title="Trip history">
                <ol className="space-y-2 text-sm">{trip.history.slice(0, 12).map((h, i) => <li key={i} className="flex justify-between gap-3"><span>{h.text}</span><span className="shrink-0 text-xs text-muted">{new Date(h.at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}</span></li>)}</ol>
              </Section>
            )}
          </aside>
        </div>
      </div>
    </div>
  )
}
