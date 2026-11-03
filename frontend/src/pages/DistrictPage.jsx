import { useMemo, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { AnimatePresence } from 'motion/react'
import { ArrowLeft, ArrowRight } from 'lucide-react'
import DistrictMap from '../components/DistrictMap'
import { Breadcrumbs, PlaceCard, Photo } from '../components/places'
import PlacesMap from '../maps/PlacesMap'
import GooglePlaces from '../maps/GooglePlaces'
import NotFound from './NotFound'
import { DISTRICTS, DISTRICT_BY_ID, KIND_LABELS, coverOf, districtUrl, placeUrl, placesIn } from '../lib/places'


export default function DistrictPage() {
  const { districtId } = useParams()
  const navigate = useNavigate()
  const district = DISTRICT_BY_ID[districtId]
  const [kind, setKind] = useState('all')
  const [hover, setHover] = useState(null)

  const places = useMemo(() => (district ? placesIn(district.id) : []), [district])
  const kinds = useMemo(() => ['all', ...Object.keys(KIND_LABELS).filter((k) => places.some((p) => p.kind === k))], [places])
  const shown = kind === 'all' ? places : places.filter((p) => p.kind === kind)
  // Up to three places for the photo strip, wide photos first
  const mosaic = places
    .filter((p) => p.photos.length)
    .map((p, n) => [p, n + (coverOf(p).w < coverOf(p).h ? 100 : 0)])
    .sort((a, b) => a[1] - b[1])
    .slice(0, 3)
    .map(([p]) => p)

  if (!district) return <NotFound />

  const i = DISTRICTS.indexOf(district)
  const prev = DISTRICTS[(i - 1 + DISTRICTS.length) % DISTRICTS.length]
  const next = DISTRICTS[(i + 1) % DISTRICTS.length]
  const area = `${district.name} District, Sri Lanka`

  return (
    <div className="pb-16 pt-28">
      <div className="wrap">
        <Breadcrumbs items={[['Destinations', '/places'], [`${district.name} District`]]} />

        <header className="mt-6 grid gap-8 md:grid-cols-[1fr_auto] md:items-end">
          <div>
            <p className="text-sm font-semibold text-brand">{district.province} Province</p>
            <h1 className="mt-1 text-5xl font-extrabold tracking-[-0.035em] md:text-7xl">{district.name}</h1>
            <p className="mt-4 max-w-xl text-lg text-muted">{district.blurb}</p>
            <p className="mt-4 text-sm font-semibold">
              {places.length} {places.length === 1 ? 'place' : 'places'} · {places.reduce((n, p) => n + p.photos.length, 0)} photos
            </p>
          </div>
          <DistrictMap focus={district.id} active={hover && hover !== district.id && DISTRICT_BY_ID[hover] ? hover : null} onHover={setHover} onSelect={(id) => navigate(districtUrl(id))} pins={places} showCounts={false} className="hidden h-60 w-36 md:block" />
        </header>

        {mosaic.length > 0 && (
          <div className={`mt-8 grid h-[42vh] min-h-64 gap-3 ${mosaic.length >= 3 ? 'md:grid-cols-[2fr_1fr] md:grid-rows-2' : mosaic.length === 2 ? 'md:grid-cols-2' : ''}`}>
            {mosaic.map((p, n) => (
              <Link
                key={p.id}
                to={placeUrl(p)}
                className={`group relative overflow-hidden rounded-3xl ${n === 0 && mosaic.length >= 3 ? 'md:row-span-2' : ''} ${n > 0 ? 'hidden md:block' : ''}`}
                style={{ backgroundColor: coverOf(p).c }}
              >
                <Photo photo={coverOf(p)} alt={p.name} large={n === 0} eager={n === 0} className="transition duration-700 group-hover:scale-105" />
                <span className="absolute bottom-3 left-3 rounded-full bg-black/45 px-3 py-1.5 text-xs font-semibold text-white backdrop-blur">{p.name}</span>
              </Link>
            ))}
          </div>
        )}

        <section className="mt-14">
          <div className="flex flex-wrap items-end justify-between gap-4">
            <div>
              <h2 className="text-2xl font-extrabold tracking-tight md:text-3xl">Places to visit</h2>
              <p className="mt-1 text-sm text-muted">Select the places you want. They're saved on this device until you plan your trip.</p>
            </div>
            {kinds.length > 2 && (
              <div className="scrollbar-none -mx-4 flex gap-2 overflow-x-auto px-4">
                {kinds.map((k) => (
                  <button
                    key={k}
                    onClick={() => setKind(k)}
                    className={`shrink-0 rounded-full px-4 py-2 text-sm font-semibold transition ${kind === k ? 'bg-ink text-bg' : 'bg-surface ring-1 ring-line hover:ring-ink/30'}`}
                  >
                    {k === 'all' ? 'All' : KIND_LABELS[k]}
                  </button>
                ))}
              </div>
            )}
          </div>
          <div className="mt-6 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            <AnimatePresence mode="popLayout">
              {shown.map((p) => (
                <PlaceCard key={p.id} place={p} showDistrict={p.district !== district.id} />
              ))}
            </AnimatePresence>
          </div>
        </section>

        <section className="mt-16 grid gap-6 lg:grid-cols-[1.3fr_1fr]">
          <PlacesMap places={places} query={area} zoom={9} onPinClick={(p) => navigate(placeUrl(p))} className="h-[380px] rounded-3xl ring-1 ring-line md:h-[460px]" />
          <div className="rounded-3xl bg-brand-soft p-6 md:p-8">
            <h2 className="text-2xl font-extrabold tracking-tight">Not finding your spot?</h2>
            <p className="mt-2 text-muted">
              There's much more in {district.name} than we have photos of. Look through Google Maps below, or search any place when you build your route.
            </p>
            <Link to="/trips/new" className="mt-5 inline-flex items-center gap-2 font-semibold text-brand hover:underline">
              Start a route <ArrowRight className="h-4 w-4" />
            </Link>
          </div>
        </section>

        <section className="mt-16">
          <h2 className="text-2xl font-extrabold tracking-tight md:text-3xl">More places in {district.name}</h2>
          <p className="mb-5 mt-1 text-sm text-muted">Live from Google Maps.</p>
          <GooglePlaces area={area} bounds={district.bounds} />
        </section>

        <nav className="mt-16 flex items-center justify-between gap-4 border-t border-line pt-6">
          <Link to={districtUrl(prev.id)} className="group flex items-center gap-2 font-semibold">
            <ArrowLeft className="h-4 w-4 transition group-hover:-translate-x-1" /> {prev.name}
          </Link>
          <Link to="/places" className="text-sm font-semibold text-muted hover:text-ink">
            All districts
          </Link>
          <Link to={districtUrl(next.id)} className="group flex items-center gap-2 font-semibold">
            {next.name} <ArrowRight className="h-4 w-4 transition group-hover:translate-x-1" />
          </Link>
        </nav>
      </div>
    </div>
  )
}
