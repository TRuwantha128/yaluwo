import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { useReducedMotion } from 'motion/react'
import { ChevronDown, MapPin, Search } from 'lucide-react'
import { btn } from '../ui'
import { DISTRICT_BY_ID, PLACE_BY_ID, placeUrl } from '../../lib/places'

// The first screen: Sri Lanka itself, in the site's own photos, one at a time.
// To change the pictures, edit this list: [place id, photo number (1 = first)].
const SLIDES = [
  ['mirissa', 1],
  ['nine-arch', 1],
  ['sigiriya', 1],
  ['arugam', 1],
  ['mirissa', 2],
  ['horton', 2],
]
  .map(([id, n]) => ({ place: PLACE_BY_ID[id], photo: PLACE_BY_ID[id]?.photos?.[n - 1] }))
  .filter((s) => s.photo)

const HOLD = 6500 // how long each photo stays, in ms

export default function PhotoHero() {
  const reduce = useReducedMotion()
  const [i, setI] = useState(0)
  const [paused, setPaused] = useState(false)
  useEffect(() => {
    if (reduce || paused || SLIDES.length < 2) return
    const t = setTimeout(() => setI((n) => (n + 1) % SLIDES.length), HOLD)
    return () => clearTimeout(t)
  }, [i, reduce, paused])
  const current = SLIDES[i]

  return (
    <section className="relative isolate flex min-h-[100svh] flex-col justify-end overflow-hidden bg-night text-white" onMouseEnter={() => setPaused(true)} onMouseLeave={() => setPaused(false)}>
      {SLIDES.map((s, n) => (
        <img
          key={s.photo.src}
          src={s.photo.src}
          alt=""
          // the first photo loads at once; the rest wait their turn
          loading={n === 0 ? 'eager' : 'lazy'}
          fetchPriority={n === 0 ? 'high' : 'auto'}
          className={`absolute inset-0 -z-20 h-full w-full object-cover transition-opacity duration-[1600ms] ease-in-out ${n === i ? 'opacity-100' : 'opacity-0'} ${n === i && !reduce ? 'hero-drift' : ''}`}
          style={{ backgroundColor: s.photo.c }}
        />
      ))}
      {/* Darker at the bottom and the left, where the words are */}
      <div className="absolute inset-0 -z-10 bg-[linear-gradient(0deg,rgba(21,23,74,0.92)_0%,rgba(21,23,74,0.45)_38%,rgba(21,23,74,0.05)_70%),linear-gradient(90deg,rgba(21,23,74,0.5)_0%,transparent_60%)]" />

      <div className="wrap pb-10 pt-40">
        <p className="font-sinhala text-xl font-semibold text-mango" lang="si">යාළුවෝ <span className="font-sans text-sm font-medium text-white/75">means friends</span></p>
        <h1 className="mt-4 max-w-[14ch] text-[clamp(2.5rem,6.6vw,5.6rem)] !leading-[1] text-white">Sri Lanka is better with a full van.</h1>
        <p className="mt-6 max-w-xl text-lg leading-relaxed text-white/85 md:text-xl">Plan a route, fill the seats with verified travellers, book a driver and pay only your share.</p>
        <div className="mt-8 flex flex-wrap gap-3">
          <Link to="/#plan" className={`${btn.accent} !px-7 !py-3.5 text-lg`}><MapPin className="h-5 w-5" /> Plan a route on the map</Link>
          <Link to="/trips" className={`${btn.glass} !px-7 !py-3.5 text-lg`}><Search className="h-5 w-5" /> Find a trip</Link>
        </div>

        <div className="mt-14 flex flex-wrap items-end justify-between gap-6">
          {/* Which photo this is, and the others */}
          <div className="flex items-center gap-2" role="tablist" aria-label="Photos">
            {SLIDES.map((s, n) => (
              <button key={s.photo.src} role="tab" aria-selected={n === i} aria-label={s.place.name} onClick={() => setI(n)} className="group py-3">
                <span className={`block h-1 rounded-full transition-all duration-500 ${n === i ? 'w-12 bg-mango' : 'w-6 bg-white/40 group-hover:bg-white/70'}`} />
              </button>
            ))}
          </div>
          <Link to={placeUrl(current.place)} className="group text-right">
            <span className="font-display block text-lg font-semibold tracking-tight group-hover:text-mango">{current.place.name}</span>
            <span className="block text-sm text-white/70">{DISTRICT_BY_ID[current.place.district].name} District</span>
          </Link>
        </div>
      </div>
      <Link to="/#plan" className="absolute bottom-3 left-1/2 hidden -translate-x-1/2 text-white/60 hover:text-white md:block" aria-label="Go to the map"><ChevronDown className="h-6 w-6 animate-bounce" /></Link>
    </section>
  )
}
