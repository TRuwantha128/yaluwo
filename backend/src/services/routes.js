import { env } from '../config/env.js'
import { haversineKm, round2 } from './pricing.js'

// Distances and drive times for each leg of a route (workflow section 6: "Distances come from Google").
// With GOOGLE_MAPS_SERVER_KEY the Routes API is used, in driving mode with traffic.
// Without a key (local development) the distance is estimated and every leg is marked "ESTIMATE",
// so the site never presents a guess as a real Google distance.
const ROAD_FACTOR = 1.3 // roads in Sri Lanka are rarely straight
const ESTIMATE_KMH = 38

async function googleLeg(a, b, departure) {
  const res = await fetch('https://routes.googleapis.com/directions/v2:computeRoutes', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Goog-Api-Key': env.googleServerKey,
      'X-Goog-FieldMask': 'routes.distanceMeters,routes.duration,routes.polyline.encodedPolyline,routes.description',
    },
    body: JSON.stringify({
      origin: { location: { latLng: { latitude: a.lat, longitude: a.lng } } },
      destination: { location: { latLng: { latitude: b.lat, longitude: b.lng } } },
      travelMode: 'DRIVE',
      routingPreference: departure ? 'TRAFFIC_AWARE' : 'TRAFFIC_UNAWARE',
      ...(departure ? { departureTime: departure } : {}),
      regionCode: 'LK',
      units: 'METRIC',
    }),
  })
  if (!res.ok) throw new Error(`Routes API ${res.status}`)
  const json = await res.json()
  const route = json.routes?.[0]
  if (!route) throw new Error('No route found')
  return {
    km: round2(route.distanceMeters / 1000),
    minutes: Math.round(Number(String(route.duration).replace('s', '')) / 60),
    polyline: route.polyline?.encodedPolyline ?? null,
    mainRoad: route.description ?? null,
    source: 'GOOGLE',
  }
}

function estimateLeg(a, b) {
  const km = round2(haversineKm(a, b) * ROAD_FACTOR)
  return { km, minutes: Math.max(5, Math.round((km / ESTIMATE_KMH) * 60)), polyline: null, mainRoad: null, source: 'ESTIMATE' }
}

export async function computeLegs(stops, { departure = null } = {}) {
  const legs = []
  for (let i = 0; i < stops.length - 1; i++) {
    const a = { lat: Number(stops[i].lat), lng: Number(stops[i].lng) }
    const b = { lat: Number(stops[i + 1].lat), lng: Number(stops[i + 1].lng) }
    let leg
    if (env.googleServerKey) {
      try {
        leg = await googleLeg(a, b, departure)
      } catch (e) {
        console.warn('Google Routes failed, using an estimate:', e.message)
        leg = estimateLeg(a, b)
      }
    } else {
      leg = estimateLeg(a, b)
    }
    legs.push({ position: i, ...leg })
  }
  const totalKm = round2(legs.reduce((s, l) => s + l.km, 0))
  const totalMinutes = legs.reduce((s, l) => s + l.minutes, 0)
  const source = legs.some((l) => l.source === 'ESTIMATE') ? 'ESTIMATE' : 'GOOGLE'
  return { legs, totalKm, totalMinutes, source }
}

// Km a driver drives back empty from the last stop to their base
export async function returnKm(lastStop, base) {
  if (!base?.lat || !lastStop) return 0
  const d = haversineKm({ lat: Number(lastStop.lat), lng: Number(lastStop.lng) }, { lat: Number(base.lat), lng: Number(base.lng) })
  return d < 5 ? 0 : round2(d * ROAD_FACTOR)
}
