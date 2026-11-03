import { Link } from 'react-router-dom'
import { Car, Check, Hotel, Plus } from 'lucide-react'
import { PLACE_BY_ID } from '../lib/places'

export function Partners() {
  return (
    <section id="partners" className="wrap scroll-mt-24 pb-20">
      <div className="grid gap-5 md:grid-cols-2">
        <div className="rounded-[32px] bg-brand p-8 text-on-brand md:p-12">
          <Car className="h-7 w-7" strokeWidth={1.8} />
          <h3 className="font-display mt-6 max-w-[16ch] text-3xl font-bold leading-tight md:text-4xl">Drive groups, and never drive home empty</h3>
          <ul className="mt-6 space-y-2.5 opacity-90">
            {['Send price offers on open trips near you', 'Get paid after every trip, by bank transfer', 'Your licence and vehicle are checked once'].map((p) => (
              <li key={p} className="flex items-start gap-2.5"><Check className="mt-0.5 h-5 w-5 shrink-0" /> {p}</li>
            ))}
          </ul>
          <Link to="/signup" className="mt-8 inline-flex items-center gap-2 rounded-full bg-white px-5 py-3 text-sm font-semibold text-night transition hover:bg-white/90">
            Drive with Yaluwo
          </Link>
        </div>
        <div className="rounded-[32px] bg-surface p-8 ring-1 ring-line md:p-12">
          <Hotel className="h-7 w-7 text-brand" strokeWidth={1.8} />
          <h3 className="font-display mt-6 max-w-[16ch] text-3xl font-bold leading-tight md:text-4xl">Hotels and cabanas: fill tonight's empty rooms</h3>
          <ul className="mt-6 space-y-2.5 text-muted">
            {['Offers to groups passing nearby', 'Bookings from verified travellers only', 'Room photos and reviews on your page'].map((p) => (
              <li key={p} className="flex items-start gap-2.5"><Check className="mt-0.5 h-5 w-5 shrink-0 text-brand" /> {p}</li>
            ))}
          </ul>
          <p className="mt-8 text-sm font-medium text-muted">Hotel sign-up opens in the next update.</p>
        </div>
      </div>
    </section>
  )
}

export function FinalCta() {
  const img = PLACE_BY_ID.mirissa?.photos?.[1] ?? PLACE_BY_ID.mirissa.photos[0]
  return (
    <section className="relative isolate overflow-hidden" style={{ backgroundColor: img.c }}>
      <img src={img.src} alt="" loading="lazy" className="absolute inset-0 -z-10 h-full w-full object-cover" />
      <div className="absolute inset-0 -z-10 bg-[linear-gradient(90deg,color-mix(in_oklab,var(--night)_85%,transparent)_0%,color-mix(in_oklab,var(--night)_45%,transparent)_60%,color-mix(in_oklab,var(--night)_20%,transparent))]" />
      <div className="wrap py-24 text-white md:py-36">
        <h2 className="max-w-[14ch] text-[clamp(2.4rem,6vw,4.8rem)] font-bold leading-[0.96]">Got a route in mind? Find people to share it.</h2>
        <p className="mt-5 max-w-[44ch] text-lg text-white/85">Plan every stop in a couple of minutes and publish it. You choose who comes.</p>
        <div className="mt-9 flex flex-wrap gap-3">
          <Link to="/trips/new" className="inline-flex items-center gap-2 rounded-full bg-accent px-6 py-3.5 font-semibold text-on-accent transition hover:bg-accent-strong hover:text-white">
            <Plus className="h-5 w-5" /> Create a trip
          </Link>
          <Link to="/trips" className="inline-flex items-center gap-2 rounded-full bg-white/12 px-6 py-3.5 font-semibold ring-1 ring-white/35 backdrop-blur-md transition hover:bg-white/20">
            Browse trips
          </Link>
        </div>
      </div>
    </section>
  )
}
