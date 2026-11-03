// Trips from the Yaluwo API. Each trip comes back in the shape the cards use:
// { id (= trip code), code, title, status, startDate, endDate, seats, seatsLeft, stops: [{ name, lat, lng, nights, kind }],
//   members: [{ name, role, ... }], price (per person estimate), vehicle, tags, womenOnly, cover, organiser, match }
import { get } from './client'
import { kindFor, PLACE_BY_ID } from '../lib/places'

export function shapeTrip(t) {
  return {
    ...t,
    id: t.code,
    stops: (t.stops ?? []).map((s) => ({ ...s, kind: (s.placeRef && PLACE_BY_ID[s.placeRef]?.kind) || kindFor(s.name) })),
    members: t.members ?? [],
  }
}

export async function listTrips(filters = {}) {
  const { trips } = await get('/trips', filters)
  return trips.map(shapeTrip)
}

export async function getTrip(code) {
  const { trip } = await get(`/trips/${code}`)
  return shapeTrip(trip)
}
