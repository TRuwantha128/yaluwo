import { useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { motion, useMotionValue, useMotionValueEvent, useReducedMotion, useScroll, useTransform } from 'motion/react'
import { ArrowDown, ArrowUpRight, Plus } from 'lucide-react'
import { DISTRICT_BY_ID, PLACE_BY_ID, placeUrl } from '../lib/places'
import { scrollToY } from '../lib/smoothScroll'
import { btn } from './ui'

// The first screen: scrolling flies through your place photos in 3D.
// Change the places (and which of their photos) here. x and y are where each
// photo sits on screen (in % of the screen), w is its width.
const SHOTS = [
  { id: 'nine-arch', n: 0, x: 25, y: -2, w: 42 },
  { id: 'sigiriya', n: 0, x: -24, y: 4, w: 36 },
  { id: 'mirissa', n: 0, x: 24, y: -6, w: 42 },
  { id: 'temple-of-the-tooth', n: 0, x: -22, y: -4, w: 40 },
  { id: 'horton', n: 0, x: 24, y: 6, w: 40 },
  { id: 'arugam', n: 0, x: -24, y: 2, w: 38 },
  { id: 'galle', n: 0, x: 22, y: -4, w: 42 },
  { id: 'yala', n: 0, x: -22, y: 5, w: 40 },
  { id: 'pigeon-island', n: 0, x: 24, y: -2, w: 38 },
  { id: 'knuckles', n: 0, x: -20, y: 0, w: 44 },
].map((s) => ({ ...s, place: PLACE_BY_ID[s.id], photo: PLACE_BY_ID[s.id]?.photos[s.n] })).filter((s) => s.photo)

const GAP = 800 // depth between photos (px)
const START = -350 // depth of the first photo when the page opens
const GONE = 650 // a photo has flown past the camera at this depth
// Every photo has passed by 85% of the scroll, leaving the end screen clear
const TRAVEL = (GONE - START + (SHOTS.length - 1) * GAP) / 0.85

function Shot({ shot, i, progress, small }) {
  const z = useTransform(progress, (p) => START - i * GAP + p * TRAVEL)
  const depthOpacity = useTransform(z, [-5200, -2600, 150, GONE], [0, 1, 1, 0])
  // Photos behind the headline wait until it has faded, so the text stays easy to read
  const opacity = useTransform([depthOpacity, progress], ([o, p]) => (i === 0 ? o : o * Math.min(1, Math.max(0, (p - 0.03) / 0.05))))
  const blur = useTransform(z, [-5200, -3000, 0], [5, 0, 0])
  const filter = useTransform(blur, (b) => `blur(${b}px)`)
  const transform = useTransform(z, (v) => `translate(-50%, -50%) translate3d(${shot.x * (small ? 0.4 : 1)}vw, ${shot.y}vh, ${v}px)`)
  const [near, setNear] = useState(false)
  useMotionValueEvent(z, 'change', (v) => setNear(v > -1400 && v < 400))
  const ratio = shot.photo.w / shot.photo.h

  return (
    <motion.div style={{ transform, opacity, filter }} className={`absolute left-1/2 top-1/2 will-change-transform ${near ? '' : 'pointer-events-none'}`}>
      <Link
        to={placeUrl(shot.place)}
        tabIndex={near ? 0 : -1}
        className="group relative block overflow-hidden rounded-2xl shadow-[0_30px_90px_rgba(0,0,0,0.35)] ring-1 ring-black/5"
        style={{ width: `${small ? 82 : shot.w}vw`, aspectRatio: Math.max(1.2, Math.min(ratio, 1.8)), backgroundColor: shot.photo.c }}
      >
        <img src={shot.photo.src} alt={shot.place.name} loading={i < 3 ? 'eager' : 'lazy'} decoding="async" className="h-full w-full object-cover" />
        <span className="absolute inset-x-0 bottom-0 flex items-end justify-between gap-3 bg-gradient-to-t from-black/70 to-transparent p-4 pt-12 text-white">
          <span>
            <span className="block text-[11px] font-semibold uppercase tracking-wider text-white/70">{DISTRICT_BY_ID[shot.place.district].name} District</span>
            <span className="block text-lg font-extrabold leading-tight md:text-2xl">{shot.place.name}</span>
          </span>
          <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-white text-[#0e1726] transition group-hover:bg-accent group-hover:text-on-accent">
            <ArrowUpRight className="h-4 w-4" />
          </span>
        </span>
      </Link>
    </motion.div>
  )
}

function Headline({ className = '' }) {
  return (
    <h1 className={`max-w-4xl text-[clamp(2.5rem,6.4vw,5.6rem)] font-extrabold leading-[0.98] tracking-[-0.04em] ${className}`}>Travel Sri Lanka with people who travel like you.</h1>
  )
}

// Visitors who turn off animations get the headline and a grid of photos
function StillIntro() {
  return (
    <section className="mx-auto max-w-6xl px-4 pb-10 pt-32">
      <Headline />
      <div className="mt-8 flex flex-wrap gap-3">
        <Link to="/trips/new" className={btn.primary}>
          <Plus className="h-5 w-5" /> Create a trip
        </Link>
        <Link to="/places" className={btn.ghost}>
          Explore destinations
        </Link>
      </div>
      <div className="mt-10 grid grid-cols-2 gap-3 md:grid-cols-5">
        {SHOTS.map((s) => (
          <Link key={s.id} to={placeUrl(s.place)} className="relative aspect-[4/5] overflow-hidden rounded-2xl" style={{ backgroundColor: s.photo.c }}>
            <img src={s.photo.sm} alt={s.place.name} loading="lazy" className="h-full w-full object-cover" />
            <span className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/70 to-transparent p-3 pt-10 text-sm font-bold text-white">{s.place.name}</span>
          </Link>
        ))}
      </div>
    </section>
  )
}

export default function PhotoIntro() {
  const reduce = useReducedMotion()
  const section = useRef(null)
  const { scrollYProgress } = useScroll({ target: section, offset: ['start start', 'end end'] })
  // Copy into our own value so every transform follows the real scroll position
  const progress = useMotionValue(0)
  useMotionValueEvent(scrollYProgress, 'change', (v) => progress.set(v))
  const small = typeof window !== 'undefined' && window.matchMedia('(max-width: 768px)').matches

  const introOpacity = useTransform(progress, [0, 0.07], [1, 0])
  const introY = useTransform(progress, [0, 0.07], ['0vh', '-6vh'])
  const endOpacity = useTransform(progress, [0.86, 0.95], [0, 1])
  const endY = useTransform(progress, [0.86, 0.95], ['4vh', '0vh'])
  const bar = useTransform(progress, [0, 1], ['0%', '100%'])
  const stageFade = useTransform(progress, [0.97, 1], [1, 0.0])

  if (reduce) return <StillIntro />

  const skip = () => {
    const el = section.current
    if (el) scrollToY(el.offsetTop + el.offsetHeight - window.innerHeight * 0.2)
  }

  return (
    <section ref={section} className="relative h-[520vh] bg-bg" aria-label="Photos of places in Sri Lanka">
      <motion.div style={{ opacity: stageFade }} className="sticky top-0 h-screen overflow-hidden">
        {/* Soft light behind the photos */}
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_50%_45%,color-mix(in_oklab,var(--brand)_22%,transparent),transparent_62%)]" />
        <div className="absolute inset-0" style={{ perspective: '1000px', perspectiveOrigin: '50% 48%' }}>
          <div className="absolute inset-0" style={{ transformStyle: 'preserve-3d' }}>
            {SHOTS.map((s, i) => (
              <Shot key={s.id} shot={s} i={i} progress={progress} small={small} />
            ))}
          </div>
        </div>

        <motion.div style={{ opacity: introOpacity, y: introY }} className="pointer-events-none absolute inset-0 flex flex-col justify-end bg-gradient-to-t from-bg via-bg/80 to-transparent md:bg-none md:bg-[linear-gradient(90deg,var(--bg)_0%,color-mix(in_oklab,var(--bg)_82%,transparent)_32%,transparent_52%)] md:pr-[40vw] px-4 pb-14 md:px-[max(1rem,calc((100vw-72rem)/2+1rem))] md:pb-20">
          <Headline />
          <p className="mt-4 max-w-xl text-lg text-muted">Plan a route, fill the seats with verified people, and book drivers and stays in one place.</p>
          <div className="pointer-events-auto mt-7 flex flex-wrap items-center gap-3">
            <Link to="/trips/new" className={btn.accent}>
              <Plus className="h-5 w-5" /> Create a trip
            </Link>
            <Link to="/trips" className={btn.ghost}>
              Browse trips
            </Link>
            <button onClick={skip} className="px-3 py-3 text-sm font-semibold text-muted hover:text-ink">
              Skip
            </button>
          </div>
          <p className="mt-8 flex items-center gap-2 text-sm text-muted">
            <ArrowDown className="h-4 w-4 animate-bounce" /> Scroll to fly through the island
          </p>
        </motion.div>

        <motion.div style={{ opacity: endOpacity, y: endY }} className="absolute inset-0 grid place-items-center px-4 text-center">
          <div>
            <p className="text-sm font-semibold uppercase tracking-[0.2em] text-brand">25 districts · 89 places with photos</p>
            <h2 className="mx-auto mt-4 max-w-3xl text-[clamp(2.2rem,5vw,4.2rem)] font-extrabold leading-[1.02] tracking-[-0.035em]">Pick the places. We'll help you find the people.</h2>
            <div className="mt-8 flex flex-wrap justify-center gap-3">
              <Link to="/places" className={btn.accent}>
                Explore destinations <ArrowUpRight className="h-5 w-5" />
              </Link>
              <Link to="/trips/new" className={btn.ghost}>
                <Plus className="h-5 w-5" /> Create a trip
              </Link>
            </div>
          </div>
        </motion.div>

        <div className="absolute inset-x-0 bottom-0 h-1 bg-line">
          <motion.div style={{ width: bar }} className="h-full bg-accent" />
        </div>
      </motion.div>
    </section>
  )
}
