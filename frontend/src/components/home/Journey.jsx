import { Suspense, lazy, useEffect, useMemo, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { AnimatePresence, motion, useMotionValue, useMotionValueEvent, useReducedMotion, useScroll } from 'motion/react'
import { BadgeCheck, Check, ChevronDown, Lock, Plus, Search } from 'lucide-react'
import { Avatar, btn } from '../ui'
import { rs } from '../../lib/format'
import { fixedRoutePrice, shareOf } from '../../lib/fare'
import { COAST } from '../../lib/coast'
import { JOURNEY_KM, JOURNEY_NIGHTS, JOURNEY_PATH, JOURNEY_RETURN_KM, JOURNEY_STOPS, JOURNEY_TOTAL_KM, storyAt } from '../../lib/journey'
import { settingOf, useConfig } from '../../config/useConfig'

const JourneyScene = lazy(() => import('./JourneyScene'))
const PEOPLE = 4
const GROUP = ['Nimali Perera', 'Kasun Silva', 'Fathima Rizvi', 'Ishara Fernando']

function canWebGL() {
  try {
    const c = document.createElement('canvas')
    return Boolean(c.getContext('webgl2') || c.getContext('webgl'))
  } catch {
    return false
  }
}

// The sums behind the example route, from the admin's live rate card
function useExample() {
  const config = useConfig()
  return useMemo(() => {
    const vehicle = config?.rateCard?.vehicles?.find((v) => v.code === 'VAN')
    if (!vehicle) return null
    const price = fixedRoutePrice({ km: JOURNEY_TOTAL_KM, days: JOURNEY_NIGHTS + 1, nights: JOURNEY_NIGHTS, returnKm: JOURNEY_RETURN_KM, vehicle })
    const feePct = settingOf(config, 'fees.booking_fee_pct', 0)
    return {
      vehicle,
      price,
      feePct,
      band: [settingOf(config, 'rates.band_min_pct', 70), settingOf(config, 'rates.band_max_pct', 130)],
      share: shareOf(price.total, PEOPLE, feePct),
      payoutHours: settingOf(config, 'money.payout_ready_hours', 24),
    }
  }, [config])
}

// ---------- The small working pictures inside each step ----------
const card = 'rounded-2xl bg-white/[0.07] p-4 ring-1 ring-white/15 backdrop-blur-md'

function RouteCard() {
  return (
    <ol className={card}>
      {JOURNEY_STOPS.map((s, i) => (
        <li key={s.id} className="relative flex items-center gap-3 py-1.5">
          {i < JOURNEY_STOPS.length - 1 && <span className="absolute left-[7px] top-[22px] h-[calc(100%-8px)] w-px border-l border-dashed border-white/40" />}
          <span className={`relative h-[15px] w-[15px] shrink-0 rounded-full border-2 ${i === 0 ? 'border-mango bg-mango' : 'border-white/70'}`} />
          <span className="flex-1 font-semibold">{s.name}</span>
          <span className="text-sm text-white/60">{i === 0 ? 'start' : `${s.nights} ${s.nights === 1 ? 'night' : 'nights'}`}</span>
        </li>
      ))}
      <li className="mt-2 flex justify-between border-t border-white/15 pt-3 text-sm">
        <span className="text-white/60">Distance, estimated</span>
        <span className="font-semibold">{JOURNEY_TOTAL_KM} km</span>
      </li>
    </ol>
  )
}

function SeatsCard() {
  return (
    <div className={card}>
      <div className="flex items-center gap-2">
        {GROUP.slice(0, 3).map((n, i) => (
          <span key={n} className="relative">
            <Avatar name={n} i={i} size="h-11 w-11 text-sm" ring={false} />
            <BadgeCheck className="absolute -bottom-1 -right-1 h-4 w-4 rounded-full bg-night text-lagoon" />
          </span>
        ))}
        <span className="grid h-11 w-11 place-items-center rounded-full border-2 border-dashed border-white/40 text-white/60"><Plus className="h-4 w-4" /></span>
        <span className="ml-auto text-sm text-white/60">3 of {PEOPLE} seats</span>
      </div>
      <div className="mt-3 flex items-center gap-3 rounded-xl bg-white/10 p-3">
        <Avatar name={GROUP[3]} i={3} size="h-9 w-9 text-xs" ring={false} />
        <p className="min-w-0 flex-1 text-sm"><span className="font-semibold">{GROUP[3].split(' ')[0]}</span> asks to join <span className="block text-xs text-white/60">ID and live selfie checked</span></p>
        <span className="rounded-lg bg-mango px-3 py-1.5 text-xs font-bold text-night">Accept</span>
      </div>
    </div>
  )
}

function OfferCard({ ex }) {
  if (!ex) return <p className={`${card} text-sm text-white/70`}>The suggested price comes from the live rate card: distance, days, the driver's nights away and the empty drive home.</p>
  const [lo, hi] = ex.band
  return (
    <div className={card}>
      <div className="flex items-baseline justify-between gap-3">
        <span className="font-semibold">{ex.vehicle.name}, up to {ex.vehicle.maxPassengers} people</span>
        <span className="text-xs text-white/60">suggested</span>
      </div>
      <p className="font-display mt-1 text-2xl font-semibold tracking-tight">{rs(Math.round(ex.price.total))}</p>
      <dl className="mt-3 space-y-1 text-sm text-white/70">
        <div className="flex justify-between"><dt>{JOURNEY_NIGHTS + 1} days at the day minimum</dt><dd>{rs(ex.price.base)}</dd></div>
        <div className="flex justify-between"><dt>Driver's {JOURNEY_NIGHTS} nights away</dt><dd>{rs(ex.price.allowance)}</dd></div>
        <div className="flex justify-between"><dt>Empty drive home, {JOURNEY_RETURN_KM} km</dt><dd>{rs(ex.price.empty)}</dd></div>
      </dl>
      <div className="mt-3">
        <div className="relative h-1.5 rounded-full bg-white/15"><span className="absolute inset-y-0 left-[20%] right-[20%] rounded-full bg-lagoon" /><span className="absolute left-1/2 top-1/2 h-3.5 w-3.5 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-night bg-white" /></div>
        <p className="mt-2 text-xs text-white/60">Drivers may offer {lo}% to {hi}% of this: {rs(Math.round((ex.price.total * lo) / 100))} to {rs(Math.round((ex.price.total * hi) / 100))}</p>
      </div>
    </div>
  )
}

function ShareCard({ ex }) {
  if (!ex) return <p className={`${card} text-sm text-white/70`}>The total is split evenly. Each person pays their own share and a small booking fee.</p>
  return (
    <div className={card}>
      <dl className="space-y-1.5 text-sm">
        <div className="flex justify-between text-white/70"><dt>Van for the whole route</dt><dd>{rs(Math.round(ex.price.total))}</dd></div>
        <div className="flex justify-between text-white/70"><dt>Split between {PEOPLE}</dt><dd>{rs(ex.share.share)}</dd></div>
        <div className="flex justify-between text-white/70"><dt>Booking fee, {ex.feePct}%</dt><dd>{rs(ex.share.fee)}</dd></div>
        <div className="flex items-baseline justify-between border-t border-dashed border-white/25 pt-2.5"><dt className="font-semibold">Your share</dt><dd className="font-display text-2xl font-semibold tracking-tight text-mango">{rs(Math.round(ex.share.total))}</dd></div>
      </dl>
      <p className="mt-3 flex items-start gap-2 text-xs text-white/65"><Lock className="mt-0.5 h-3.5 w-3.5 shrink-0 text-lagoon" /> Held by Yaluwo. The driver is paid {ex.payoutHours} hours after the trip ends, if nobody opens a dispute.</p>
    </div>
  )
}

const STEPS = [
  { title: 'Draw your route', text: 'Add every stop and the nights you will stay. Yaluwo works out the distance and a fair price.', Card: RouteCard },
  { title: 'Fill the seats', text: 'Travellers who like your route ask to join, and you choose. Nobody can ask before passing an ID and live selfie check.', Card: SeatsCard },
  { title: 'Book a driver', text: 'Registered drivers send offers for your exact route. Nothing is booked until you accept one.', Card: OfferCard },
  { title: 'Pay only your share', text: 'Each person pays their own share by card or bank transfer. No collecting cash, no chasing friends.', Card: ShareCard },
]

function StepText({ i, ex, compact = false }) {
  const s = STEPS[i]
  const stop = JOURNEY_STOPS[i]
  return (
    <div>
      <div className="flex items-center gap-3">
        <span className="km-post text-[11px] font-bold"><span className="px-2.5 py-1">km {JOURNEY_KM[i]}</span><span className="px-2.5 py-1">{stop.name}</span></span>
        <span className="text-sm font-semibold text-white/60">Step {i + 1} of {STEPS.length}</span>
      </div>
      <h2 className={`display mt-4 ${compact ? 'text-2xl' : 'text-[clamp(1.8rem,3.4vw,2.9rem)]'}`}>{s.title}</h2>
      <p className={`mt-3 max-w-md leading-relaxed text-white/75 ${compact ? 'text-sm' : 'text-lg'}`}>{s.text}</p>
      <div className={`max-w-md ${compact ? 'mt-3' : 'mt-6'}`}><s.Card ex={ex} /></div>
    </div>
  )
}

function HeroCopy() {
  return (
    <>
      <p className="font-sinhala text-lg font-semibold text-mango" lang="si">යාළුවෝ <span className="font-sans text-sm font-medium text-white/60">means friends</span></p>
      <h1 className="mt-4 max-w-[12ch] text-[clamp(2.3rem,5.6vw,4.5rem)] !leading-[1.02] text-white">Sri Lanka is better with a full van.</h1>
      <p className="mt-6 max-w-lg text-lg leading-relaxed text-white/75">Plan a route, fill the seats with verified travellers, book a driver and pay only your share. Yaluwo holds the money until the trip is done.</p>
      <div className="mt-8 flex flex-wrap gap-3">
        <Link to="/trips/new" className={btn.accent}><Plus className="h-5 w-5" /> Create a trip</Link>
        <Link to="/trips" className={btn.glass}><Search className="h-4 w-4" /> Find a trip</Link>
      </div>
    </>
  )
}

// A flat map of the same route, for phones that ask for less motion or have no 3D
function FlatIsland() {
  const pt = ([lng, lat]) => `${((lng - 79.5) * 100).toFixed(1)},${((10 - lat) * 100).toFixed(1)}`
  return (
    <svg viewBox="0 0 260 420" className="h-full w-full" role="img" aria-label="Map of Sri Lanka with the route from Colombo to Arugam Bay">
      <polygon points={COAST.map(pt).join(' ')} fill="#1f8f66" stroke="#f1d6a4" strokeWidth="5" strokeLinejoin="round" />
      <polyline points={JOURNEY_PATH.map((p) => pt([p.lng, p.lat])).join(' ')} fill="none" stroke="#f68b1f" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
      {JOURNEY_STOPS.map((s) => {
        const [x, y] = pt([s.lng, s.lat]).split(',')
        return <circle key={s.id} cx={x} cy={y} r="5" fill="#fff" stroke="#15174a" strokeWidth="2" />
      })}
    </svg>
  )
}

function StaticJourney({ ex }) {
  return (
    <section className="sky-dusk text-white">
      <div className="wrap grid items-center gap-8 pb-16 pt-32 md:grid-cols-2">
        <div><HeroCopy /></div>
        <div className="mx-auto h-[420px] w-full max-w-xs"><FlatIsland /></div>
      </div>
      <div className="wrap grid gap-12 pb-24 md:grid-cols-2">
        {STEPS.map((_, i) => <StepText key={i} i={i} ex={ex} />)}
      </div>
    </section>
  )
}

export default function Journey() {
  const reduce = useReducedMotion()
  const [webgl] = useState(canWebGL)
  const ex = useExample()
  const wrap = useRef(null)
  const scroll = useRef(0)
  const [phase, setPhase] = useState({ view: 'hero', index: 0 })
  const [active, setActive] = useState(true)
  const { scrollYProgress } = useScroll({ target: wrap, offset: ['start start', 'end end'] })

  // Plain motion values, set by hand: the browser's own scroll-linked animations
  // disagree with the sticky layout about where this section starts
  const heroOpacity = useMotionValue(1)
  const heroY = useMotionValue(0)
  const wordX = useMotionValue('4%')

  useMotionValueEvent(scrollYProgress, 'change', (p) => {
    scroll.current = p
    heroOpacity.set(Math.max(0, 1 - p / 0.05))
    heroY.set(-40 * Math.min(1, p / 0.06))
    wordX.set(`${4 - 34 * p}%`)
    const s = storyAt(p)
    const view = s.intro < 0.55 ? 'hero' : s.outro > 0.45 ? 'end' : 'step'
    setPhase((old) => (old.view === view && old.index === s.index ? old : { view, index: s.index }))
  })
  // Stop drawing the 3D scene once it has scrolled away
  useEffect(() => {
    if (!wrap.current) return
    const io = new IntersectionObserver(([e]) => setActive(e.isIntersecting), { rootMargin: '100px' })
    io.observe(wrap.current)
    return () => io.disconnect()
  }, [])


  if (reduce || !webgl) return <StaticJourney ex={ex} />

  return (
    <section ref={wrap} className="relative bg-night text-white" style={{ height: `${(STEPS.length + 1.7) * 100}svh` }} aria-label="How a Yaluwo trip works">
      <div className="sky-dusk sticky top-0 h-svh overflow-hidden">
        {/* The word itself, as wide as the sky */}
        <motion.p aria-hidden style={{ x: wordX }} className="font-sinhala pointer-events-none absolute -bottom-[6vh] left-0 select-none whitespace-nowrap text-[42vh] font-black leading-none text-white/[0.045]" lang="si">
          යාළුවෝ
        </motion.p>

        <div className="absolute inset-0">
          <Suspense fallback={null}>
            <JourneyScene scroll={scroll} active={active} />
          </Suspense>
        </div>
        {/* Keeps the words readable over the island */}
        <div className="pointer-events-none absolute inset-y-0 left-0 hidden w-[64%] bg-gradient-to-r from-[#0e1038] from-20% via-[#0e1038]/75 via-60% to-transparent lg:block" />
        <div className="pointer-events-none absolute inset-x-0 bottom-0 h-[62%] bg-gradient-to-t from-[#0e1038] via-[#0e1038]/80 to-transparent lg:hidden" />

        <motion.div style={{ opacity: heroOpacity, y: heroY }} className={`wrap absolute inset-x-0 top-0 flex h-full flex-col justify-end pb-24 lg:justify-center lg:pb-0 ${phase.view === 'hero' ? '' : 'pointer-events-none'}`}>
          {/* The words arrive once the camera has made its opening sweep */}
          <motion.div initial={{ opacity: 0, y: 28 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 1.1, delay: 1.5, ease: [0.22, 1, 0.36, 1] }}>
            <HeroCopy />
          </motion.div>
        </motion.div>

        <div className="wrap pointer-events-none absolute inset-x-0 top-0 flex h-full flex-col justify-end pb-10 lg:justify-center lg:pb-0">
          <AnimatePresence mode="wait">
            {phase.view === 'step' && (
              <motion.div key={phase.index} initial={{ opacity: 0, y: 24 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -16 }} transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }} className="pointer-events-auto lg:max-w-[46%]">
                <div className="hidden lg:block"><StepText i={phase.index} ex={ex} /></div>
                <div className="lg:hidden"><StepText i={phase.index} ex={ex} compact /></div>
              </motion.div>
            )}
            {phase.view === 'end' && (
              <motion.div key="end" initial={{ opacity: 0, y: 24 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} transition={{ duration: 0.4 }} className="pointer-events-auto lg:max-w-[46%]">
                <h2 className="display text-[clamp(1.8rem,3.6vw,3rem)]">{JOURNEY_TOTAL_KM} km, {PEOPLE} friends, one van.</h2>
                <p className="mt-3 max-w-md text-lg leading-relaxed text-white/75">
                  {ex ? <>About {rs(Math.round(ex.share.total))} each for the transport on this example route. </> : null}
                  Yours can go anywhere on the island.
                </p>
                <ul className="mt-5 space-y-2 text-white/85">
                  {['Everyone is ID-checked before they join', 'Every driver and vehicle is registered and reviewed', 'Your money is held until the trip is done'].map((t) => (
                    <li key={t} className="flex items-center gap-2.5"><Check className="h-4 w-4 text-mango" /> {t}</li>
                  ))}
                </ul>
                <Link to="/trips/new" className={`${btn.accent} mt-7`}>Plan your own route</Link>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* Where you are on the road */}
        <ol className="absolute right-4 top-1/2 hidden -translate-y-1/2 flex-col items-end gap-4 lg:flex" aria-hidden>
          {JOURNEY_STOPS.map((s, i) => {
            const on = phase.view !== 'hero' && (phase.view === 'end' || phase.index >= i)
            return (
              <li key={s.id} className="flex items-center gap-2 text-xs font-semibold">
                <span className={`transition ${phase.view === 'step' && phase.index === i ? 'text-white' : 'text-white/0'}`}>{s.name}</span>
                <span className={`h-2.5 w-2.5 rounded-full transition ${on ? 'bg-mango' : 'bg-white/30'}`} />
              </li>
            )
          })}
        </ol>

        <motion.p style={{ opacity: heroOpacity }} className="pointer-events-none absolute inset-x-0 bottom-6 flex items-center justify-center gap-2 text-sm font-semibold text-white/70">
          Scroll to drive the route <ChevronDown className="h-4 w-4 animate-bounce" />
        </motion.p>
      </div>
    </section>
  )
}
