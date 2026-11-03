import { Link, useNavigate } from 'react-router-dom'
import { ArrowRight, Plus } from 'lucide-react'
import { PLACE_BY_ID } from '../lib/places'
import { tripPicks } from '../hooks/useTripPicks'

// Ready-made routes: one click fills the trip planner with these stops
const ROUTES = [
  { title: 'Hill country by train', stops: ['kandy', 'nuwara', 'ella'], photo: 'nine-arch', days: '4–5 days' },
  { title: 'South coast beaches', stops: ['galle', 'unawatuna', 'mirissa', 'tangalle'], photo: 'mirissa', days: '4–6 days' },
  { title: 'Ancient cities', stops: ['dambulla', 'sigiriya', 'polonnaruwa'], photo: 'sigiriya', days: '3–4 days' },
]

export function StarterRoutes({ className = '' }) {
  const navigate = useNavigate()
  const start = (r) => {
    tripPicks.set(r.stops.map((id) => PLACE_BY_ID[id]).filter(Boolean))
    navigate('/trips/new?from=picks')
  }
  return (
    <div className={`grid gap-5 md:grid-cols-3 ${className}`}>
      {ROUTES.map((r) => {
        const img = PLACE_BY_ID[r.photo]?.photos?.[0]
        const names = r.stops.map((id) => PLACE_BY_ID[id]?.name).filter(Boolean)
        return (
          <button key={r.title} onClick={() => start(r)} className="group relative isolate flex aspect-[4/5] flex-col justify-end overflow-hidden rounded-[28px] p-6 text-left text-white sm:aspect-[5/4] md:aspect-[4/5]" style={{ backgroundColor: img?.c }}>
            {img && <img src={img.sm} alt="" loading="lazy" className="absolute inset-0 -z-10 h-full w-full object-cover transition duration-700 group-hover:scale-105" />}
            <span className="absolute inset-0 -z-10 bg-[linear-gradient(0deg,color-mix(in_oklab,var(--night)_85%,transparent)_0%,color-mix(in_oklab,var(--night)_20%,transparent)_55%,transparent)]" />
            <span className="text-sm text-white/75">{r.days}</span>
            <span className="font-display mt-1 text-2xl font-bold leading-tight">{r.title}</span>
            <span className="mt-3 text-sm text-white/85">{names.join(' → ')}</span>
            <span className="mt-5 inline-flex w-fit items-center gap-2 rounded-full bg-white px-4 py-2 text-sm font-semibold text-night transition group-hover:bg-accent group-hover:text-white">
              Plan this route <ArrowRight className="h-4 w-4" />
            </span>
          </button>
        )
      })}
    </div>
  )
}

export default function EmptyTrips({ title = 'No open trips yet', text = 'Be the first: start from one of these routes, or plan your own.', action = true }) {
  return (
    <div>
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h3 className="font-display text-2xl font-bold">{title}</h3>
          <p className="mt-1 text-muted">{text}</p>
        </div>
        {action && (
          <Link to="/trips/new" className="inline-flex items-center gap-2 rounded-full bg-ink px-5 py-3 text-sm font-semibold text-bg transition hover:opacity-90">
            <Plus className="h-4 w-4" /> Plan your own route
          </Link>
        )}
      </div>
      <StarterRoutes className="mt-8" />
    </div>
  )
}
