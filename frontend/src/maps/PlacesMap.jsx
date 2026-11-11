import { useEffect } from 'react'
import { AdvancedMarker, Map, useMap } from '@vis.gl/react-google-maps'
import { MAPS_KEY, SRI_LANKA_CENTER } from './config'
import { useTheme } from '../theme/ThemeProvider'
import { useTripPicks, pickKey } from '../hooks/useTripPicks'
import { coverOf } from '../lib/places'
import LiveMap from './Map'

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

  // No Google key: photo pins on the free live map
  if (!MAPS_KEY) {
    return (
      <LiveMap
        places={places.map((p) => ({ ...p, id: p.id ?? p.placeId, photo: coverOf(p)?.sm }))}
        picked={places.filter((p) => picks.some((x) => x.key === pickKey(p))).map((p) => p.id ?? p.placeId)}
        onPlaceClick={onPinClick}
        zoom={zoom}
        className={className}
      />
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
