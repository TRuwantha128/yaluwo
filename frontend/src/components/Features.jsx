import { Car, CloudRain, HeartHandshake, RefreshCw, ShieldCheck, Wallet } from 'lucide-react'
import { PLACE_BY_ID } from '../lib/places'

const FEATURES = [
  { icon: ShieldCheck, title: 'Everyone is verified', text: 'National ID and a live selfie are checked before anyone can join or host a trip.' },
  { icon: HeartHandshake, title: 'Travel-style match', text: 'A short quiz on budget, pace, food and sleep shows how well you fit each group.' },
  { icon: Wallet, title: 'Pay only your share', text: 'Each person pays their own part. Yaluwo holds it until the trip is done.' },
  { icon: RefreshCw, title: 'Drop-out protection', text: 'If someone cancels, the seat reopens and the shares are worked out again.' },
  { icon: Car, title: 'Drivers you can see', text: 'Licence, vehicle photos and reviews from verified trips, before you book.' },
  { icon: CloudRain, title: 'Monsoon aware', text: 'Weather for every stop on your route, so you can plan around the rain.' },
]

const ROUTE = [['Colombo', 0], ['Kandy', 2], ['Ella', 2], ['Arugam Bay', 3]]

export default function Features() {
  const img = PLACE_BY_ID.ella?.photos?.[0] ?? PLACE_BY_ID['nine-arch'].photos[0]
  return (
    <section id="why" className="wrap scroll-mt-24 py-20 md:py-28">
      <div className="grid gap-12 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)] lg:gap-20">
        {/* One route, shown the way a trip page shows it */}
        <div className="relative isolate flex min-h-[460px] flex-col justify-end overflow-hidden rounded-[32px] p-7 text-white md:p-10" style={{ backgroundColor: img.c }}>
          <img src={img.src} alt="" loading="lazy" className="absolute inset-0 -z-10 h-full w-full object-cover" />
          <div className="absolute inset-0 -z-10 bg-[linear-gradient(0deg,color-mix(in_oklab,var(--night)_88%,transparent)_10%,color-mix(in_oklab,var(--night)_25%,transparent)_70%)]" />
          <p className="text-sm text-white/75">A route with many stops</p>
          <p className="font-display mt-1 text-3xl font-bold">Colombo to Arugam Bay</p>
          <ol className="mt-6 space-y-0">
            {ROUTE.map(([name, nights], i) => (
              <li key={name} className="relative flex items-center gap-4 pb-4 last:pb-0">
                {i < ROUTE.length - 1 && <span className="absolute left-[11px] top-6 h-[calc(100%-12px)] border-l-2 border-dotted border-white/50" />}
                <span className={`relative grid h-6 w-6 place-items-center rounded-full text-[11px] font-bold ${i === 0 || i === ROUTE.length - 1 ? 'bg-accent text-white' : 'bg-white text-night'}`}>{i + 1}</span>
                <span className="font-semibold">{name}</span>
                {nights > 0 && <span className="text-sm text-white/70">{nights} nights</span>}
              </li>
            ))}
          </ol>
        </div>

        <div>
          <h2 className="max-w-[16ch] text-[clamp(2rem,4.2vw,3.4rem)] font-bold leading-[1.02]">Everything a group trip needs</h2>
          <p className="mt-4 max-w-[52ch] text-lg leading-relaxed text-muted">Built for travelling with people you haven't met yet, safely, and without arguing about money.</p>
          <ul className="mt-10 grid gap-x-10 gap-y-8 sm:grid-cols-2">
            {FEATURES.map(({ icon: Icon, title, text }) => (
              <li key={title}>
                <Icon className="h-6 w-6 text-brand" strokeWidth={1.8} />
                <h3 className="mt-3 text-lg font-bold">{title}</h3>
                <p className="mt-1 leading-relaxed text-muted">{text}</p>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </section>
  )
}
