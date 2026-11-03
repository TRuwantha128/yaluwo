import { useEffect } from 'react'
import { AdvancedMarker, Map, useMap } from '@vis.gl/react-google-maps'
import { MAPS_KEY, SRI_LANKA_CENTER } from './config'
import { useTheme } from '../theme/ThemeProvider'
import { useTripPicks, pickKey } from '../hooks/useTripPicks'
import { coverOf } from '../lib/places'

function FitPlaces({ places, zoom }) {
  const map = useMap()
  useEffect(() => {
    if (!map || !window.google || places.length === 0) return
    if (places.length === 1) {
      map.setCenter({ lat: places[0].lat, lng: places[0].lng })
      map.setZoom(zoom)
      return
    }
    const bounds = new window.google.maps.LatLngBounds()
    places.forEach((p) => bounds.extend({ lat: p.lat, lng: p.lng }))
    map.fitBounds(bounds, 70)
  }, [map, places, zoom])
  return null
}

// Map with a photo pin for each place. Without an API key it falls back to Google's free embedded map.
export default function PlacesMap({ places, query, zoom = 12, onPinClick, className = '' }) {
  const { theme } = useTheme()
  const picks = useTripPicks()

  if (!MAPS_KEY) {
    const q = query ?? (places[0] ? `${places[0].lat},${places[0].lng}` : 'Sri Lanka')
    return (
      <div className={`overflow-hidden bg-surface-2 ${className}`}>
        <iframe title="Map" src={`https://maps.google.com/maps?q=${encodeURIComponent(q)}&z=${zoom}&output=embed`} loading="lazy" className="h-full w-full border-0" referrerPolicy="no-referrer-when-downgrade" />
      </div>
    )
  }

  return (
    <div className={`overflow-hidden bg-surface-2 ${className}`}>
      <Map
        mapId="DEMO_MAP_ID"
        defaultCenter={SRI_LANKA_CENTER}
        defaultZoom={8}
        gestureHandling="cooperative"
        disableDefaultUI
        zoomControl
        colorScheme={theme.mode === 'dark' ? 'DARK' : 'LIGHT'}
        style={{ width: '100%', height: '100%' }}
      >
        {places.map((p) => {
          const photo = coverOf(p)
          const picked = picks.some((x) => x.key === pickKey(p))
          return (
            <AdvancedMarker key={p.id ?? p.placeId} position={{ lat: p.lat, lng: p.lng }} title={p.name} onClick={() => onPinClick?.(p)}>
              <span className={`block h-11 w-11 overflow-hidden rounded-full bg-brand shadow-lg ring-[3px] transition hover:scale-110 ${picked ? 'ring-accent' : 'ring-white'}`}>
                {photo && <img src={photo.sm} alt="" className="h-full w-full object-cover" />}
              </span>
            </AdvancedMarker>
          )
        })}
        <FitPlaces places={places} zoom={zoom} />
      </Map>
    </div>
  )
}
