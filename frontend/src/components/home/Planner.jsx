import { useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { AnimatePresence, motion } from 'motion/react'
import { ArrowDown, ArrowUp, Clock, Loader2, MapPin, Minus, Plus, Route, Sparkles, Trash2, Users, X } from 'lucide-react'
import LiveMap from '../../maps/Map'
import PlaceSearch from '../../maps/PlaceSearch'
import { useRoadRoute } from '../../maps/useRoadRoute'
import { routeLine } from '../../lib/polyline'
import { DISTRICT_BY_ID, PLACE_BY_ID, PLACES, placeUrl } from '../../lib/places'
import { pickKey, picksToStops, tripPicks, useTripPicks } from '../../hooks/useTripPicks'
import { post } from '../../api/client'
import { settingOf, useConfig } from '../../config/useConfig'
import { rs, tripDays } from '../../lib/format'
import { btn } from '../ui'
import { useAction } from '../form'

// The home page is the product: a real map of Sri Lanka and a route you can build on it
// before signing up. Stops are the same "picks" the destination pages use, so a place
// chosen anywhere on the site is already on this route.
const STARTERS = [
  { title: 'Hill country', stops: ['kandy', 'nuwara', 'ella'] },
  { title: 'South coast', stops: ['galle', 'unawatuna', 'mirissa', 'tangalle'] },
  { title: 'Ancient cities', stops: ['dambulla', 'sigiriya', 'polonnaruwa'] },
]
const PINS = PLACES.filter((p) => p.photos?.[0]).map((p) => ({ id: p.id, name: p.name, lat: p.lat, lng: p.lng, photo: p.photos[0].sm }))
const hm = (min) => (min >= 60 ? `${Math.floor(min / 60)} h ${min % 60 ? `${min % 60} min` : ''}`.trim() : `${min} min`)

function Helper({ onPlan }) {
  const [text, setText] = useState('')
  const [why, setWhy] = useState('')
  const a = useAction()
  const submit = (e) => {
    e.preventDefault()
    a.run(async () => {
      const plan = await post('/assistant/plan', { prompt: text, places: PLACES.map((p) => ({ id: p.id, name: p.name, district: DISTRICT_BY_ID[p.district].name, kind: p.kind, lat: p.lat, lng: p.lng })) })
      onPlan(plan)
      setWhy(plan.why)
    })
  }
  return (
    <form onSubmit={submit} className="rounded-2xl bg-brand-soft p-3 ring-1 ring-brand/15">
      <label className="flex items-center gap-2 text-sm font-bold"><Sparkles className="h-4 w-4 text-brand" /> Describe the trip, Yaluwo draws it</label>
      <div className="mt-2 flex gap-2">
        <input value={text} onChange={(e) => setText(e.target.value)} placeholder="5 days in April, hills and one beach, 4 friends" maxLength={600} className="h-11 min-w-0 flex-1 rounded-xl bg-surface px-3 text-sm ring-1 ring-line outline-none focus:ring-2 focus:ring-brand" />
        <button disabled={a.busy || text.trim().length < 8} className={`${btn.primary} !px-4 !py-2 text-sm`}>{a.busy ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Plan it'}</button>
      </div>
      {a.error && <p className="mt-2 text-sm text-danger" role="alert">{a.error}</p>}
      {why && !a.error && <p className="mt-2 text-sm text-muted">{why} <span className="opacity-70">Written by an AI helper: check it suits you.</span></p>}
    </form>
  )
}

function PlaceCard({ place, onClose }) {
  const picks = useTripPicks()
  const on = picks.some((x) => x.key === pickKey(place))
  const photo = place.photos?.[0]
  return (
    <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 16 }} className="pointer-events-auto w-[min(21rem,calc(100vw-2rem))] overflow-hidden rounded-3xl bg-surface shadow-[0_24px_60px_-20px_rgba(21,23,74,0.55)] ring-1 ring-line">
      <div className="relative aspect-[16/9] bg-night">
        {photo && <img src={photo.sm} alt="" className="h-full w-full object-cover" />}
        <button onClick={onClose} className="absolute right-2 top-2 grid h-8 w-8 place-items-center rounded-full bg-night/70 text-white hover:bg-night" aria-label="Close"><X className="h-4 w-4" /></button>
      </div>
      <div className="p-4">
        <p className="font-display text-lg font-semibold tracking-tight">{place.name}</p>
        <p className="text-sm text-muted">{DISTRICT_BY_ID[place.district].name}, {place.tags.slice(0, 2).join(' and ').toLowerCase()}</p>
        <p className="mt-2 line-clamp-2 text-sm">{place.about}</p>
        <div className="mt-3 flex gap-2">
          <button onClick={() => tripPicks.toggle(place)} className={`${on ? btn.ghost : btn.accent} flex-1 !py-2 text-sm`}>{on ? 'Remove from route' : <><Plus className="h-4 w-4" /> Add to route</>}</button>
          <Link to={placeUrl(place)} className={`${btn.ghost} !px-4 !py-2 text-sm`}>Photos</Link>
        </div>
      </div>
    </motion.div>
  )
}

export default function Planner() {
  const navigate = useNavigate()
  const config = useConfig()
  const picks = useTripPicks()
  const [seats, setSeats] = useState(4)
  const [open, setOpen] = useState(null) // the place whose card is showing
  const stops = useMemo(() => picksToStops(picks), [picks])
  const { route, loading, error } = useRoadRoute(stops, { seats })
  const line = useMemo(() => (stops.length > 1 ? routeLine(route, stops) : null), [route, stops])
  const wide = typeof window !== 'undefined' && window.innerWidth >= 1024
  const best = route?.prices?.[0]
  const maxGroup = settingOf(config, 'trips.max_group', 30)

  const usePlan = (plan) => {
    tripPicks.set(plan.stops.map((s) => ({ ...PLACE_BY_ID[s.id], nights: s.nights })).filter((p) => p.id))
  }

  return (
    <section id="plan" className="relative scroll-mt-0 bg-surface-2 lg:h-[100svh] lg:min-h-[720px]">
      <LiveMap
        stops={stops}
        line={line}
        places={PINS}
        picked={picks.map((p) => p.id).filter(Boolean)}
        onPlaceClick={(p) => setOpen(PLACE_BY_ID[p.id])}
        pitch={wide ? 38 : 0}
        intro
        padding={wide ? { left: 520, top: 110, right: 70, bottom: 70 } : { top: 90, bottom: 40, left: 40, right: 40 }}
        className="h-[58svh] min-h-[380px] lg:absolute lg:inset-0 lg:h-auto"
      />

      {/* The place someone tapped on the map */}
      <div className="pointer-events-none absolute inset-x-0 top-[calc(58svh-1rem)] z-20 flex -translate-y-full justify-center px-4 lg:inset-x-auto lg:bottom-8 lg:right-16 lg:top-auto lg:translate-y-0">
        <AnimatePresence>{open && <PlaceCard key={open.id} place={open} onClose={() => setOpen(null)} />}</AnimatePresence>
      </div>

      {/* The route panel */}
      <div className="relative z-10 lg:pointer-events-none lg:absolute lg:inset-y-0 lg:left-[var(--edge)] lg:flex lg:w-[440px] lg:items-start lg:pb-6 lg:pt-24">
        <div className="scrollbar-none bg-surface p-5 ring-1 ring-line lg:pointer-events-auto lg:max-h-full lg:w-full lg:overflow-y-auto lg:rounded-3xl lg:p-6 lg:shadow-[0_30px_80px_-30px_rgba(21,23,74,0.6)]" data-lenis-prevent>
          <h2 className="display text-[clamp(1.7rem,3vw,2.3rem)]">Where are you going?</h2>
          <p className="mt-2 text-muted">Build a route on the map. See the real road distance and what each friend would pay, then find people to fill the seats.</p>

          <div className="mt-5 space-y-4">
            {config?.assistant && <Helper onPlan={usePlan} />}

            <PlaceSearch onSelect={(p) => tripPicks.add(p)} placeholder={stops.length ? 'Add the next stop' : 'Where does the trip start?'} />

            {stops.length === 0 ? (
              <div>
                <p className="text-sm font-semibold">Or start from a route people love</p>
                <div className="mt-2 flex flex-wrap gap-2">
                  {STARTERS.map((r) => (
                    <button key={r.title} onClick={() => tripPicks.set(r.stops.map((id) => PLACE_BY_ID[id]).filter(Boolean))} className="rounded-full bg-surface-2 px-4 py-2 text-sm font-semibold transition hover:bg-brand hover:text-on-brand">{r.title}</button>
                  ))}
                </div>
                <p className="mt-4 flex items-start gap-2 text-sm text-muted"><MapPin className="mt-0.5 h-4 w-4 shrink-0 text-accent" /> Every photo on the map is a place. Tap one to see it and add it.</p>
              </div>
            ) : (
              <ol className="space-y-1">
                {picks.map((p, i) => {
                  const leg = route?.legs?.[i - 1]
                  return (
                    <li key={p.key}>
                      {i > 0 && <p className="ml-[13px] border-l-2 border-dotted border-line py-1 pl-6 text-xs text-muted">{leg ? `${Math.round(leg.km)} km, ${hm(leg.minutes)}` : loading ? 'Finding the road' : ''}</p>}
                      <div className="flex items-center gap-3">
                        <span className="font-display grid h-7 w-7 shrink-0 place-items-center rounded-full bg-accent text-xs font-bold text-on-accent">{i + 1}</span>
                        <span className="min-w-0 flex-1 truncate font-semibold">{p.name}</span>
                        {i > 0 && (
                          <span className="flex items-center gap-1 text-sm" title="Nights here">
                            <button onClick={() => tripPicks.setNights(p.key, (p.nights ?? 1) - 1)} className="grid h-7 w-7 place-items-center rounded-lg hover:bg-surface-2" aria-label={`One night fewer in ${p.name}`}><Minus className="h-3.5 w-3.5" /></button>
                            <span className="w-14 text-center">{p.nights ?? 1} {(p.nights ?? 1) === 1 ? 'night' : 'nights'}</span>
                            <button onClick={() => tripPicks.setNights(p.key, (p.nights ?? 1) + 1)} className="grid h-7 w-7 place-items-center rounded-lg hover:bg-surface-2" aria-label={`One more night in ${p.name}`}><Plus className="h-3.5 w-3.5" /></button>
                          </span>
                        )}
                        <span className="flex text-muted">
                          {i > 0 && <button onClick={() => tripPicks.move(i, -1)} className="grid h-7 w-6 place-items-center hover:text-ink" aria-label={`Move ${p.name} earlier`}><ArrowUp className="h-3.5 w-3.5" /></button>}
                          {i < picks.length - 1 && <button onClick={() => tripPicks.move(i, 1)} className="grid h-7 w-6 place-items-center hover:text-ink" aria-label={`Move ${p.name} later`}><ArrowDown className="h-3.5 w-3.5" /></button>}
                          <button onClick={() => tripPicks.remove(p.key)} className="grid h-7 w-6 place-items-center hover:text-danger" aria-label={`Remove ${p.name}`}><Trash2 className="h-3.5 w-3.5" /></button>
                        </span>
                      </div>
                    </li>
                  )
                })}
              </ol>
            )}

            {stops.length === 1 && <p className="rounded-2xl bg-surface-2 px-4 py-3 text-sm text-muted">Add one more stop to see the road, the distance and the price.</p>}

            {stops.length > 1 && (
              <div className="rounded-2xl bg-night p-5 text-white">
                {error ? (
                  <p className="text-sm text-white/80">The route can't be worked out right now. {error}</p>
                ) : (
                  <>
                    <div className="flex flex-wrap gap-x-5 gap-y-1 text-sm text-white/80">
                      <span className="inline-flex items-center gap-1.5"><Route className="h-4 w-4 text-mango" /> <b className="text-white">{route ? Math.round(route.totalKm) : '…'}</b> km</span>
                      <span className="inline-flex items-center gap-1.5"><Clock className="h-4 w-4 text-mango" /> <b className="text-white">{route ? hm(route.totalMinutes) : '…'}</b> driving</span>
                      <span><b className="text-white">{tripDays(stops)}</b> days</span>
                    </div>
                    <div className="mt-4 flex items-center justify-between gap-3">
                      <span className="inline-flex items-center gap-2 text-sm font-semibold"><Users className="h-4 w-4 text-mango" /> People</span>
                      <span className="flex items-center gap-1 rounded-xl bg-white/10 p-1">
                        <button onClick={() => setSeats(Math.max(2, seats - 1))} disabled={seats <= 2} className="grid h-8 w-8 place-items-center rounded-lg hover:bg-white/15 disabled:opacity-30" aria-label="Fewer people"><Minus className="h-4 w-4" /></button>
                        <span className="font-display w-8 text-center font-semibold" aria-live="polite">{seats}</span>
                        <button onClick={() => setSeats(Math.min(maxGroup, seats + 1))} disabled={seats >= maxGroup} className="grid h-8 w-8 place-items-center rounded-lg hover:bg-white/15 disabled:opacity-30" aria-label="More people"><Plus className="h-4 w-4" /></button>
                      </span>
                    </div>
                    {best ? (
                      <div className="mt-4 border-t border-dashed border-white/25 pt-4">
                        <p className="text-sm text-white/65">Each person pays about</p>
                        <p className="font-display text-4xl font-semibold tracking-[-0.04em] text-mango" aria-live="polite">{rs(Math.round(best.perPersonWithFee))}</p>
                        <p className="mt-1 text-sm text-white/70">{best.name} for the whole route, {rs(Math.round(best.total))} split {seats} ways, booking fee included.</p>
                      </div>
                    ) : route ? (
                      <p className="mt-4 text-sm text-white/70">No vehicle on the rate card takes {seats} people. Try a smaller group.</p>
                    ) : null}
                    {route && <p className="mt-3 text-xs text-white/50">{route.source === 'GOOGLE' ? 'Distance from Google Maps.' : route.source === 'OSM' ? 'Road distance from OpenStreetMap. Drive times are estimates.' : 'Distance is a straight-line estimate: the road service did not answer.'} Drivers may offer {settingOf(config, 'rates.band_min_pct', 70)}% to {settingOf(config, 'rates.band_max_pct', 130)}% of the suggested price.</p>}
                  </>
                )}
              </div>
            )}

            {stops.length > 1 && (
              <div className="flex gap-2">
                <button onClick={() => navigate('/trips/new?from=picks')} className={`${btn.accent} flex-1`}>Create this trip</button>
                <button onClick={() => tripPicks.clear()} className={`${btn.ghost} !px-4`}>Clear</button>
              </div>
            )}
            <p className="text-sm text-muted">Rather join one? <Link to="/trips" className="font-semibold text-brand underline-offset-4 hover:underline">See the trips that are open</Link></p>
          </div>
        </div>
      </div>
    </section>
  )
}
