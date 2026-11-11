import { useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { BadgeCheck, CalendarDays, Handshake, Landmark, MapPin, Minus, Plus, ScanFace, Search } from 'lucide-react'
import { Eyebrow, SectionTitle, btn } from '../ui'
import TripCard from '../TripCard'
import EmptyTrips from '../EmptyTrips'
import { NEXT_MONTHS, rs } from '../../lib/format'
import { PLACES } from '../../lib/places'
import { fixedRoutePrice, roadKm, shareOf } from '../../lib/fare'
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

// ---------- What would my share be? Works from the live rate card. ----------
function Stepper({ label, value, onChange, min, max }) {
  return (
    <div>
      <span className="text-sm font-semibold">{label}</span>
      <div className="mt-1.5 flex h-12 items-center justify-between rounded-2xl bg-surface px-2 ring-1 ring-line">
        <button type="button" onClick={() => onChange(Math.max(min, value - 1))} disabled={value <= min} className="grid h-8 w-8 place-items-center rounded-xl hover:bg-surface-2 disabled:opacity-30" aria-label={`Fewer ${label.toLowerCase()}`}><Minus className="h-4 w-4" /></button>
        <span className="font-display text-lg font-semibold" aria-live="polite">{value}</span>
        <button type="button" onClick={() => onChange(Math.min(max, value + 1))} disabled={value >= max} className="grid h-8 w-8 place-items-center rounded-xl hover:bg-surface-2 disabled:opacity-30" aria-label={`More ${label.toLowerCase()}`}><Plus className="h-4 w-4" /></button>
      </div>
    </div>
  )
}

export function ShareEstimator() {
  const config = useConfig()
  const vehicles = config?.rateCard?.vehicles ?? []
  const [from, setFrom] = useState('colombo')
  const [to, setTo] = useState('ella')
  const [days, setDays] = useState(3)
  const [people, setPeople] = useState(4)
  const [code, setCode] = useState('VAN')
  const vehicle = vehicles.find((v) => v.code === code) ?? vehicles[0]
  const feePct = settingOf(config, 'fees.booking_fee_pct', 0)

  const result = useMemo(() => {
    if (!vehicle) return null
    const a = PLACES.find((p) => p.id === from)
    const b = PLACES.find((p) => p.id === to)
    const km = roadKm(a, b)
    const price = fixedRoutePrice({ km, days, nights: days - 1, returnKm: km, vehicle })
    return { km, price, share: shareOf(price.total, people, feePct) }
  }, [vehicle, from, to, days, people, feePct])

  const select = 'h-12 w-full rounded-2xl bg-surface px-4 font-semibold ring-1 ring-line outline-none focus:ring-2 focus:ring-brand'
  const tooMany = vehicle && people > vehicle.maxPassengers

  return (
    <section id="share" className="scroll-mt-24 bg-surface-2/60 py-24">
      <div className="wrap grid gap-12 lg:grid-cols-[1fr_1.05fr]">
        <div>
          <SectionTitle eyebrow="Before you sign up" title="What would my share be?" text="Pick two places and count your friends. The sum uses the same rate card drivers are held to." />
          <div className="mt-8 grid gap-4 sm:grid-cols-2">
            <label className="block"><span className="text-sm font-semibold">From</span>
              <select value={from} onChange={(e) => setFrom(e.target.value)} className={`${select} mt-1.5`}>{SORTED_PLACES.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</select>
            </label>
            <label className="block"><span className="text-sm font-semibold">To</span>
              <select value={to} onChange={(e) => setTo(e.target.value)} className={`${select} mt-1.5`}>{SORTED_PLACES.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</select>
            </label>
            <Stepper label="Days" value={days} onChange={setDays} min={1} max={21} />
            <Stepper label="People" value={people} onChange={setPeople} min={2} max={settingOf(config, 'trips.max_group', 30)} />
          </div>
          {vehicles.length > 0 && (
            <div className="mt-4 flex flex-wrap gap-2" role="radiogroup" aria-label="Vehicle">
              {vehicles.map((v) => (
                <button key={v.code} type="button" role="radio" aria-checked={v.code === vehicle?.code} onClick={() => setCode(v.code)} className={`rounded-full px-4 py-2 text-sm font-semibold transition ${v.code === vehicle?.code ? 'bg-ink text-bg' : 'bg-surface ring-1 ring-line hover:ring-ink/40'}`}>
                  {v.name} <span className="opacity-60">up to {v.maxPassengers}</span>
                </button>
              ))}
            </div>
          )}
        </div>

        {/* The answer, as a ticket */}
        <div className="relative self-start rounded-3xl bg-night p-7 text-white shadow-[0_40px_80px_-50px_rgba(21,23,74,0.9)] sm:p-9">
          {!result ? (
            <p className="text-white/70">The rate card is loading. If it stays empty, the website isn't connected to the Yaluwo server.</p>
          ) : (
            <>
              <p className="text-sm font-semibold text-white/60">Each person pays about</p>
              <p className="font-display mt-1 text-[clamp(2.4rem,6vw,4rem)] font-semibold leading-none tracking-[-0.04em] text-mango" aria-live="polite">{rs(Math.round(result.share.total))}</p>
              {tooMany && <p className="mt-3 rounded-xl bg-white/10 px-3 py-2 text-sm">A {vehicle.name.toLowerCase()} takes up to {vehicle.maxPassengers}. Choose a bigger vehicle for {people} people.</p>}
              <div className="perforation relative my-6 h-px"><div className="border-t-2 border-dashed border-white/20" /></div>
              <dl className="space-y-2 text-sm">
                <div className="flex justify-between gap-4"><dt className="text-white/65">Road distance, estimated</dt><dd className="font-semibold">{Math.round(result.km)} km</dd></div>
                <div className="flex justify-between gap-4"><dt className="text-white/65">{result.price.distance >= result.price.minimum ? `${Math.round(result.km)} km at ${rs(vehicle.ratePerKm)} a km` : `${days} ${days === 1 ? 'day' : 'days'} at the ${rs(vehicle.dayMinimum)} day minimum`}</dt><dd className="font-semibold">{rs(Math.round(result.price.base))}</dd></div>
                {result.price.allowance > 0 && <div className="flex justify-between gap-4"><dt className="text-white/65">Driver's {days - 1} {days === 2 ? 'night' : 'nights'} away</dt><dd className="font-semibold">{rs(Math.round(result.price.allowance))}</dd></div>}
                <div className="flex justify-between gap-4"><dt className="text-white/65">Driver's empty drive home at {vehicle.emptyReturnPct}%</dt><dd className="font-semibold">{rs(Math.round(result.price.empty))}</dd></div>
                <div className="flex justify-between gap-4 border-t border-white/15 pt-2"><dt className="text-white/65">Transport, suggested</dt><dd className="font-semibold">{rs(Math.round(result.price.total))}</dd></div>
                <div className="flex justify-between gap-4"><dt className="text-white/65">Your booking fee, {feePct}%</dt><dd className="font-semibold">{rs(Math.round(result.share.fee))}</dd></div>
              </dl>
              <p className="mt-6 text-xs leading-relaxed text-white/55">An estimate for transport only. When you plan a real trip the distance comes from Google Maps, and drivers may offer {settingOf(config, 'rates.band_min_pct', 70)}% to {settingOf(config, 'rates.band_max_pct', 130)}% of the suggested price.</p>
              <Link to="/trips/new" className={`${btn.accent} mt-6 w-full`}>Plan this trip</Link>
            </>
          )}
        </div>
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
          <Link to="/trips/new" className={`${btn.primary} !bg-night !text-white`}>Create a trip</Link>
          <Link to="/trips" className={btn.glass}>Find a trip</Link>
        </div>
      </div>
    </section>
  )
}
