import { useEffect, useState } from 'react'
import { useMapsLibrary } from '@vis.gl/react-google-maps'
import { ExternalLink, Loader2, MapPin, Star } from 'lucide-react'
import { MAPS_KEY } from './config'
import { PickButton } from '../components/places'
import { PLACES, kindFor } from '../lib/places'

// Things to look for around a district or place. "find" is what we ask Google for.
export const CATEGORIES = [
  { label: 'Things to do', find: 'tourist attractions' },
  { label: 'Waterfalls', find: 'waterfalls' },
  { label: 'Viewpoints', find: 'viewpoints and hikes' },
  { label: 'Beaches & lakes', find: 'beaches and lakes' },
  { label: 'Temples', find: 'temples and historic sites' },
  { label: 'Places to stay', find: 'hotels' },
  { label: 'Places to eat', find: 'restaurants' },
]

const searchLink = (text) => `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(text)}`

// We already show these from our own list
const known = (name) => {
  const n = name.toLowerCase()
  return PLACES.some((p) => n.includes(p.name.toLowerCase()) || p.name.toLowerCase().includes(n))
}

function useGoogleSearch(text, bounds) {
  const places = useMapsLibrary('places')
  const [state, setState] = useState({ loading: true, results: [], error: false })

  useEffect(() => {
    if (!places) return
    let cancelled = false
    setState((s) => ({ ...s, loading: true }))
    const [south, west, north, east] = bounds
    places.Place.searchByText({
      textQuery: text,
      fields: ['id', 'displayName', 'location', 'formattedAddress', 'rating', 'userRatingCount', 'photos', 'googleMapsURI', 'primaryTypeDisplayName'],
      locationRestriction: { south, west, north, east },
      maxResultCount: 12,
      language: 'en',
      region: 'lk',
    })
      .then(({ places: found }) => {
        if (cancelled) return
        const results = found
          .filter((p) => p.location && !known(p.displayName ?? ''))
          .map((p) => {
            const photo = p.photos?.[0]
            return {
              placeId: p.id,
              name: p.displayName,
              lat: p.location.lat(),
              lng: p.location.lng(),
              kind: kindFor(p.displayName),
              type: p.primaryTypeDisplayName,
              address: p.formattedAddress,
              rating: p.rating,
              ratings: p.userRatingCount,
              url: p.googleMapsURI,
              image: photo?.getURI({ maxWidth: 640, maxHeight: 480 }),
              credit: photo?.authorAttributions?.[0],
            }
          })
        setState({ loading: false, results, error: false })
      })
      .catch(() => !cancelled && setState({ loading: false, results: [], error: true }))
    return () => {
      cancelled = true
    }
  }, [places, text, bounds])

  return state
}

function GoogleCard({ place: p }) {
  return (
    <article className="relative overflow-hidden rounded-3xl bg-surface ring-1 ring-line">
      <a href={p.url} target="_blank" rel="noreferrer" className="block">
        <div className="relative aspect-[4/3] bg-surface-2">
          {p.image ? (
            <img src={p.image} alt={p.name} loading="lazy" className="absolute inset-0 h-full w-full object-cover" />
          ) : (
            <div className="absolute inset-0 grid place-items-center text-muted">
              <MapPin className="h-8 w-8" />
            </div>
          )}
          {p.credit && <span className="absolute bottom-2 left-2 max-w-[80%] truncate rounded-full bg-black/50 px-2 py-0.5 text-[10px] text-white">Photo: {p.credit.displayName}</span>}
        </div>
        <div className="p-4">
          {p.type && <p className="text-xs font-semibold text-muted">{p.type}</p>}
          <h3 className="font-bold leading-snug tracking-tight">{p.name}</h3>
          <div className="mt-1.5 flex items-center gap-3 text-xs text-muted">
            {p.rating && (
              <span className="inline-flex items-center gap-1 font-semibold text-ink">
                <Star className="h-3.5 w-3.5 fill-accent text-accent" /> {p.rating.toFixed(1)}
                <span className="font-normal text-muted">({p.ratings?.toLocaleString()})</span>
              </span>
            )}
            <span className="inline-flex items-center gap-1">
              Google Maps <ExternalLink className="h-3 w-3" />
            </span>
          </div>
        </div>
      </a>
      <PickButton place={p} size="sm" className="absolute right-3 top-3" />
    </article>
  )
}

function Results({ text, bounds }) {
  const { loading, results, error } = useGoogleSearch(text, bounds)
  if (loading)
    return (
      <div className="flex items-center gap-2 py-10 text-sm text-muted">
        <Loader2 className="h-4 w-4 animate-spin" /> Searching Google Maps…
      </div>
    )
  if (error || results.length === 0)
    return (
      <p className="py-8 text-sm text-muted">
        {error ? 'Google Maps could not be reached.' : 'Nothing new found here.'}{' '}
        <a href={searchLink(text)} target="_blank" rel="noreferrer" className="font-semibold text-brand hover:underline">
          Search on Google Maps
        </a>
      </p>
    )
  return (
    <>
      <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        {results.map((p) => (
          <GoogleCard key={p.placeId} place={p} />
        ))}
      </div>
      <p className="mt-4 text-right text-[11px] text-muted">Results and photos from Google</p>
    </>
  )
}

// "More places" from Google Maps, around an area.
// area: shown in the search ("Badulla District, Sri Lanka"); bounds: [south, west, north, east]
export default function GooglePlaces({ area, bounds }) {
  const [cat, setCat] = useState(CATEGORIES[0])
  const text = `${cat.find} in ${area}`

  return (
    <div>
      <div className="scrollbar-none -mx-4 flex gap-2 overflow-x-auto px-4 pb-1">
        {CATEGORIES.map((c) =>
          MAPS_KEY ? (
            <button
              key={c.label}
              type="button"
              onClick={() => setCat(c)}
              className={`shrink-0 rounded-full px-4 py-2 text-sm font-semibold transition ${cat === c ? 'bg-ink text-bg' : 'bg-surface ring-1 ring-line hover:ring-ink/30'}`}
            >
              {c.label}
            </button>
          ) : (
            <a
              key={c.label}
              href={searchLink(`${c.find} in ${area}`)}
              target="_blank"
              rel="noreferrer"
              className="inline-flex shrink-0 items-center gap-1.5 rounded-full bg-surface px-4 py-2 text-sm font-semibold ring-1 ring-line transition hover:ring-brand"
            >
              {c.label} <ExternalLink className="h-3.5 w-3.5 text-muted" />
            </a>
          ),
        )}
      </div>
      {MAPS_KEY ? (
        <div className="mt-6">
          <Results text={text} bounds={bounds} />
        </div>
      ) : (
        <p className="mt-4 text-sm text-muted">These open Google Maps. With a Google Maps key (see frontend/.env.example) the results show here, and you can select them for your trip.</p>
      )}
    </div>
  )
}
