import { useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { AnimatePresence, motion } from 'motion/react'
import { ArrowUpRight, Search, X } from 'lucide-react'
import DistrictMap from '../components/DistrictMap'
import { PlaceCard, Photo } from '../components/places'
import { Cover } from '../components/ui'
import { DISTRICTS, PLACES, coverOf, districtUrl, placesIn, searchPlaces } from '../lib/places'

const PROVINCES = ['All', ...[...new Set(DISTRICTS.map((d) => d.province))].sort()]

function DistrictCard({ district: d, active, onHover }) {
  const places = placesIn(d.id)
  const withPhotos = places.filter((p) => p.photos.length)
  const cover = coverOf(withPhotos[0])
  return (
    <motion.div layout initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} transition={{ duration: 0.3 }}>
      <Link
        to={districtUrl(d.id)}
        onMouseEnter={() => onHover(d.id)}
        onMouseLeave={() => onHover(null)}
        onFocus={() => onHover(d.id)}
        onBlur={() => onHover(null)}
        className={`group relative block aspect-[4/3] overflow-hidden rounded-3xl ring-1 transition ${active ? 'ring-2 ring-accent' : 'ring-line'}`}
      >
        {cover ? (
          <div className="absolute inset-0" style={{ backgroundColor: cover.c }}>
            <Photo photo={cover} alt={d.name} className="transition duration-700 group-hover:scale-105" />
          </div>
        ) : (
          <Cover kind="culture" alt={d.name} />
        )}
        <div className="absolute inset-0 bg-gradient-to-t from-black/75 via-black/10 to-transparent" />
        <div className="absolute inset-x-4 bottom-4 text-white">
          <p className="text-xs font-medium text-white/75">{d.province} Province</p>
          <div className="flex items-end justify-between gap-3">
            <h3 className="text-2xl font-extrabold tracking-tight">{d.name}</h3>
            <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-white text-[#0e1726] transition group-hover:bg-accent group-hover:text-on-accent">
              <ArrowUpRight className="h-4 w-4" />
            </span>
          </div>
          <p className="mt-1 text-sm text-white/85">
            {places.length} {places.length === 1 ? 'place' : 'places'}
          </p>
        </div>
      </Link>
    </motion.div>
  )
}

export default function DestinationsPage() {
  const navigate = useNavigate()
  const [hover, setHover] = useState(null)
  const [province, setProvince] = useState('All')
  const [query, setQuery] = useState('')

  const districts = useMemo(() => DISTRICTS.filter((d) => province === 'All' || d.province === province), [province])
  const found = useMemo(() => searchPlaces(query, 12), [query])
  const photoCount = PLACES.reduce((n, p) => n + p.photos.length, 0)

  return (
    <div className="wrap pb-16 pt-28">
      <div className="grid gap-10 lg:grid-cols-[minmax(320px,0.85fr)_1.15fr] lg:gap-14">
        {/* Map: sticky next to the list on large screens */}
        <div className="min-w-0 lg:sticky lg:top-24 lg:h-[calc(100vh-7rem)] lg:self-start">
          <div className="flex h-full flex-col">
            <h1 className="text-[clamp(2.4rem,4.6vw,3.8rem)] font-bold leading-[1]">Explore Sri Lanka, district by district</h1>
            <p className="mt-3 max-w-md text-muted">
              Tap a district to see its places. Select the ones you like, then plan a trip with them. {PLACES.length} places, {photoCount} photos.
            </p>
            <DistrictMap active={hover} onHover={setHover} onSelect={(id) => navigate(districtUrl(id))} className="mx-auto mt-6 aspect-[274/477] max-h-[62vh] w-full max-w-[380px] lg:mt-8 lg:max-h-none lg:min-h-0 lg:flex-1" />
          </div>
        </div>

        <div className="min-w-0">
          {/* Search across every place */}
          <div className="flex items-center gap-3 rounded-2xl bg-surface px-4 ring-1 ring-line transition focus-within:ring-2 focus-within:ring-brand">
            <Search className="h-5 w-5 text-muted" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search a place, district or 'Hiking'…"
              className="h-13 w-full bg-transparent text-sm font-medium outline-none placeholder:text-muted"
              aria-label="Search places"
            />
            {query && (
              <button onClick={() => setQuery('')} className="grid h-8 w-8 place-items-center rounded-full text-muted hover:bg-surface-2" aria-label="Clear search">
                <X className="h-4 w-4" />
              </button>
            )}
          </div>

          {query.trim() ? (
            <section className="mt-8">
              <h2 className="text-sm font-semibold text-muted">
                {found.length ? `${found.length} ${found.length === 1 ? 'place' : 'places'} found` : 'No places found. Try a district name.'}
              </h2>
              <div className="mt-4 grid gap-5 sm:grid-cols-2 2xl:grid-cols-3">
                <AnimatePresence mode="popLayout">
                  {found.map((p) => (
                    <PlaceCard key={p.id} place={p} showDistrict />
                  ))}
                </AnimatePresence>
              </div>
            </section>
          ) : (
            <section className="mt-6">
              <div className="scrollbar-none -mx-4 flex gap-2 overflow-x-auto px-4 pb-1">
                {PROVINCES.map((p) => (
                  <button
                    key={p}
                    onClick={() => setProvince(p)}
                    className={`shrink-0 rounded-full px-4 py-2 text-sm font-semibold transition ${province === p ? 'bg-ink text-bg' : 'bg-surface ring-1 ring-line hover:ring-ink/30'}`}
                  >
                    {p === 'All' ? 'All 25 districts' : p}
                  </button>
                ))}
              </div>
              <div className="mt-6 grid gap-5 sm:grid-cols-2 2xl:grid-cols-3">
                <AnimatePresence mode="popLayout">
                  {districts.map((d) => (
                    <DistrictCard key={d.id} district={d} active={hover === d.id} onHover={setHover} />
                  ))}
                </AnimatePresence>
              </div>
            </section>
          )}
        </div>
      </div>
    </div>
  )
}
