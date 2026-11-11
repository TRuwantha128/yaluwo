// The same sums the API does (backend/src/services/pricing.js and routes.js), so the
// website can show an honest estimate before anyone signs up. Rates always come from
// GET /config (the admin's rate card); nothing here is a price.
import { distanceKm } from './places'

export const ROAD_FACTOR = 1.3 // roads in Sri Lanka are rarely straight (same factor as the API's estimate)
const round2 = (n) => Math.round((Number(n) + Number.EPSILON) * 100) / 100

export const roadKm = (a, b) => round2(distanceKm(a, b) * ROAD_FACTOR)
export const routeKm = (stops) => round2(stops.slice(1).reduce((sum, s, i) => sum + roadKm(stops[i], s), 0))

// Fixed route = max(km × rate, days × day minimum) + nights × driver allowance + return km × empty % × rate
export function fixedRoutePrice({ km, days, nights, returnKm = 0, vehicle }) {
  const distance = km * vehicle.ratePerKm
  const minimum = days * vehicle.dayMinimum
  const base = Math.max(distance, minimum)
  const empty = returnKm * (vehicle.emptyReturnPct / 100) * vehicle.ratePerKm
  const allowance = nights * vehicle.driverAllowance
  return { distance: round2(distance), minimum: round2(minimum), base: round2(base), empty: round2(empty), allowance: round2(allowance), total: round2(base + empty + allowance) }
}

// One traveller's share of the transport, plus the booking fee
export function shareOf(total, people, feePct) {
  const share = round2(total / people)
  const fee = round2((share * feePct) / 100)
  return { share, fee, total: round2(share + fee) }
}
