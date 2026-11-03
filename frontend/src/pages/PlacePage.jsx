import { useEffect, useMemo, useState } from 'react'
import { Link, Navigate, useParams } from 'react-router-dom'
import { AnimatePresence, motion } from 'motion/react'
import { ArrowRight, ChevronLeft, ChevronRight, Expand, MapPinned, Navigation, Users, X } from 'lucide-react'
import { Breadcrumbs, PickButton, Photo, PlaceCover } from '../components/places'
import PlacesMap from '../maps/PlacesMap'
import GooglePlaces from '../maps/GooglePlaces'
import NotFound from './NotFound'
import { describeWeather, useLiveWeather } from '../hooks/useLiveWeather'
import { DISTRICT_BY_ID, districtUrl, googleMapsLink, nearestPlaces, PLACE_BY_ID, placeUrl } from '../lib/places'
import { btn } from '../components/ui'

function Lightbox({ photos, index, setIndex, name }) {
  const close = () => setIndex(null)
  const go = (d) => setIndex((i) => (i + d + photos.length) % photos.length)

  useEffect(() => {
    if (index === null) return
    const onKey = (e) => {
      if (e.key === 'Escape') close()
      if (e.key === 'ArrowRight') go(1)
      if (e.key === 'ArrowLeft') go(-1)
    }
    window.addEventListener('keydown', onKey)
    document.documentElement.style.overflow = 'hidden'
    return () => {
      window.removeEventListener('keydown', onKey)
      document.documentElement.style.overflow = ''
    }
  })

  return (
    <AnimatePresence>
      {index !== null && (
        <motion.div
          role="dialog"
          aria-modal="true"
          aria-label={`${name} photos`}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-[80] flex flex-col bg-black/95"
          onClick={close}
          data-lenis-prevent
        >
          <div className="flex items-center justify-between p-4 text-sm font-semibold text-white">
            <span>
              {name} · {index + 1} of {photos.length}
            </span>
            <button onClick={close} className="grid h-10 w-10 place-items-center rounded-full bg-white/10 hover:bg-white/20" aria-label="Close">
              <X className="h-5 w-5" />
            </button>
          </div>
          <div className="relative min-h-0 flex-1" onClick={(e) => e.stopPropagation()}>
            <AnimatePresence mode="wait" initial={false}>
              <motion.img
                key={index}
                src={photos[index].src}
                alt={`${name}, photo ${index + 1}`}
                initial={{ opacity: 0, scale: 0.98 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.2 }}
                drag={photos.length > 1 ? 'x' : false}
                dragConstraints={{ left: 0, right: 0 }}
                onDragEnd={(_, info) => Math.abs(info.offset.x) > 60 && go(info.offset.x < 0 ? 1 : -1)}
                className="absolute inset-0 m-auto max-h-full max-w-full object-contain px-2"
              />
            </AnimatePresence>
            {photos.length > 1 &&
              [
                [-1, ChevronLeft, 'left-3', 'Previous photo'],
                [1, ChevronRight, 'right-3', 'Next photo'],
              ].map(([d, Icon, pos, label]) => (
                <button key={d} onClick={() => go(d)} className={`absolute ${pos} top-1/2 hidden h-12 w-12 -translate-y-1/2 place-items-center rounded-full bg-white/10 text-white hover:bg-white/20 md:grid`} aria-label={label}>
                  <Icon className="h-6 w-6" />
                </button>
              ))}
          </div>
          <div className="scrollbar-none flex justify-center gap-2 overflow-x-auto p-4" onClick={(e) => e.stopPropagation()}>
            {photos.map((p, i) => (
              <button key={p.sm} onClick={() => setIndex(i)} className={`h-14 w-20 shrink-0 overflow-hidden rounded-lg transition ${i === index ? 'ring-2 ring-white' : 'opacity-50 hover:opacity-90'}`} aria-label={`Photo ${i + 1}`}>
                <img src={p.sm} alt="" className="h-full w-full object-cover" />
              </button>
            ))}
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}

function Gallery({ place }) {
  const [view, setView] = useState(null)
  const photos = place.photos
  if (photos.length === 0)
    return (
      <div className="relative aspect-[16/10] self-start overflow-hidden rounded-3xl">
        <PlaceCover place={place} />
        <p className="absolute inset-x-0 bottom-4 text-center text-sm font-semibold text-white/90">No photos of this place yet</p>
      </div>
    )
  const [main, ...rest] = photos
  const thumbs = rest.slice(0, 4)
  return (
    <>
      <div className={`grid gap-2 self-start ${thumbs.length ? 'md:grid-cols-[3fr_1fr]' : ''}`}>
        <button onClick={() => setView(0)} className="group relative aspect-[16/10] overflow-hidden rounded-3xl" style={{ backgroundColor: main.c }} aria-label="Open photos">
          <Photo photo={main} alt={place.name} large eager className="transition duration-700 group-hover:scale-[1.03]" />
          <span className="absolute bottom-3 right-3 inline-flex items-center gap-1.5 rounded-full bg-black/50 px-3 py-1.5 text-xs font-semibold text-white backdrop-blur">
            <Expand className="h-3.5 w-3.5" /> {photos.length > 1 ? `All ${photos.length} photos` : 'Full size'}
          </span>
        </button>
        {thumbs.length > 0 && (
          <>
            {/* Phones: a row of thumbnails */}
            <div className="scrollbar-none flex gap-2 overflow-x-auto md:hidden">
              {thumbs.map((p, i) => (
                <button key={p.sm} onClick={() => setView(i + 1)} className="relative aspect-[4/3] w-32 shrink-0 overflow-hidden rounded-2xl" style={{ backgroundColor: p.c }} aria-label={`Open photo ${i + 2}`}>
                  <Photo photo={p} alt="" />
                </button>
              ))}
            </div>
            {/* Larger screens: a column as tall as the main photo */}
            <div className="relative hidden md:block">
              <div className="absolute inset-0 grid gap-2" style={{ gridTemplateRows: `repeat(${thumbs.length}, minmax(0, 1fr))` }}>
                {thumbs.map((p, i) => (
                  <button key={p.sm} onClick={() => setView(i + 1)} className="group relative overflow-hidden rounded-2xl" style={{ backgroundColor: p.c }} aria-label={`Open photo ${i + 2}`}>
                    <span className="absolute inset-0">
                      <Photo photo={p} alt="" className="transition duration-500 group-hover:scale-105" />
                    </span>
                    {i === 3 && rest.length > 4 && <span className="absolute inset-0 grid place-items-center bg-black/50 text-lg font-bold text-white">+{rest.length - 4}</span>}
                  </button>
                ))}
              </div>
            </div>
          </>
        )}
      </div>
      <Lightbox photos={photos} index={view} setIndex={setView} name={place.name} />
    </>
  )
}

export default function PlacePage() {
  const { districtId, placeId } = useParams()
  const place = PLACE_BY_ID[placeId]
  const one = useMemo(() => (place ? [place] : []), [place])
  const { data } = useLiveWeather(one)
  const nearby = useMemo(() => (place ? nearestPlaces(place, 6) : []), [place])
  const bounds = useMemo(() => (place ? [place.lat - 0.15, place.lng - 0.15, place.lat + 0.15, place.lng + 0.15] : null), [place])

  if (!place) return <NotFound />
  const district = DISTRICT_BY_ID[place.district]
  // Old or shared links with the wrong district still work
  if (districtId !== place.district && !place.also?.includes(districtId)) return <Navigate to={placeUrl(place)} replace />
  const weather = data[place.id]
  const info = weather ? describeWeather(weather.code) : null

  return (
    <div className="pb-16 pt-28">
      <div className="wrap">
        <Breadcrumbs items={[['Destinations', '/places'], [`${district.name} District`, districtUrl(district.id)], [place.name]]} />

        <div className="mt-6 grid gap-8 lg:grid-cols-[1.6fr_1fr] lg:gap-12">
          <Gallery place={place} />

          <div className="lg:pt-2">
            <p className="text-sm font-semibold text-brand">
              {district.name} District · {district.province} Province
            </p>
            <h1 className="mt-2 text-4xl font-extrabold leading-[1.05] tracking-[-0.03em] md:text-5xl">{place.name}</h1>
            <div className="mt-4 flex flex-wrap gap-2">
              {place.tags.map((t) => (
                <Link key={t} to={`/trips?tag=${encodeURIComponent(t)}`} className="rounded-full bg-surface px-3 py-1.5 text-xs font-semibold ring-1 ring-line hover:ring-brand">
                  {t}
                </Link>
              ))}
              {info && (
                <span className="inline-flex items-center gap-1.5 rounded-full bg-brand-soft px-3 py-1.5 text-xs font-semibold text-brand">
                  <info.Icon className="h-3.5 w-3.5" /> {weather.temp}° {info.label} now
                </span>
              )}
            </div>
            <p className="mt-5 text-lg leading-relaxed">{place.about}</p>

            <div className="mt-8 flex flex-col gap-3">
              <PickButton place={place} className="!h-13 w-full !text-base" />
              <Link to={`/trips/new?place=${place.id}`} className={`${btn.primary} w-full`}>
                <Navigation className="h-4 w-4" /> Plan a trip starting here
              </Link>
              <div className="grid grid-cols-2 gap-3">
                <Link to={`/trips?place=${encodeURIComponent(place.name)}`} className={`${btn.ghost} !px-3 text-sm`}>
                  <Users className="h-4 w-4" /> Find trips
                </Link>
                <a href={googleMapsLink(place)} target="_blank" rel="noreferrer" className={`${btn.ghost} !px-3 text-sm`}>
                  <MapPinned className="h-4 w-4" /> Google Maps
                </a>
              </div>
            </div>
          </div>
        </div>

        <section className="mt-16 grid gap-6 lg:grid-cols-[1.3fr_1fr]">
          <PlacesMap places={one} query={`${place.name}, ${district.name}, Sri Lanka`} zoom={12} className="h-[340px] rounded-3xl ring-1 ring-line md:h-[420px]" />
          <div>
            <h2 className="text-xl font-extrabold tracking-tight">Close by</h2>
            <ul className="mt-4 space-y-2">
              {nearby.map((p) => (
                <li key={p.id}>
                  <Link to={placeUrl(p)} className="group flex items-center gap-3 rounded-2xl p-2 transition hover:bg-surface">
                    <span className="relative h-14 w-14 shrink-0 overflow-hidden rounded-xl">
                      <PlaceCover place={p} />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate font-semibold">{p.name}</span>
                      <span className="text-xs text-muted">
                        {DISTRICT_BY_ID[p.district].name} · about {p.km < 10 ? p.km.toFixed(1) : Math.round(p.km)} km away
                      </span>
                    </span>
                    <ArrowRight className="h-4 w-4 text-muted transition group-hover:translate-x-1 group-hover:text-ink" />
                  </Link>
                </li>
              ))}
            </ul>
            <p className="mt-3 text-xs text-muted">Distances are straight-line. Road distance shows when you plan the route.</p>
          </div>
        </section>

        <section className="mt-16">
          <h2 className="text-2xl font-extrabold tracking-tight md:text-3xl">Around {place.name}</h2>
          <p className="mb-5 mt-1 text-sm text-muted">Live from Google Maps: things to do, places to stay and places to eat nearby.</p>
          <GooglePlaces area={`${place.name}, Sri Lanka`} bounds={bounds} />
        </section>
      </div>
    </div>
  )
}
