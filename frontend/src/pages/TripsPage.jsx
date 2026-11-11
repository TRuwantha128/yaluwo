import { useSearchParams } from 'react-router-dom'
import { CalendarDays, Search, X } from 'lucide-react'
import TripCard from '../components/TripCard'
import EmptyTrips from '../components/EmptyTrips'
import PageHero from '../components/PageHero'
import { useTrips } from '../hooks/useTrips'
import { useConfig } from '../config/useConfig'
import { NEXT_MONTHS } from '../lib/format'

const SORTS = {
  soonest: (a, b) => (a.startDate || '9999').localeCompare(b.startDate || '9999'),
  newest: (a, b) => String(b.createdAt ?? '').localeCompare(String(a.createdAt ?? '')),
  cheapest: (a, b) => (a.price ?? Infinity) - (b.price ?? Infinity),
}

export default function TripsPage() {
  const { trips, loading } = useTrips()
  const config = useConfig()
  const TAGS = config?.lists?.TRIP_TAG?.map((t) => t.label_en) ?? []
  const [params, setParams] = useSearchParams()
  const place = params.get('place') ?? ''
  const month = params.get('month') ?? ''
  const tag = params.get('tag') ?? ''
  const women = params.get('women') === '1'
  const sort = params.get('sort') ?? 'soonest'

  const set = (key, value) => {
    const next = new URLSearchParams(params)
    value ? next.set(key, value) : next.delete(key)
    setParams(next, { replace: true })
  }

  const q = place.trim().toLowerCase()
  const results = trips
    .filter((t) => !q || t.title.toLowerCase().includes(q) || t.stops.some((s) => s.name.toLowerCase().includes(q)))
    .filter((t) => !month || t.startDate?.startsWith(month))
    .filter((t) => !tag || t.tags.includes(tag))
    .filter((t) => !women || t.womenOnly)
    .sort(SORTS[sort])

  const filtered = place || month || tag || women

  return (
    <div className="pb-20">
      <PageHero place="horton" title="Find a trip" text="Search by any place on the route, not just where it ends.">
      <div className="grid gap-2 rounded-[28px] bg-surface p-2 shadow-[0_30px_80px_-30px_color-mix(in_oklab,var(--night)_50%,transparent)] ring-1 ring-line md:grid-cols-[1.5fr_1fr_auto]">
        <label className="flex items-center gap-3 rounded-2xl bg-surface-2 px-4">
          <Search className="h-5 w-5 text-muted" />
          <input value={place} onChange={(e) => set('place', e.target.value)} placeholder="Ella, Kandy, Mirissa…" className="h-12 w-full bg-transparent text-sm font-medium outline-none placeholder:text-muted" />
          {place && (
            <button onClick={() => set('place', '')} aria-label="Clear">
              <X className="h-4 w-4 text-muted" />
            </button>
          )}
        </label>
        <label className="flex items-center gap-3 rounded-2xl bg-surface-2 px-4">
          <CalendarDays className="h-5 w-5 text-muted" />
          <select value={month} onChange={(e) => set('month', e.target.value)} className="h-12 w-full bg-transparent text-sm font-medium outline-none">
            <option value="">Any time</option>
            {NEXT_MONTHS.map((m) => (
              <option key={m.value} value={m.value}>
                {m.label}
              </option>
            ))}
          </select>
        </label>
        <select value={sort} onChange={(e) => set('sort', e.target.value)} className="h-12 rounded-2xl bg-surface-2 px-4 text-sm font-semibold outline-none">
          <option value="soonest">Soonest first</option>
          <option value="newest">Newest</option>
          <option value="cheapest">Cheapest</option>
        </select>
      </div>
      </PageHero>

      <div className="wrap">
      <div className="scrollbar-none mt-6 flex gap-2 overflow-x-auto pb-1">
        <button onClick={() => set('women', women ? '' : '1')} className={`shrink-0 rounded-full px-4 py-2 text-sm font-medium transition ${women ? 'bg-ink text-bg' : 'bg-surface ring-1 ring-line hover:ring-ink/30'}`}>
          Women only
        </button>
        {TAGS.map((t) => (
          <button key={t} onClick={() => set('tag', tag === t ? '' : t)} className={`shrink-0 rounded-full px-4 py-2 text-sm font-medium transition ${tag === t ? 'bg-ink text-bg' : 'bg-surface ring-1 ring-line hover:ring-ink/30'}`}>
            {t}
          </button>
        ))}
      </div>

      <p className="mt-8 text-sm font-semibold text-muted">
        {loading ? 'Loading…' : `${results.length} ${results.length === 1 ? 'trip' : 'trips'}`}
        {filtered && results.length !== trips.length && (
          <button onClick={() => setParams({}, { replace: true })} className="ml-3 text-brand hover:underline">
            Clear filters
          </button>
        )}
      </p>

      <div className="mt-4">
        {!loading && results.length === 0 ? (
          trips.length === 0 ? (
            <EmptyTrips />
          ) : (
            <EmptyTrips title="No trips match" text="Try another place or month, or create this trip yourself." />
          )
        ) : (
          <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4">
            {results.map((t) => (
              <TripCard key={t.id} trip={t} />
            ))}
          </div>
        )}
      </div>
      </div>
    </div>
  )
}
