import { useState } from 'react'
import { Link } from 'react-router-dom'
import { AnimatePresence, motion, useReducedMotion } from 'motion/react'
import { ArrowUpRight, Plus } from 'lucide-react'
import DistrictMap from './DistrictMap'
import { DISTRICTS, DISTRICT_BY_ID, KIND_LABELS, coverOf, districtUrl, placeUrl, placesIn } from '../lib/places'

// Choose a district on the map; the panel shows what is there.
export default function ExploreMap() {
  const reduce = useReducedMotion()
  const [selected, setSelected] = useState('badulla')
  const [hover, setHover] = useState(null)
  const d = DISTRICT_BY_ID[selected]
  const places = placesIn(selected)
  const cover = places.map(coverOf).find(Boolean)

  return (
    <section id="explore" className="scroll-mt-20 border-y border-line bg-surface py-20 md:py-28">
      <div className="wrap">
        <div className="max-w-2xl">
          <h2 className="font-display text-[clamp(2rem,4.4vw,3.4rem)] font-bold leading-[1] tracking-[-0.025em] [font-stretch:90%]">Pick a district</h2>
          <p className="mt-3 text-lg text-muted">{DISTRICTS.length} districts, from Jaffna to Galle. Tap one to see its places, then plan a trip through it.</p>
        </div>

        <div className="mt-12 grid items-start gap-10 lg:grid-cols-[minmax(0,1fr)_minmax(420px,560px)] lg:gap-20">
          {/* The island: darker districts have more places */}
          <div className="relative mx-auto w-full max-w-[340px] lg:sticky lg:top-28 lg:max-w-[430px]">
            <DistrictMap
              active={hover ?? selected}
              onHover={setHover}
              onSelect={setSelected}
              pins={places}
              showCounts
              className="aspect-[274/477] w-full"
            />
            <div className="mt-4 flex items-center gap-3 text-xs text-muted">
              <span className="h-2.5 w-16 rounded-full bg-[linear-gradient(90deg,color-mix(in_oklab,var(--brand-ui)_18%,transparent),var(--brand-ui))]" />
              Fewer places to more places
            </div>
          </div>

          {/* What is in the chosen district */}
          <AnimatePresence mode="wait" initial={false}>
            <motion.div
              key={selected}
              initial={reduce ? false : { opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              exit={reduce ? undefined : { opacity: 0, y: -8 }}
              transition={{ duration: 0.25 }}
              aria-live="polite"
            >
              <div className="relative aspect-[4/3] overflow-hidden rounded-[28px] bg-surface-2" style={{ backgroundColor: cover?.c }}>
                {cover && <img src={cover.src} alt="" className="h-full w-full object-cover" />}
                <div className="absolute inset-0 bg-[linear-gradient(0deg,color-mix(in_oklab,var(--night)_70%,transparent),transparent_55%)]" />
                <div className="absolute inset-x-5 bottom-4 text-white">
                  <p className="text-sm text-white/75">{d.province} Province</p>
                  <h3 className="font-display text-3xl font-bold tracking-tight">{d.name}</h3>
                </div>
              </div>
              <p className="mt-5 leading-relaxed text-muted">{d.blurb}</p>

              {places.length === 0 && <p className="mt-5 text-sm text-muted">No places added for {d.name} yet.</p>}
              <ul className="mt-5 divide-y divide-line border-y border-line empty:hidden">
                {places.slice(0, 5).map((p) => {
                  const c = coverOf(p)
                  return (
                    <li key={p.id}>
                      <Link to={placeUrl(p)} className="group flex items-center gap-4 py-3">
                        <span className="h-12 w-16 shrink-0 overflow-hidden rounded-xl bg-surface-2" style={{ backgroundColor: c?.c }}>
                          {c && <img src={c.sm} alt="" loading="lazy" className="h-full w-full object-cover" />}
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="block truncate font-semibold group-hover:text-brand">{p.name}</span>
                          <span className="block text-sm text-muted">{KIND_LABELS[p.kind]}</span>
                        </span>
                        <ArrowUpRight className="h-4 w-4 shrink-0 text-muted transition group-hover:text-brand" />
                      </Link>
                    </li>
                  )
                })}
              </ul>

              <div className="mt-6 flex flex-wrap gap-3">
                <Link to={districtUrl(d.id)} className="inline-flex items-center gap-2 rounded-full bg-ink px-5 py-3 text-sm font-semibold text-bg transition hover:opacity-90">
                  All {places.length} {places.length === 1 ? 'place' : 'places'} in {d.name}
                </Link>
                {places[0] && (
                  <Link to={`/trips/new?place=${places[0].id}`} className="inline-flex items-center gap-2 rounded-full px-5 py-3 text-sm font-semibold text-ink ring-1 ring-line transition hover:ring-ink/40">
                    <Plus className="h-4 w-4" /> Plan a trip from {places[0].name}
                  </Link>
                )}
              </div>
            </motion.div>
          </AnimatePresence>
        </div>
      </div>
    </section>
  )
}
