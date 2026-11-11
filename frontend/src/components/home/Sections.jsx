import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { BadgeCheck, CalendarDays, Handshake, Landmark, MapPin, ScanFace, Search } from 'lucide-react'
import { Eyebrow, SectionTitle, btn } from '../ui'
import TripCard from '../TripCard'
import EmptyTrips from '../EmptyTrips'
import { NEXT_MONTHS, rs } from '../../lib/format'
import { PLACES } from '../../lib/places'
import { settingOf, useConfig } from '../../config/useConfig'

const SORTED_PLACES = [...PLACES].sort((a, b) => a.name.localeCompare(b.name))

// ---------- Open trips, with the search that used to sit in the hero ----------
function TripSearch() {
  const navigate = useNavigate()
  const [place, setPlace] = useState('')
  const [month, setMonth] = useState('')
  const submit = (e) => {
    e.preventDefault()
    const params = new URLSearchParams()
    if (place) params.set('place', place)
    if (month) params.set('month', month)
    navigate(`/trips?${params}`)
  }
  const field = 'w-full appearance-none bg-transparent font-semibold outline-none'
  return (
    <form onSubmit={submit} className="grid gap-1 rounded-3xl bg-surface p-2 shadow-[0_30px_60px_-40px_rgba(21,23,74,0.55)] ring-1 ring-line sm:grid-cols-[1.4fr_1fr_auto]">
      <label className="flex items-center gap-3 rounded-2xl px-4 py-2.5 hover:bg-surface-2">
        <MapPin className="h-5 w-5 shrink-0 text-brand" />
        <span className="flex min-w-0 flex-1 flex-col">
          <span className="text-xs font-medium text-muted">Where to</span>
          <select value={place} onChange={(e) => setPlace(e.target.value)} className={field}>
            <option value="">Anywhere in Sri Lanka</option>
            {SORTED_PLACES.map((p) => <option key={p.id} value={p.name}>{p.name}</option>)}
          </select>
        </span>
      </label>
      <label className="flex items-center gap-3 rounded-2xl px-4 py-2.5 hover:bg-surface-2">
        <CalendarDays className="h-5 w-5 shrink-0 text-brand" />
        <span className="flex min-w-0 flex-1 flex-col">
          <span className="text-xs font-medium text-muted">When</span>
          <select value={month} onChange={(e) => setMonth(e.target.value)} className={field}>
            <option value="">Any time</option>
            {NEXT_MONTHS.map((m) => <option key={m.value} value={m.value}>{m.label}</option>)}
          </select>
        </span>
      </label>
      <button type="submit" className={`${btn.primary} !py-3.5`}><Search className="h-5 w-5" /> Find trips</button>
    </form>
  )
}

export function OpenTrips({ trips, loading, error }) {
  return (
    <section className="wrap py-24">
      <div className="grid items-end gap-8 lg:grid-cols-[1fr_1.1fr]">
        <SectionTitle eyebrow="Open trips" title="Join a group that is already going" />
        <TripSearch />
      </div>
      <div className="mt-12">
        {error ? (
          <p className="rounded-3xl bg-surface p-6 text-muted ring-1 ring-line">Trips can't be loaded right now. {error}</p>
        ) : !loading && trips.length === 0 ? (
          <EmptyTrips />
        ) : (
          <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {trips.slice(0, 6).map((t) => <TripCard key={t.id} trip={t} />)}
          </div>
        )}
      </div>
      {trips.length > 6 && <Link to="/trips" className={`${btn.ghost} mt-10`}>See all {trips.length} trips</Link>}
    </section>
  )
}

// ---------- How a trip works, for someone who has never used Yaluwo ----------
export function HowItWorks() {
  const config = useConfig()
  const steps = [
    { title: 'Draw your route', text: 'Add the places and the nights on the map above. The road distance and a fair price appear straight away.' },
    { title: 'Fill the seats', text: 'Publish the trip. Travellers who like the route ask to join, and you choose. Everyone has passed an ID and live selfie check.' },
    { title: 'Book a driver', text: `Registered drivers send offers for your exact route, within ${settingOf(config, 'rates.band_min_pct', 70)}% to ${settingOf(config, 'rates.band_max_pct', 130)}% of the suggested price. Nothing is booked until you accept.` },
    { title: 'Pay only your share', text: `Each person pays their own share to Yaluwo. The driver is paid ${settingOf(config, 'money.payout_ready_hours', 24)} hours after the trip ends.` },
  ]
  return (
    <section id="how" className="wrap scroll-mt-24 py-24">
      <SectionTitle eyebrow="New here?" title="A trip on Yaluwo, in four steps" />
      <ol className="mt-12 grid gap-x-8 gap-y-10 sm:grid-cols-2 lg:grid-cols-4">
        {steps.map((s, i) => (
          <li key={s.title} className="relative border-t-2 border-line pt-6">
            <span className="font-display absolute -top-[2px] left-0 h-[2px] w-12 bg-accent" />
            <span className="font-display text-sm font-semibold text-accent">Step {i + 1}</span>
            <h3 className="mt-2 text-xl font-bold">{s.title}</h3>
            <p className="mt-2 leading-relaxed text-muted">{s.text}</p>
          </li>
        ))}
      </ol>
      <div className="mt-12 flex flex-wrap gap-3">
        <Link to="/#plan" className={btn.primary}>Start with the map</Link>
        <Link to="/signup" className={btn.ghost}>Create a free account</Link>
      </div>
    </section>
  )
}

// ---------- What Yaluwo never skips ----------
export function Promises() {
  const config = useConfig()
  const items = [
    { Icon: ScanFace, title: 'A real person behind every seat', text: `Joining, hosting and driving need an ID and a live selfie taken in the app. The team checks each one, usually within ${settingOf(config, 'accounts.verification_hours', 24)} hours.` },
    { Icon: Landmark, title: 'Your money waits with Yaluwo', text: `You pay Yaluwo, not a stranger. Drivers are paid ${settingOf(config, 'money.payout_ready_hours', 24)} hours after the trip ends, once nobody has opened a dispute.` },
    { Icon: Handshake, title: 'Nothing is booked until it is accepted', text: `A driver must accept your request within ${settingOf(config, 'partners.reply_hours', 24)} hours. If someone drops out, the seat reopens and every share is worked out again.` },
  ]
  return (
    <section id="safety" className="scroll-mt-24 bg-night py-24 text-white">
      <div className="wrap">
        <SectionTitle light eyebrow="Safety" title="Three things Yaluwo never skips" />
        <div className="mt-14 grid gap-px overflow-hidden rounded-3xl bg-white/15 md:grid-cols-3">
          {items.map(({ Icon, title, text }) => (
            <div key={title} className="bg-night p-8">
              <Icon className="h-8 w-8 text-mango" strokeWidth={1.6} />
              <h3 className="mt-6 text-xl font-bold">{title}</h3>
              <p className="mt-3 leading-relaxed text-white/70">{text}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}

// ---------- For drivers ----------
export function ForDrivers() {
  const config = useConfig()
  const commission = settingOf(config, 'fees.commission_pct', null)
  return (
    <section id="partners" className="wrap scroll-mt-24 py-24">
      <div className="grid items-center gap-10 lg:grid-cols-[1.1fr_1fr]">
        <div>
          <Eyebrow>For drivers and fleets</Eyebrow>
          <h2 className="display mt-4 text-[clamp(1.7rem,3.6vw,2.9rem)]">Full vans out. Paid seats on the way home.</h2>
          <p className="mt-4 max-w-xl text-lg leading-relaxed text-muted">Register your vehicle once, then send offers on trips near you. The group has already paid Yaluwo before you start the engine.</p>
          <Link to="/signup?role=DRIVER" className={`${btn.primary} mt-8`}>Drive with Yaluwo</Link>
        </div>
        <ul className="divide-y divide-line rounded-3xl bg-surface ring-1 ring-line">
          {[
            ['Payment is certain', 'The whole group pays before the trip is confirmed.'],
            ['Your price, inside a fair range', `Offer ${settingOf(config, 'rates.band_min_pct', 70)}% to ${settingOf(config, 'rates.band_max_pct', 130)}% of the suggested price for each route.`],
            commission != null && ['One clear commission', `${commission}% of the booking, shown before you send an offer. Nothing else is taken.`],
            ['A badge worth earning', `Keep an average above ${settingOf(config, 'quality.badge_min_avg', 4.5)} over ${settingOf(config, 'quality.badge_min_reviews', 5)} reviews to become a Trusted Driver.`],
          ].filter(Boolean).map(([title, text]) => (
            <li key={title} className="flex gap-4 p-6">
              <BadgeCheck className="mt-0.5 h-5 w-5 shrink-0 text-brand" />
              <div><p className="font-bold">{title}</p><p className="mt-1 text-muted">{text}</p></div>
            </li>
          ))}
        </ul>
      </div>
    </section>
  )
}

export function FinalCall() {
  return (
    <section className="px-[clamp(20px,4.5vw,72px)] pb-24">
      <div className="bg-sunset relative mx-auto max-w-[1456px] overflow-hidden rounded-4xl px-6 py-16 text-center text-white sm:py-20">
        <p aria-hidden lang="si" className="font-sinhala pointer-events-none absolute -bottom-10 left-1/2 -translate-x-1/2 select-none whitespace-nowrap text-[11rem] font-black leading-none text-white/10">යාළුවෝ</p>
        <h2 className="display relative mx-auto max-w-2xl text-[clamp(1.9rem,4.4vw,3.4rem)]">Got a route in mind? Find the friends to share it.</h2>
        <div className="relative mt-9 flex flex-wrap justify-center gap-3">
          <Link to="/#plan" className={`${btn.primary} !bg-night !text-white`}>Plan a route</Link>
          <Link to="/trips" className={btn.glass}>Find a trip</Link>
        </div>
      </div>
    </section>
  )
}
