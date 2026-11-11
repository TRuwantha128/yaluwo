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

// Free road routing on OpenStreetMap data (an OSRM server). One request covers the whole
// route and also returns the line to draw on the map. Used when there is no Google key.
// OSRM assumes faster roads than Sri Lanka has, so drive times are stretched a little.
const OSRM_TIME_FACTOR = 1.3
const roadCache = new Map()

async function osmRoute(stops) {
  const coords = stops.map((s) => `${Number(s.lng).toFixed(5)},${Number(s.lat).toFixed(5)}`).join(';')
  if (roadCache.has(coords)) return roadCache.get(coords)
  const res = await fetch(`${env.osrmUrl}/route/v1/driving/${coords}?overview=full&geometries=polyline&steps=false`, { signal: AbortSignal.timeout(8000), headers: { 'User-Agent': 'Yaluwo/1.0 (group travel planner)' } })
  if (!res.ok) throw new Error(`OSRM ${res.status}`)
  const json = await res.json()
  const route = json.routes?.[0]
  if (json.code !== 'Ok' || !route) throw new Error('No road route found')
  const out = {
    polyline: route.geometry,
    legs: route.legs.map((l, i) => ({ position: i, km: round2(l.distance / 1000), minutes: Math.max(5, Math.round((l.duration / 60) * OSRM_TIME_FACTOR)), polyline: null, mainRoad: null, source: 'OSM' })),
  }
  if (roadCache.size > 500) roadCache.clear()
  roadCache.set(coords, out)
  return out
}

export async function computeLegs(stops, { departure = null } = {}) {
  let legs = []
  let polyline = null
  if (stops.length > 1 && !env.googleServerKey && env.osrmUrl && !env.isTest) {
    try {
      ;({ legs, polyline } = await osmRoute(stops))
    } catch (e) {
      console.warn('Road routing failed, using an estimate:', e.message)
      legs = []
    }
  }
  if (!legs.length) {
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
  }
  const totalKm = round2(legs.reduce((s, l) => s + l.km, 0))
  const totalMinutes = legs.reduce((s, l) => s + l.minutes, 0)
  const source = legs.some((l) => l.source === 'ESTIMATE') ? 'ESTIMATE' : legs.some((l) => l.source === 'OSM') ? 'OSM' : 'GOOGLE'
  // polyline: the whole route as one encoded line (OSM), or one per leg (Google)
  return { legs, totalKm, totalMinutes, source, polyline }
}

// Any place in Sri Lanka by name (OpenStreetMap search), for stops that are not on Yaluwo's own list
export async function searchOsmPlaces(q) {
  const url = `${env.photonUrl}/api/?q=${encodeURIComponent(q)}&limit=6&lang=en&bbox=79.4,5.8,82.0,9.95`
  const res = await fetch(url, { signal: AbortSignal.timeout(6000), headers: { 'User-Agent': 'Yaluwo/1.0 (group travel planner)' } })
  if (!res.ok) throw new Error(`Place search ${res.status}`)
  const json = await res.json()
  const seen = new Set()
  return (json.features ?? [])
    .filter((f) => f.properties?.name && f.properties.countrycode === 'LK')
    .map((f) => {
      const p = f.properties
      const sub = [p.city, p.county, p.state].filter((x, i, a) => x && x !== p.name && a.indexOf(x) === i).slice(0, 2).join(', ')
      return { name: p.name, sub, lat: f.geometry.coordinates[1], lng: f.geometry.coordinates[0], placeId: `osm:${p.osm_type ?? ''}${p.osm_id ?? ''}` }
    })
    .filter((x) => !seen.has(`${x.name}|${x.sub}`) && seen.add(`${x.name}|${x.sub}`))
}

// Km a driver drives back empty from the last stop to their base
export async function returnKm(lastStop, base) {
  if (!base?.lat || !lastStop) return 0
  const d = haversineKm({ lat: Number(lastStop.lat), lng: Number(lastStop.lng) }, { lat: Number(base.lat), lng: Number(base.lng) })
  return d < 5 ? 0 : round2(d * ROAD_FACTOR)
}
