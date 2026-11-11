// The route the home page drives: Colombo → Kandy → Ella → Arugam Bay.
// Each stop tells one step of how a Yaluwo trip works, in the order it happens.
import { PLACE_BY_ID } from './places'
import { roadKm } from './fare'

const at = (id, nights) => ({ ...PLACE_BY_ID[id], nights })
export const JOURNEY_STOPS = [at('colombo', 0), at('kandy', 1), at('ella', 2), at('arugam', 2)]

// Where the road bends between the stops, as [lng, lat], so the line follows the country
export const JOURNEY_PATH = [
  ['colombo'], [80.12, 7.12], [80.36, 7.25], ['kandy'], [80.72, 7.12], [80.77, 6.96], [80.93, 6.86], ['ella'],
  [81.1, 6.74], [81.35, 6.86], [81.62, 6.9], ['arugam'],
].map((p) => (typeof p[0] === 'string' ? { stop: p[0], lng: PLACE_BY_ID[p[0]].lng, lat: PLACE_BY_ID[p[0]].lat } : { lng: p[0], lat: p[1] }))

// Road distance to each stop, estimated the way the API estimates it without Google
let run = 0
export const JOURNEY_KM = JOURNEY_STOPS.map((s, i) => {
  if (i > 0) run += roadKm(JOURNEY_STOPS[i - 1], s)
  return Math.round(run)
})
export const JOURNEY_TOTAL_KM = JOURNEY_KM.at(-1)
export const JOURNEY_NIGHTS = JOURNEY_STOPS.reduce((n, s) => n + s.nights, 0)
export const JOURNEY_RETURN_KM = Math.round(roadKm(JOURNEY_STOPS.at(-1), JOURNEY_STOPS[0]))

// Scroll (0..1 over the whole story) -> which stop the page is at and how far the van
// has driven towards the next one. The page rests at each stop and drives between them.
const STOPS = JOURNEY_STOPS.length
const INTRO = 0.14 // the first part of the scroll flies in from the whole-island view
const OUTRO = 0.9 // the last part pulls back out
const smooth = (t) => t * t * (3 - 2 * t)
const clamp01 = (t) => Math.min(1, Math.max(0, t))

export function storyAt(p) {
  const local = clamp01((p - INTRO) / (OUTRO - INTRO)) * STOPS
  const index = Math.min(STOPS - 1, Math.floor(local))
  const frac = local - index
  // rest for the first 45% of each stop's share of the scroll, drive for the rest
  const drive = index < STOPS - 1 ? smooth(clamp01((frac - 0.45) / 0.55)) : 0
  return { index, drive, intro: smooth(clamp01(p / INTRO)), outro: smooth(clamp01((p - OUTRO) / (1 - OUTRO))) }
}
