import { useEffect } from 'react'
import { AdvancedMarker, Map, useMap } from '@vis.gl/react-google-maps'
import { MAPS_KEY, SRI_LANKA_CENTER } from './config'
import { useTheme } from '../theme/ThemeProvider'
import LiveMap from './Map'
import { useRoadRoute } from './useRoadRoute'
import { routeLine } from '../lib/polyline'

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

function RoadMap({ stops, className }) {
  const { route } = useRoadRoute(stops)
  return <LiveMap stops={stops} line={stops.length > 1 ? routeLine(route, stops) : null} className={className} />
}

export default function RouteMap({ stops, className = '' }) {
  const { theme } = useTheme()

  // No Google key: the same route on the free live map, following real roads
  if (!MAPS_KEY) return <RoadMap stops={stops} className={className} />

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
