import { useSyncExternalStore } from 'react'

// Places the traveller has selected while browsing destinations.
// Kept in this browser until they start a trip with them.
// Each pick: { key, id?, placeId?, name, lat, lng, kind, photo? }
const KEY = 'yaluwo.picks'
const listeners = new Set()

function read() {
  try {
    const value = JSON.parse(localStorage.getItem(KEY) ?? '[]')
    return Array.isArray(value) ? value : []
  } catch {
    return []
  }
}

let picks = read()

function write(next) {
  picks = next
  try {
    localStorage.setItem(KEY, JSON.stringify(next))
  } catch {
    // Storage full or blocked: keep the picks for this visit only
  }
  listeners.forEach((l) => l())
}

// Another tab changed the picks
if (typeof window !== 'undefined') {
  window.addEventListener('storage', (e) => {
    if (e.key === KEY) {
      picks = read()
      listeners.forEach((l) => l())
    }
  })
}

const subscribe = (l) => {
  listeners.add(l)
  return () => listeners.delete(l)
}

// A place from our list, or a place from Google Maps
export const pickKey = (p) => (p.id ? `yaluwo:${p.id}` : `google:${p.placeId}`)

export function toPick(p) {
  return {
    key: pickKey(p),
    id: p.id ?? null,
    placeId: p.placeId ?? null,
    name: p.name,
    lat: p.lat,
    lng: p.lng,
    kind: p.kind ?? 'city',
    photo: p.photos?.[0]?.sm ?? null,
    district: p.district ?? null,
  }
}

export const tripPicks = {
  get: () => picks,
  has: (p) => picks.some((x) => x.key === pickKey(p)),
  toggle: (p) => {
    const key = pickKey(p)
    write(picks.some((x) => x.key === key) ? picks.filter((x) => x.key !== key) : [...picks, toPick(p)])
  },
  remove: (key) => write(picks.filter((x) => x.key !== key)),
  move: (i, dir) => {
    const next = [...picks]
    ;[next[i], next[i + dir]] = [next[i + dir], next[i]]
    write(next)
  },
  clear: () => write([]),
  // Replace the picks with a ready-made route (used by the starter routes)
  set: (places) => write(places.map(toPick)),
}

export function useTripPicks() {
  return useSyncExternalStore(subscribe, () => picks, () => picks)
}

// Trip stops (the shape CreateTrip uses) from the picks
export const picksToStops = (list) =>
  list.map((p, i) => ({ name: p.name, lat: p.lat, lng: p.lng, placeId: p.placeId, kind: p.kind, nights: i === 0 ? 0 : 1 }))
