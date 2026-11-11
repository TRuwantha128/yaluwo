import { useEffect, useState } from 'react'
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { AnimatePresence, motion } from 'motion/react'
import { AlertTriangle, ArrowDown, ArrowLeft, ArrowRight, ArrowUp, Car, Check, Clock, ImagePlus, Loader2, Moon, Route, Sparkles, Trash2, X } from 'lucide-react'
import PlaceSearch from '../maps/PlaceSearch'
import RouteMap from '../maps/RouteMap'
import { MAPS_KEY } from '../maps/config'
import { btn } from '../components/ui'
import { Field, Notice, PageLoader, input, useAction } from '../components/form'
import { get, post, put, upload } from '../api/client'
import { useAuth } from '../auth/AuthProvider'
import { useConfig, settingOf } from '../config/useConfig'
import { compressImage } from '../lib/image'
import { PLACE_BY_ID } from '../lib/places'
import { picksToStops, tripPicks, useTripPicks } from '../hooks/useTripPicks'
import { dateRange, rs, stopDates, totalNights, tripDays } from '../lib/format'
import { DepositPanel } from './trip/TripMoney'

const QUICK = ['colombo', 'kandy', 'ella', 'sigiriya', 'mirissa', 'galle', 'arugam', 'nuwara']
const STEPS = ['Route', 'Details', 'Review']
const hm = (min) => `${Math.floor(min / 60)} h ${String(min % 60).padStart(2, '0')} min`

function StopsEditor({ stops, setStops, route, error }) {
  const picks = useTripPicks()
  const add = (place) => setStops((s) => [...s, { ...place, nights: s.length === 0 ? 0 : 1 }])
  const move = (i, dir) =>
    setStops((s) => {
      const next = [...s]
      ;[next[i], next[i + dir]] = [next[i + dir], next[i]]
      return next
    })
  const remove = (i) => setStops((s) => s.filter((_, n) => n !== i))
  const setNights = (i, nights) => setStops((s) => s.map((x, n) => (n === i ? { ...x, nights } : x)))
  const warnings = route?.warnings ?? []

  return (
    <div>
      <PlaceSearch onSelect={add} placeholder={stops.length ? 'Add the next stop…' : 'Where does the trip start?'} />
      {stops.length === 0 && picks.length > 0 && (
        <button type="button" onClick={() => setStops(picksToStops(picks))} className="mt-4 flex w-full items-center gap-3 rounded-2xl bg-accent-soft px-4 py-3 text-left ring-1 ring-accent/30 transition hover:ring-accent">
          <Sparkles className="h-5 w-5 shrink-0 text-accent" />
          <span className="min-w-0 flex-1">
            <span className="block text-sm font-bold">Use your {picks.length} selected {picks.length === 1 ? 'place' : 'places'}</span>
            <span className="block truncate text-xs text-muted">{picks.map((p) => p.name).join(' · ')}</span>
          </span>
          <ArrowRight className="h-4 w-4 shrink-0" />
        </button>
      )}
      {stops.length === 0 && (
        <div className="mt-4">
          <p className="text-xs font-semibold text-muted">Popular places</p>
          <div className="mt-2 flex flex-wrap gap-2">
            {QUICK.map((id) => {
              const p = PLACE_BY_ID[id]
              return (
                <button key={id} type="button" onClick={() => add({ name: p.name, lat: p.lat, lng: p.lng, placeId: null, placeRef: p.id, kind: p.kind })} className="rounded-full bg-surface px-3 py-1.5 text-sm font-medium ring-1 ring-line hover:ring-brand">
                  + {p.name}
                </button>
              )
            })}
          </div>
          <Link to="/places" className="mt-3 inline-flex items-center gap-1.5 text-sm font-semibold text-brand hover:underline">
            Browse all 25 districts with photos <ArrowRight className="h-4 w-4" />
          </Link>
        </div>
      )}
      <ol className="mt-5">
        <AnimatePresence initial={false}>
          {stops.map((s, i) => {
            const leg = route?.legs?.[i]
            const warn = warnings.find((w) => w.leg === i)
            return (
              <motion.li key={`${s.name}-${i}`} layout initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, x: 20 }}>
                <div className="flex items-center gap-3 rounded-2xl bg-surface p-3 ring-1 ring-line">
                  <span className={`grid h-8 w-8 shrink-0 place-items-center rounded-full text-sm font-bold ${i === 0 || i === stops.length - 1 ? 'bg-accent text-on-accent' : 'bg-brand text-on-brand'}`}>{i + 1}</span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-semibold">{s.name}</p>
                    <p className="text-xs text-muted">{i === 0 ? 'Start' : i === stops.length - 1 ? 'Last stop' : `Stop ${i + 1}`}</p>
                  </div>
                  <label className="flex items-center gap-1.5 rounded-xl bg-surface-2 px-2.5 py-1.5 text-xs font-semibold">
                    <Moon className="h-3.5 w-3.5 text-muted" />
                    <select value={s.nights} onChange={(e) => setNights(i, Number(e.target.value))} className="bg-transparent outline-none" aria-label={`Nights in ${s.name}`}>
                      {Array.from({ length: 11 }, (_, n) => <option key={n} value={n}>{n} {n === 1 ? 'night' : 'nights'}</option>)}
                    </select>
                  </label>
                  <div className="flex">
                    <button type="button" disabled={i === 0} onClick={() => move(i, -1)} className="grid h-8 w-8 place-items-center rounded-lg text-muted hover:bg-surface-2 disabled:opacity-30" aria-label="Move up"><ArrowUp className="h-4 w-4" /></button>
                    <button type="button" disabled={i === stops.length - 1} onClick={() => move(i, 1)} className="grid h-8 w-8 place-items-center rounded-lg text-muted hover:bg-surface-2 disabled:opacity-30" aria-label="Move down"><ArrowDown className="h-4 w-4" /></button>
                    <button type="button" onClick={() => remove(i)} className="grid h-8 w-8 place-items-center rounded-lg text-muted hover:bg-surface-2 hover:text-danger" aria-label={`Remove ${s.name}`}><Trash2 className="h-4 w-4" /></button>
                  </div>
                </div>
                {leg && i < stops.length - 1 && (
                  <div className={`ml-7 flex items-center gap-2 border-l-2 border-dotted py-2 pl-6 text-xs ${warn ? 'border-accent text-accent' : 'border-line text-muted'}`}>
                    <Car className="h-3.5 w-3.5" /> {leg.km} km · {hm(leg.minutes)}{leg.source === 'ESTIMATE' ? ' (estimate)' : ''}
                    {warn && <span className="flex items-center gap-1 font-semibold"><AlertTriangle className="h-3.5 w-3.5" /> {warn.text}</span>}
                  </div>
                )}
                {(!leg || i === stops.length - 1) && <div className="h-2" />}
              </motion.li>
            )
          })}
        </AnimatePresence>
      </ol>
      {error && <p className="mt-3 text-sm font-medium text-danger">{error}</p>}
    </div>
  )
}

// Live summary: total km, drive time, days, and the suggested transport price per vehicle type
function RouteSummary({ stops, route, seats }) {
  if (!stops.length) return null
  return (
    <div className="rounded-3xl bg-surface p-5 ring-1 ring-line">
      <p className="flex items-center gap-2 text-sm font-bold"><Route className="h-4 w-4 text-brand" /> Trip summary</p>
      <div className="mt-3 flex flex-wrap gap-x-6 gap-y-1 text-sm">
        <span><b>{route?.totalKm ?? '…'}</b> km</span>
        <span><Clock className="mr-1 inline h-3.5 w-3.5" /><b>{route ? hm(route.totalMinutes) : '…'}</b> driving</span>
        <span><b>{tripDays(stops)}</b> days · <b>{totalNights(stops)}</b> nights</span>
      </div>
      {route?.source === 'ESTIMATE' && <p className="mt-2 text-xs text-muted">Distances are estimates in local mode. With a Google Maps server key they come from Google Routes.</p>}
      {route?.prices?.length > 0 && (
        <div className="mt-4 space-y-1.5">
          <p className="text-xs font-semibold text-muted">Transport, suggested price for {seats} people</p>
          {route.prices.map((p) => (
            <div key={p.type} className="flex items-center justify-between rounded-xl bg-surface-2 px-3 py-2 text-sm">
              <span className="font-semibold">{p.name} <span className="font-normal text-muted">· up to {p.maxPassengers}</span></span>
              <span><b>{rs(p.total)}</b> <span className="text-muted">· {rs(p.perPersonWithFee)} each</span></span>
            </div>
          ))}
          <p className="pt-1 text-xs text-muted">Drivers set their own price within 70–130% of this. Each share includes Yaluwo's booking fee.</p>
        </div>
      )}
    </div>
  )
}

export default function CreateTrip() {
  const { code } = useParams()
  const navigate = useNavigate()
  const [params] = useSearchParams()
  const { user } = useAuth()
  const config = useConfig()
  const fromPicks = params.get('from') === 'picks'
  const [loaded, setLoaded] = useState(!code)
  const [step, setStep] = useState(0)
  const [stops, setStops] = useState(() => {
    if (code) return []
    if (fromPicks) return picksToStops(tripPicks.get())
    const p = PLACE_BY_ID[params.get('place')]
    return p ? [{ name: p.name, lat: p.lat, lng: p.lng, placeId: null, placeRef: p.id, kind: p.kind, nights: 0 }] : []
  })
  const [route, setRoute] = useState(null)
  const [form, setForm] = useState({ title: '', startDate: '', seats: 4, genderRule: 'MIXED', flexible: false, childrenWelcome: false, tags: [], vehiclePref: '', description: '' })
  const [cover, setCover] = useState(null)
  const [savedCode, setSavedCode] = useState(code ?? null)
  const [needs, setNeeds] = useState(null)
  const [errors, setErrors] = useState({})
  const a = useAction()

  const minDays = settingOf(config, 'trips.min_days_ahead', 5)
  const minGroup = settingOf(config, 'trips.min_group', 2)
  const maxGroup = settingOf(config, 'trips.max_group', 30)
  const earliest = new Date(Date.now() + minDays * 86400000).toISOString().slice(0, 10)

  // Editing a draft
  useEffect(() => {
    if (!code) return
    get(`/trips/${code}`).then(({ trip }) => {
      setStops(trip.stops.map((s) => ({ ...s, placeId: s.placeId ?? null })))
      setForm({ title: trip.title, startDate: trip.startDate ?? '', seats: trip.seats, genderRule: trip.genderRule, flexible: trip.flexible, childrenWelcome: trip.childrenWelcome, tags: trip.tags, vehiclePref: trip.vehicle ?? '', description: trip.description ?? '' })
      setLoaded(true)
    })
  }, [code])

  // Every change redraws the route and updates km, time and price
  useEffect(() => {
    if (!stops.length) {
      setRoute(null)
      return
    }
    const t = setTimeout(() => {
      post('/routes/compute', { stops, seats: Number(form.seats) || 2, flexible: form.flexible }).then(setRoute).catch(() => setRoute(null))
    }, 300)
    return () => clearTimeout(t)
  }, [stops, form.seats, form.flexible])

  const set = (key) => (e) => setForm((f) => ({ ...f, [key]: e?.target ? (e.target.type === 'checkbox' ? e.target.checked : e.target.value) : e }))
  const toggleTag = (t) => setForm((f) => ({ ...f, tags: f.tags.includes(t) ? f.tags.filter((x) => x !== t) : [...f.tags, t] }))

  const validate = () => {
    const e = {}
    if (step === 0 && stops.length === 0) e.stops = 'Add at least one place to the route.'
    if (step === 1) {
      if (!form.title.trim()) e.title = 'Give your trip a name.'
      if (!form.startDate) e.startDate = 'Choose a start date.'
      else if (form.startDate < earliest) e.startDate = `Start at least ${minDays} days from today.`
      if (!(form.seats >= minGroup && form.seats <= maxGroup)) e.seats = `Between ${minGroup} and ${maxGroup} people.`
    }
    setErrors(e)
    return Object.keys(e).length === 0
  }

  const next = () => {
    if (!validate()) return
    if (step === 0 && !form.title) setForm((f) => ({ ...f, title: stops.length === 1 ? `${stops[0].name} getaway` : `${stops[0].name} to ${stops.at(-1).name}` }))
    setStep((s) => s + 1)
  }

  const payload = () => ({
    ...form, seats: Number(form.seats), vehiclePref: form.vehiclePref || null, startDate: form.startDate || null,
    stops: stops.map((s) => ({ name: s.name, lat: s.lat, lng: s.lng, nights: Number(s.nights), placeId: s.placeId ?? null, placeRef: s.placeRef ?? null })),
  })

  const save = async () => {
    let c = savedCode
    if (c) await put(`/trips/${c}`, payload())
    else {
      c = (await post('/trips', payload())).code
      setSavedCode(c)
    }
    if (cover) await upload(`/trips/${c}/cover`, { cover })
    return c
  }

  const saveDraft = () => a.run(async () => navigate(`/trips/${await save()}`))

  const publish = () =>
    a.run(async () => {
      const c = await save()
      const r = await post(`/trips/${c}/submit`)
      if (r.status === 'DRAFT') {
        setNeeds({ ...r.needs, code: c })
        return
      }
      if (fromPicks) tripPicks.clear()
      navigate(`/trips/${c}${r.status === 'UNDER_REVIEW' ? '?review=1' : '?published=1'}`)
    })

  if (!loaded) return <PageLoader />
  const tags = config?.lists?.TRIP_TAG?.map((t) => t.label_en) ?? []
  const vehicles = route?.prices ?? []
  const chosen = vehicles.find((v) => v.type === form.vehiclePref) ?? vehicles[0]

  return (
    <div className="wrap pb-10 pt-28">
      <h1 className="text-3xl font-bold tracking-tight md:text-4xl">{code ? 'Edit your trip' : 'Create a trip'}</h1>
      <p className="mt-2 text-muted">Plan the route, set the details, and publish it for others to join. Saved as a draft until you publish.</p>

      <ol className="mt-8 flex max-w-xl items-center gap-2">
        {STEPS.map((s, i) => (
          <li key={s} className="flex flex-1 items-center gap-2">
            <span className={`grid h-8 w-8 shrink-0 place-items-center rounded-full text-sm font-bold transition ${i < step ? 'bg-success text-white' : i === step ? 'bg-brand text-on-brand' : 'bg-surface text-muted ring-1 ring-line'}`}>{i < step ? <Check className="h-4 w-4" /> : i + 1}</span>
            <span className={`text-sm font-semibold ${i === step ? '' : 'text-muted'}`}>{s}</span>
            {i < STEPS.length - 1 && <span className={`h-0.5 flex-1 rounded-full ${i < step ? 'bg-success' : 'bg-line'}`} />}
          </li>
        ))}
      </ol>

      {needs && (
        <div className="mt-8 space-y-4 rounded-3xl bg-accent-soft p-6 ring-1 ring-accent/30">
          <h2 className="text-xl font-bold tracking-tight">Almost there: your first trip is checked by Yaluwo</h2>
          <p className="text-sm">Because your ID isn't verified yet, the admin checks you and the trip together (within 24 hours).</p>
          {needs.verification && <Link to="/verify" className={btn.primary}>1. Verify your ID</Link>}
          {needs.deposit && <DepositPanel code={needs.code} amount={needs.depositAmount} onPaid={publish} />}
          {!needs.verification && !needs.deposit && <button onClick={publish} className={btn.accent}>Send for review</button>}
        </div>
      )}

      <div className="mt-8">
        {step === 0 && (
          <div className="grid gap-8 lg:grid-cols-[1fr_1.1fr]">
            <div>
              <h2 className="text-xl font-bold">Where are you going?</h2>
              <p className="mb-5 mt-1 text-sm text-muted">Add the places in the order you'll visit them. Drive times come from the real road route.</p>
              <StopsEditor stops={stops} setStops={setStops} route={route} error={errors.stops} />
            </div>
            <div className="space-y-4 lg:sticky lg:top-28 lg:self-start">
              <RouteMap stops={stops} className="h-[320px] rounded-3xl ring-1 ring-line lg:h-[400px]" />
              <RouteSummary stops={stops} route={route} seats={Number(form.seats) || 4} />
              {!MAPS_KEY && <p className="text-xs text-muted">Free map preview. Add a Google Maps key (see frontend/.env.example) for the full interactive map and search.</p>}
            </div>
          </div>
        )}

        {step === 1 && (
          <div className="grid max-w-3xl gap-5 sm:grid-cols-2">
            <Field label="Trip name" error={errors.title} className="sm:col-span-2">
              <input value={form.title} onChange={set('title')} maxLength={70} className={input} placeholder="Hill country by train" />
            </Field>
            <Field label="Start date" error={errors.startDate} hint={form.startDate ? `Ends ${dateRange(form.startDate, stops).split('–').at(-1).trim()}` : `${minDays}+ days from today`}>
              <input type="date" min={earliest} value={form.startDate} onChange={set('startDate')} className={input} />
            </Field>
            <Field label="Group size" hint="including you" error={errors.seats}>
              <input type="number" min={minGroup} max={maxGroup} value={form.seats} onChange={set('seats')} className={input} />
            </Field>
            <Field label="Who can join">
              <select value={form.genderRule} onChange={set('genderRule')} className={input}>
                <option value="MIXED">Everyone</option>
                {user.gender === 'FEMALE' && <option value="WOMEN">Women only</option>}
                {user.gender === 'MALE' && <option value="MEN">Men only</option>}
              </select>
            </Field>
            <Field label="Vehicle you'd like">
              <select value={form.vehiclePref} onChange={set('vehiclePref')} className={input}>
                <option value="">Cheapest that fits</option>
                {vehicles.map((v) => <option key={v.type} value={v.type}>{v.name}</option>)}
              </select>
            </Field>
            <label className="flex items-center justify-between gap-4 rounded-2xl bg-surface px-4 py-3 ring-1 ring-line">
              <span><span className="block text-sm font-semibold">Flexible route</span><span className="text-xs text-muted">Daily driver rate; stays with free cancellation only</span></span>
              <input type="checkbox" checked={form.flexible} onChange={set('flexible')} className="h-5 w-5 accent-[var(--brand-ui)]" />
            </label>
            <label className="flex items-center justify-between gap-4 rounded-2xl bg-surface px-4 py-3 ring-1 ring-line">
              <span><span className="block text-sm font-semibold">Children welcome</span><span className="text-xs text-muted">As dependants of a member</span></span>
              <input type="checkbox" checked={form.childrenWelcome} onChange={set('childrenWelcome')} className="h-5 w-5 accent-[var(--brand-ui)]" />
            </label>
            <div className="sm:col-span-2">
              <span className="text-sm font-semibold">Trip style</span>
              <div className="mt-2 flex flex-wrap gap-2">
                {tags.map((t) => (
                  <button key={t} type="button" onClick={() => toggleTag(t)} className={`rounded-full px-3.5 py-1.5 text-sm font-semibold transition ${form.tags.includes(t) ? 'bg-brand text-on-brand' : 'bg-surface ring-1 ring-line hover:ring-brand'}`}>{t}</button>
                ))}
              </div>
            </div>
            <Field label="About this trip" hint="no phone numbers or links" className="sm:col-span-2" error={a.fields.description}>
              <textarea value={form.description} onChange={set('description')} rows={4} maxLength={1000} className={`${input} h-auto py-3`} placeholder="What's the plan? What kind of people are you looking for?" />
            </Field>
            <div className="sm:col-span-2">
              <span className="text-sm font-semibold">Cover photo</span>
              {cover ? (
                <div className="relative mt-1.5 aspect-[16/7] overflow-hidden rounded-2xl">
                  <img src={URL.createObjectURL(cover)} alt="Trip cover" className="h-full w-full object-cover" />
                  <button type="button" onClick={() => setCover(null)} className="absolute right-3 top-3 flex items-center gap-1 rounded-full bg-black/60 px-3 py-1.5 text-xs font-semibold text-white"><X className="h-3.5 w-3.5" /> Remove</button>
                </div>
              ) : (
                <label className="mt-1.5 flex aspect-[16/7] cursor-pointer flex-col items-center justify-center gap-2 rounded-2xl border-2 border-dashed border-line bg-surface text-sm text-muted transition hover:border-brand hover:text-brand">
                  <ImagePlus className="h-6 w-6" />
                  <span className="font-semibold">Add a cover photo (optional)</span>
                  <input type="file" accept="image/*" className="hidden" onChange={async (e) => {
                    const f = e.target.files?.[0]
                    if (!f) return
                    const data = await compressImage(f)
                    const blob = await (await fetch(data)).blob()
                    setCover(new File([blob], 'cover.jpg', { type: 'image/jpeg' }))
                  }} />
                </label>
              )}
            </div>
          </div>
        )}

        {step === 2 && (
          <div className="grid gap-8 lg:grid-cols-[1fr_380px]">
            <div className="rounded-3xl bg-surface p-6 ring-1 ring-line">
              <h2 className="text-xl font-bold">{form.title}</h2>
              <p className="mt-1 text-sm text-muted">{dateRange(form.startDate, stops)} · {tripDays(stops)} days · {form.seats} people · {form.genderRule === 'MIXED' ? 'Everyone' : form.genderRule === 'WOMEN' ? 'Women only' : 'Men only'}{form.flexible ? ' · Flexible route' : ''}</p>
              <ol className="mt-6 space-y-3">
                {stops.map((s, i) => (
                  <li key={i} className="flex items-center gap-3 text-sm">
                    <span className="grid h-7 w-7 place-items-center rounded-full bg-brand-soft text-xs font-bold text-brand">{i + 1}</span>
                    <span className="font-semibold">{s.name}</span>
                    <span className="text-muted">{stopDates(form.startDate, stops)[i]}{s.nights > 0 && ` · ${s.nights} ${s.nights === 1 ? 'night' : 'nights'}`}</span>
                  </li>
                ))}
              </ol>
              {form.description && <p className="mt-6 whitespace-pre-wrap border-t border-line pt-6 text-sm">{form.description}</p>}
            </div>
            <div className="space-y-4">
              {chosen && (
                <div className="rounded-3xl bg-brand-soft p-6 ring-1 ring-brand/20">
                  <p className="text-sm font-semibold text-brand">Estimated cost per person</p>
                  <p className="mt-1 text-4xl font-bold tracking-tight">{rs(chosen.perPersonWithFee)}</p>
                  <p className="mt-1 text-sm text-muted">{chosen.name} for {route.totalKm} km, shared by {form.seats}, with the booking fee. Stays and food are extra.</p>
                </div>
              )}
              <Notice>
                {user.verified ? 'Your ID is verified, so the trip goes live on the Trip Board as soon as you publish.' : "Your first trip is checked by Yaluwo: you'll verify your ID and pay a small refundable listing deposit."}
              </Notice>
            </div>
          </div>
        )}
      </div>

      {a.error && <Notice tone="danger" className="mt-6">{a.error}</Notice>}

      <div className="mt-10 flex flex-wrap items-center justify-between gap-3 border-t border-line pt-6">
        <button type="button" onClick={() => (step === 0 ? navigate(-1) : setStep((s) => s - 1))} className={btn.ghost}>
          <ArrowLeft className="h-4 w-4" /> {step === 0 ? 'Cancel' : 'Back'}
        </button>
        <div className="flex gap-2">
          {step > 0 && (
            <button type="button" onClick={saveDraft} disabled={a.busy} className={btn.ghost}>Save draft</button>
          )}
          {step < 2 ? (
            <button type="button" onClick={next} className={btn.primary}>Continue <ArrowRight className="h-4 w-4" /></button>
          ) : (
            <button type="button" onClick={publish} disabled={a.busy} className={btn.accent}>
              {a.busy ? <Loader2 className="h-5 w-5 animate-spin" /> : <Check className="h-5 w-5" />} Publish trip
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
