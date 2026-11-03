// Prices (workflow sections 9 and 12). All amounts in rupees, rounded to cents.
export const round2 = (n) => Math.round((Number(n) + Number.EPSILON) * 100) / 100
const num = (v) => Number(v ?? 0)

// Suggested transport price for one vehicle type on one route.
//   Fixed route    = max(km × rate per km, days × day minimum) + nights × driver allowance + return km × empty-return % × rate per km
//   Flexible route = days × daily rate + extra km × rate per km + nights × driver allowance
export function suggestedTransportPrice({ km, days, nights, flexible, returnKm = 0, rates }) {
  const perKm = num(rates.rate_per_km ?? rates.ratePerKm)
  const dayMin = num(rates.day_minimum ?? rates.dayMinimum)
  const daily = num(rates.daily_rate ?? rates.dailyRate)
  const dailyKm = num(rates.daily_km ?? rates.dailyKm)
  const allowance = num(rates.driver_allowance ?? rates.driverAllowance)
  const emptyPct = num(rates.empty_return_pct ?? rates.emptyReturnPct)
  const lines = []
  let total
  if (flexible) {
    const included = days * dailyKm
    const extraKm = Math.max(0, km - included)
    lines.push({ label: `Daily rate ${days} × ${daily}`, amount: round2(days * daily) })
    if (extraKm > 0) lines.push({ label: `Extra km ${round2(extraKm)} × ${perKm}`, amount: round2(extraKm * perKm) })
    total = days * daily + extraKm * perKm
  } else {
    const distance = km * perKm
    const minimum = days * dayMin
    lines.push({ label: `Distance ${round2(km)} km × ${perKm}`, amount: round2(distance) })
    lines.push({ label: `Day minimum ${days} × ${dayMin}`, amount: round2(minimum) })
    lines.push({ label: 'Higher of the two', amount: round2(Math.max(distance, minimum)), bold: true })
    total = Math.max(distance, minimum)
    if (returnKm > 0) {
      const empty = returnKm * (emptyPct / 100) * perKm
      lines.push({ label: `Empty return ${round2(returnKm)} km × ${emptyPct}% × ${perKm}`, amount: round2(empty) })
      total += empty
    }
  }
  if (nights > 0) {
    lines.push({ label: `Driver allowance ${nights} × ${allowance}`, amount: round2(nights * allowance) })
    total += nights * allowance
  }
  return { total: round2(total), lines }
}

// The 70%–130% band a driver's own price or offer must stay in
export const priceBand = (suggested, minPct, maxPct) => ({ min: round2((suggested * minPct) / 100), max: round2((suggested * maxPct) / 100) })

// Split an amount into n parts that add up exactly (the first parts get the extra cents)
export function splitEven(total, n) {
  const cents = Math.round(total * 100)
  const base = Math.floor(cents / n)
  const rest = cents - base * n
  return Array.from({ length: n }, (_, i) => (base + (i < rest ? 1 : 0)) / 100)
}

// Each member's share of the booked services, plus the booking fee (section 12)
export function memberShares(servicesTotal, memberIds, feePct) {
  const parts = splitEven(servicesTotal, memberIds.length)
  return memberIds.map((id, i) => {
    const share = parts[i]
    const fee = round2((share * feePct) / 100)
    return { memberId: id, share, fee, total: round2(share + fee) }
  })
}

export const commissionOf = (amount, pct) => {
  const commission = round2((amount * pct) / 100)
  return { commission, net: round2(amount - commission) }
}

// Straight-line distance (km)
export function haversineKm(a, b) {
  const rad = (x) => (x * Math.PI) / 180
  const dLat = rad(b.lat - a.lat)
  const dLng = rad(b.lng - a.lng)
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2
  return 6371 * 2 * Math.asin(Math.sqrt(h))
}
