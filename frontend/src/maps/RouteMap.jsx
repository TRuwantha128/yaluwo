import { useEffect } from 'react'
import { AdvancedMarker, Map, useMap } from '@vis.gl/react-google-maps'
import { MAPS_KEY, SRI_LANKA_CENTER } from './config'
import { useTheme } from '../theme/ThemeProvider'

// Dotted line through every stop, and zoom so the whole route fits
function RouteLine({ stops, color }) {
  const map = useMap()

  useEffect(() => {
    if (!map || !window.google) return
    const path = stops.map((s) => ({ lat: s.lat, lng: s.lng }))
    const line = new window.google.maps.Polyline({
      path,
      geodesic: true,
      strokeOpacity: 0,
      icons: [{ icon: { path: 'M 0,-1 0,1', strokeOpacity: 1, strokeColor: color, scale: 3 }, offset: '0', repeat: '14px' }],
      map,
    })
    if (path.length === 1) {
      map.setCenter(path[0])
      map.setZoom(11)
    } else if (path.length > 1) {
      const bounds = new window.google.maps.LatLngBounds()
      path.forEach((p) => bounds.extend(p))
      map.fitBounds(bounds, 60)
    }
    return () => line.setMap(null)
  }, [map, stops, color])

  return null
}

// Free Google embedded map, used when there is no API key
function embedUrl(stops) {
  const point = (s) => `${s.lat},${s.lng}`
  if (stops.length === 0) return 'https://maps.google.com/maps?q=Sri%20Lanka&z=7&output=embed'
  if (stops.length === 1) return `https://maps.google.com/maps?q=${point(stops[0])}&z=11&output=embed`
  return `https://maps.google.com/maps?saddr=${point(stops[0])}&daddr=${stops.slice(1).map(point).join('+to:')}&output=embed`
}

export default function RouteMap({ stops, className = '' }) {
  const { theme } = useTheme()

  if (!MAPS_KEY) {
    return (
      <div className={`overflow-hidden bg-surface-2 ${className}`}>
        <iframe title="Route map" src={embedUrl(stops)} loading="lazy" className="h-full w-full border-0" referrerPolicy="no-referrer-when-downgrade" />
      </div>
    )
  }

  return (
    <div className={`overflow-hidden bg-surface-2 ${className}`}>
      <Map
        mapId="DEMO_MAP_ID"
        defaultCenter={SRI_LANKA_CENTER}
        defaultZoom={7}
        gestureHandling="cooperative"
        disableDefaultUI
        zoomControl
        colorScheme={theme.mode === 'dark' ? 'DARK' : 'LIGHT'}
        style={{ width: '100%', height: '100%' }}
      >
        {stops.map((s, i) => (
          <AdvancedMarker key={`${s.name}-${i}`} position={{ lat: s.lat, lng: s.lng }} title={s.name}>
            <span className="grid h-8 w-8 place-items-center rounded-full bg-brand text-sm font-bold text-on-brand shadow-lg ring-4 ring-white">{i + 1}</span>
          </AdvancedMarker>
        ))}
        <RouteLine stops={stops} color={theme.accent} />
      </Map>
    </div>
  )
}
