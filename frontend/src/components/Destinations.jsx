import { useRef } from 'react'
import { Link } from 'react-router-dom'
import { motion } from 'motion/react'
import { ArrowLeft, ArrowRight, ArrowUpRight } from 'lucide-react'
import { SectionTitle } from './ui'
import { PickButton, PlaceCover } from './places'
import { describeWeather, useLiveWeather } from '../hooks/useLiveWeather'
import { DISTRICT_BY_ID, FEATURED, placeUrl } from '../lib/places'

function PlaceCard({ place: p, weather, offline, trips }) {
  const info = weather ? describeWeather(weather.code) : null
  return (
    <motion.div whileHover={{ y: -6 }} className="relative shrink-0 snap-start">
      <Link to={placeUrl(p)} className="group relative block aspect-[3/4] w-[72vw] max-w-[280px] overflow-hidden rounded-3xl">
        <PlaceCover place={p} className="transition duration-700 group-hover:scale-110" />
        {info?.rain && <div className="rain absolute inset-0" />}
        {info?.mist && <div className="mist absolute inset-0" />}
        <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-transparent to-transparent" />

        <div className="absolute left-3 top-3 flex items-center gap-1.5 rounded-full bg-black/30 px-3 py-1.5 text-xs font-semibold text-white backdrop-blur-md">
          {info ? (
            <>
              <info.Icon className="h-3.5 w-3.5" /> {weather.temp}° · {info.label}
            </>
          ) : offline ? (
            'Weather unavailable'
          ) : (
            'Loading weather…'
          )}
        </div>

        <div className="absolute inset-x-4 bottom-4 text-white">
          <p className="text-xs font-medium text-white/70">{DISTRICT_BY_ID[p.district].name} District</p>
          <h3 className="text-2xl font-extrabold tracking-tight">{p.name}</h3>
          <div className="mt-2 flex items-center justify-between">
            <span className="text-sm text-white/85">{trips === 0 ? 'No trips yet' : `${trips} ${trips === 1 ? 'trip' : 'trips'}`}</span>
            <span className="grid h-9 w-9 place-items-center rounded-full bg-white text-[#0e1726] transition group-hover:bg-accent group-hover:text-on-accent">
              <ArrowUpRight className="h-4 w-4" />
            </span>
          </div>
        </div>
      </Link>
      <PickButton place={p} size="sm" className="absolute right-3 top-3" />
    </motion.div>
  )
}

export default function Destinations({ trips }) {
  const { data, error } = useLiveWeather(FEATURED)
  const row = useRef(null)
  const scroll = (dir) => row.current?.scrollBy({ left: dir * 320, behavior: 'smooth' })
  const countFor = (name) => trips.filter((t) => t.stops.some((s) => s.name === name)).length

  return (
    <section id="places" className="scroll-mt-24 py-20">
      <div className="wrap flex items-end justify-between gap-6">
        <div>
          <SectionTitle eyebrow="Destinations" title="Where the island is calling" text="Weather on each card is live from that place right now. Select places you like and plan a trip with them." />
          <Link to="/places" className="mt-5 inline-flex items-center gap-1.5 font-semibold text-brand hover:underline">
            Explore all 25 districts <ArrowRight className="h-4 w-4" />
          </Link>
        </div>
        <div className="hidden gap-2 md:flex">
          {[
            [-1, ArrowLeft],
            [1, ArrowRight],
          ].map(([dir, Icon]) => (
            <button key={dir} onClick={() => scroll(dir)} className="grid h-11 w-11 place-items-center rounded-full bg-surface ring-1 ring-line transition hover:bg-brand hover:text-on-brand" aria-label={dir < 0 ? 'Previous' : 'Next'}>
              <Icon className="h-5 w-5" />
            </button>
          ))}
        </div>
      </div>
      <div ref={row} className="scrollbar-none mt-10 flex snap-x snap-mandatory gap-4 overflow-x-auto px-[var(--edge)] pb-4 scroll-px-[var(--edge)]">
        {FEATURED.map((p) => (
          <PlaceCard key={p.id} place={p} weather={data[p.id]} offline={error} trips={countFor(p.name)} />
        ))}
      </div>
    </section>
  )
}
