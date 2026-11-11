import { useEffect, useRef, useState } from 'react'
import { useMapsLibrary } from '@vis.gl/react-google-maps'
import { Loader2, MapPin, Search } from 'lucide-react'
import { MAPS_KEY } from './config'
import { kindFor, searchPlaces } from '../lib/places'
import { get } from '../api/client'

// Asks Google Places for suggestions inside Sri Lanka (only when an API key is set)
function GoogleSuggestions({ query, onResults }) {
  const places = useMapsLibrary('places')
  const token = useRef(null)

  useEffect(() => {
    if (!places || query.trim().length < 2) {
      onResults([])
      return
    }
    let cancelled = false
    const timer = setTimeout(async () => {
      try {
        token.current ??= new places.AutocompleteSessionToken()
        const { suggestions } = await places.AutocompleteSuggestion.fetchAutocompleteSuggestions({
          input: query,
          includedRegionCodes: ['lk'],
          sessionToken: token.current,
        })
        if (cancelled) return
        onResults(
          suggestions
            .filter((s) => s.placePrediction)
            .map(({ placePrediction: p }) => ({
              placeId: p.placeId,
              main: p.mainText?.text ?? p.text.text,
              sub: p.secondaryText?.text ?? '',
              prediction: p,
            })),
        )
      } catch {
        if (!cancelled) onResults([])
      }
    }, 250)
    return () => {
      cancelled = true
      clearTimeout(timer)
    }
  }, [places, query, onResults])

  return null
}

// Any place in Sri Lanka from OpenStreetMap, through the Yaluwo API (used when there is no Google key)
function OsmSuggestions({ query, onResults }) {
  useEffect(() => {
    if (query.trim().length < 3) {
      onResults([])
      return
    }
    let cancelled = false
    const timer = setTimeout(() => {
      get('/places/search', { q: query.trim() })
        .then(({ places }) => !cancelled && onResults(places.map((p) => ({ placeId: p.placeId, main: p.name, sub: p.sub, osm: p }))))
        .catch(() => !cancelled && onResults([]))
    }, 300)
    return () => {
      cancelled = true
      clearTimeout(timer)
    }
  }, [query, onResults])
  return null
}

export default function PlaceSearch({ onSelect, placeholder = 'Search a town, beach, park…', className = '' }) {
  const [query, setQuery] = useState('')
  const [open, setOpen] = useState(false)
  const [google, setGoogle] = useState([])
  const [active, setActive] = useState(0)
  const [busy, setBusy] = useState(false)

  const local = searchPlaces(query, 5).map((p) => ({ key: p.id, main: p.name, sub: `${p.region} Province`, place: p }))
  const fromGoogle = google
    .filter((g) => !local.some((l) => l.main.toLowerCase() === g.main.toLowerCase()))
    .map((g) => ({ key: g.placeId, main: g.main, sub: g.sub, prediction: g.prediction, osm: g.osm }))
  const options = [...local, ...fromGoogle]

  const choose = async (option) => {
    setOpen(false)
    setQuery('')
    if (option.place) {
      const p = option.place
      onSelect({ name: p.name, lat: p.lat, lng: p.lng, placeId: null, kind: p.kind })
      return
    }
    if (option.osm) {
      onSelect({ name: option.osm.name, lat: option.osm.lat, lng: option.osm.lng, placeId: null, kind: kindFor(option.osm.name) })
      return
    }
    setBusy(true)
    try {
      const place = option.prediction.toPlace()
      await place.fetchFields({ fields: ['displayName', 'location'] })
      onSelect({ name: place.displayName ?? option.main, lat: place.location.lat(), lng: place.location.lng(), placeId: option.key, kind: kindFor(option.main) })
    } finally {
      setBusy(false)
    }
  }

  const onKeyDown = (e) => {
    if (!options.length) return
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setActive((a) => (a + 1) % options.length)
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setActive((a) => (a - 1 + options.length) % options.length)
    } else if (e.key === 'Enter') {
      e.preventDefault()
      choose(options[active])
    } else if (e.key === 'Escape') {
      setOpen(false)
    }
  }

  return (
    <div className={`relative ${className}`}>
      {MAPS_KEY ? <GoogleSuggestions query={query} onResults={setGoogle} /> : <OsmSuggestions query={query} onResults={setGoogle} />}
      <div className="flex items-center gap-3 rounded-2xl bg-surface px-4 ring-1 ring-line transition focus-within:ring-2 focus-within:ring-brand">
        {busy ? <Loader2 className="h-5 w-5 animate-spin text-brand" /> : <Search className="h-5 w-5 text-muted" />}
        <input
          value={query}
          onChange={(e) => {
            setQuery(e.target.value)
            setActive(0)
            setOpen(true)
          }}
          onFocus={() => setOpen(true)}
          onBlur={() => setTimeout(() => setOpen(false), 150)}
          onKeyDown={onKeyDown}
          placeholder={placeholder}
          className="h-13 w-full bg-transparent text-sm font-medium outline-none placeholder:text-muted"
        />
      </div>

      {open && query.trim() && (
        <ul className="absolute inset-x-0 top-full z-30 mt-2 overflow-hidden rounded-2xl bg-surface p-1.5 shadow-xl ring-1 ring-line">
          {options.length === 0 && <li className="px-3 py-3 text-sm text-muted">No places found. Try the nearest town.</li>}
          {options.map((o, i) => (
            <li key={o.key}>
              <button
                type="button"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => choose(o)}
                onMouseEnter={() => setActive(i)}
                className={`flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left ${active === i ? 'bg-brand-soft' : ''}`}
              >
                <MapPin className="h-4 w-4 shrink-0 text-brand" />
                <span className="min-w-0">
                  <span className="block truncate text-sm font-semibold">{o.main}</span>
                  <span className="block truncate text-xs text-muted">{o.sub}</span>
                </span>
              </button>
            </li>
          ))}
          {fromGoogle.length > 0 && <li className="px-3 pb-1 pt-2 text-right text-[10px] text-muted">{MAPS_KEY ? 'Results by Google' : 'More places from OpenStreetMap'}</li>}
        </ul>
      )}
    </div>
  )
}
