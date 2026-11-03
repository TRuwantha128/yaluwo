// Every place the site knows about, from src/data/destinations.js (your photos).
// Used for quick search (works even without Google Maps), the 3D island,
// the destination pages and cards. Trips can use any place found through Google Maps too.
//
// kind decides the illustration shown when there is no photo yet:
// hills | beach | culture | city | wildlife

import { DEST_PLACES, DISTRICTS } from '../data/destinations'

export { DISTRICTS }
export const DISTRICT_BY_ID = Object.fromEntries(DISTRICTS.map((d) => [d.id, d]))

export const PLACES = DEST_PLACES.map((p) => ({ ...p, region: DISTRICT_BY_ID[p.district].province }))
export const PLACE_BY_ID = Object.fromEntries(PLACES.map((p) => [p.id, p]))

// Places in a district, including ones that reach into it from next door (like Sinharaja)
export const placesIn = (districtId) => PLACES.filter((p) => p.district === districtId || p.also?.includes(districtId))

export const placeUrl = (p) => `/places/${p.district}/${p.id}`
export const districtUrl = (id) => `/places/${id}`
export const coverOf = (p) => p?.photos?.[0]

// Labels for the kind of place, used as filters
export const KIND_LABELS = { hills: 'Hills & nature', beach: 'Beaches', culture: 'Culture', wildlife: 'Wildlife', city: 'City' }

// Shown as destination cards on the home page
export const FEATURED = ['nine-arch', 'sigiriya', 'mirissa', 'temple-of-the-tooth', 'arugam', 'horton', 'yala', 'galle', 'pigeon-island', 'nallur'].map((id) => PLACE_BY_ID[id])

// Pins and the dotted route lines on the 3D island
export const ISLAND_PINS = ['colombo', 'kandy', 'sigiriya', 'ella', 'mirissa', 'arugam', 'trincomalee', 'jaffna']
export const ISLAND_ROUTES = [
  ['colombo', 'kandy'], ['kandy', 'ella'], ['colombo', 'galle'], ['galle', 'mirissa'],
  ['kandy', 'sigiriya'], ['sigiriya', 'trincomalee'], ['ella', 'arugam'], ['sigiriya', 'jaffna'],
]

export function searchPlaces(query, limit = 6) {
  const q = query.trim().toLowerCase()
  if (!q) return []
  const score = (p) => {
    const n = p.name.toLowerCase()
    if (n.startsWith(q)) return 0
    if (n.includes(q)) return 1
    if (DISTRICT_BY_ID[p.district].name.toLowerCase().includes(q)) return 2
    if (p.region.toLowerCase().includes(q) || p.tags.some((t) => t.toLowerCase() === q)) return 3
    if (q.length > 3 && p.about.toLowerCase().includes(q)) return 4
    return 9
  }
  return PLACES.map((p) => [score(p), p])
    .filter(([s]) => s < 9)
    .sort((a, b) => a[0] - b[0])
    .slice(0, limit)
    .map(([, p]) => p)
}

// Guess an illustration for a place picked from Google Maps
export function kindFor(name = '') {
  const n = name.toLowerCase()
  const match = PLACES.find((p) => n.includes(p.name.toLowerCase()))
  if (match) return match.kind
  if (/beach|bay|island|lagoon/.test(n)) return 'beach'
  if (/national park|sanctuary|reserve|wetland/.test(n)) return 'wildlife'
  if (/temple|kovil|vihara|church|fort|museum|stupa|dagoba|mosque/.test(n)) return 'culture'
  if (/falls|mountain|peak|rock|hill|lake|tank|estate/.test(n)) return 'hills'
  return 'city'
}

// Straight-line distance in km
export function distanceKm(a, b) {
  const rad = (x) => (x * Math.PI) / 180
  const dLat = rad(b.lat - a.lat)
  const dLng = rad(b.lng - a.lng)
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2
  return 6371 * 2 * Math.asin(Math.sqrt(h))
}

export const nearestPlaces = (place, n = 6) =>
  PLACES.filter((p) => p.id !== place.id)
    .map((p) => ({ ...p, km: distanceKm(place, p) }))
    .sort((a, b) => a.km - b.km)
    .slice(0, n)

// Opens the place in Google Maps (app on phones)
export const googleMapsLink = (p) =>
  p.placeId
    ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(p.name)}&query_place_id=${p.placeId}`
    : `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${p.name}, Sri Lanka`)}`
