import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { AnimatePresence, motion, useReducedMotion } from 'motion/react'
import { CalendarDays, MapPin, Plus, Search } from 'lucide-react'
import { DISTRICT_BY_ID, PLACES, PLACE_BY_ID, placeUrl } from '../lib/places'

const monthFmt = new Intl.DateTimeFormat('en-GB', { month: 'long', year: 'numeric' })
const NEXT_MONTHS = Array.from({ length: 12 }, (_, i) => {
  const d = new Date()
  d.setDate(1)
  d.setMonth(d.getMonth() + i)
  return { value: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`, label: monthFmt.format(d) }
})
export { NEXT_MONTHS }

// Six of the widest photos: the island in one glance (hills, rock fortress, coast, plains, temple, wildlife)
const SLIDES = ['nine-arch', 'sigiriya', 'mirissa', 'horton', 'temple-of-the-tooth', 'yala'].map((id) => PLACE_BY_ID[id]).filter((p) => p?.photos?.[0])
const SLIDE_MS = 7000

export function SearchBar({ className = '' }) {
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

  const field = 'w-full appearance-none bg-transparent text-[15px] font-semibold text-ink outline-none'
  return (
    <form onSubmit={submit} className={`grid gap-1 rounded-[28px] bg-surface p-2 shadow-[0_30px_80px_-30px_color-mix(in_oklab,var(--night)_55%,transparent)] ring-1 ring-line sm:grid-cols-[1.4fr_1fr_auto] ${className}`} role="search">
      <label className="flex items-center gap-3 rounded-[22px] px-4 py-2.5 transition hover:bg-surface-2">
        <MapPin className="h-5 w-5 shrink-0 text-brand" />
        <span className="flex min-w-0 flex-1 flex-col">
          <span className="text-xs font-medium text-muted">Where to</span>
          <select value={place} onChange={(e) => setPlace(e.target.value)} className={field}>
            <option value="">Anywhere in Sri Lanka</option>
            {[...PLACES].sort((a, b) => a.name.localeCompare(b.name)).map((p) => (
              <option key={p.id} value={p.name}>{p.name}</option>
            ))}
          </select>
        </span>
      </label>
      <label className="flex items-center gap-3 rounded-[22px] px-4 py-2.5 transition hover:bg-surface-2 sm:border-l sm:border-line">
        <CalendarDays className="h-5 w-5 shrink-0 text-brand" />
        <span className="flex min-w-0 flex-1 flex-col">
          <span className="text-xs font-medium text-muted">When</span>
          <select value={month} onChange={(e) => setMonth(e.target.value)} className={field}>
            <option value="">Any time</option>
            {NEXT_MONTHS.map((m) => <option key={m.value} value={m.value}>{m.label}</option>)}
          </select>
        </span>
      </label>
      <button type="submit" className="flex items-center justify-center gap-2 rounded-[22px] bg-ink px-7 py-3.5 font-semibold text-bg transition hover:opacity-90 active:scale-[0.98]">
        <Search className="h-5 w-5" /> Find trips
      </button>
    </form>
  )
}

// Full-screen photograph of a real place, slowly crossfading through the island.
// The caption says where each photo was taken and links to that place.
export default function Hero() {
  const reduce = useReducedMotion()
  const [i, setI] = useState(0)
  const [paused, setPaused] = useState(false)
  const slide = SLIDES[i]

  useEffect(() => {
    if (reduce || paused) return
    const t = setTimeout(() => setI((n) => (n + 1) % SLIDES.length), SLIDE_MS)
    return () => clearTimeout(t)
  }, [i, reduce, paused])

  // Load the next photo early so the crossfade never shows a blank frame
  useEffect(() => {
    const next = SLIDES[(i + 1) % SLIDES.length]
    const img = new Image()
    img.src = next.photos[0].src
  }, [i])

  return (
    <section className="relative" aria-label="Yaluwo">
      <div className="relative isolate flex min-h-[92svh] items-end overflow-hidden bg-night" onMouseEnter={() => setPaused(true)} onMouseLeave={() => setPaused(false)}>
        <AnimatePresence initial={false}>
          <motion.img
            key={slide.id}
            src={slide.photos[0].src}
            alt=""
            className="absolute inset-0 -z-10 h-full w-full object-cover"
            style={{ backgroundColor: slide.photos[0].c }}
            initial={{ opacity: 0, scale: reduce ? 1 : 1.08 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0 }}
            transition={{ opacity: { duration: 1.4, ease: 'easeInOut' }, scale: { duration: SLIDE_MS / 1000 + 1.4, ease: 'linear' } }}
          />
        </AnimatePresence>
        {/* Legibility: darker on the left and at the bottom, where the words are */}
        <div className="absolute inset-0 -z-10 bg-[linear-gradient(90deg,color-mix(in_oklab,var(--night)_72%,transparent)_0%,color-mix(in_oklab,var(--night)_35%,transparent)_45%,color-mix(in_oklab,var(--night)_5%,transparent)_75%)]" />
        <div className="absolute inset-x-0 bottom-0 -z-10 h-2/3 bg-[linear-gradient(0deg,color-mix(in_oklab,var(--night)_75%,transparent),transparent)]" />

        <div className="wrap pb-32 pt-36 sm:pb-36">
          <h1 className="font-display max-w-[13ch] text-[clamp(2.9rem,8.2vw,6.6rem)] font-bold leading-[0.92] tracking-[-0.03em] text-white [font-stretch:88%]">
            Travel Sri Lanka with people who travel like you.
          </h1>
          <p className="mt-6 max-w-[46ch] text-lg leading-relaxed text-white/85">
            Plan a route, fill the seats with verified people, and share one driver. Everyone pays only their own share.
          </p>
          <div className="mt-8 flex flex-wrap items-center gap-3">
            <Link to="/trips/new" className="inline-flex items-center gap-2 rounded-full bg-accent px-6 py-3.5 font-semibold text-on-accent transition hover:bg-accent-strong hover:text-white active:scale-[0.98]">
              <Plus className="h-5 w-5" /> Create a trip
            </Link>
            <Link to="/trips" className="inline-flex items-center gap-2 rounded-full bg-white/12 px-6 py-3.5 font-semibold text-white ring-1 ring-white/35 backdrop-blur-md transition hover:bg-white/20">
              Browse trips
            </Link>
          </div>
        </div>

        {/* Where this photo is, and which one of six */}
        <div className="absolute bottom-24 right-[var(--edge)] hidden max-w-xs text-right text-white sm:block">
          <Link to={placeUrl(slide)} className="group inline-block">
            <span className="block text-sm text-white/70">{DISTRICT_BY_ID[slide.district].name} District</span>
            <span className="font-display block text-2xl font-semibold group-hover:underline">{slide.name}</span>
          </Link>
          <div className="mt-3 flex justify-end gap-1.5">
            {SLIDES.map((s, n) => (
              <button key={s.id} onClick={() => setI(n)} aria-label={`Show ${s.name}`} aria-current={n === i} className="group relative h-1 w-8 overflow-hidden rounded-full bg-white/30">
                {n === i && (
                  <motion.span
                    key={`${s.id}-${paused}`}
                    className="absolute inset-y-0 left-0 bg-white"
                    initial={{ width: reduce || paused ? '100%' : '0%' }}
                    animate={{ width: '100%' }}
                    transition={{ duration: reduce || paused ? 0 : SLIDE_MS / 1000, ease: 'linear' }}
                  />
                )}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="relative z-10 mx-auto -mt-12 max-w-4xl px-4">
        <SearchBar />
      </div>
    </section>
  )
}
