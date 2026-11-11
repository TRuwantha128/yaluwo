const dayFmt = new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short' })
const fullFmt = new Intl.DateTimeFormat('en-GB', { weekday: 'short', day: 'numeric', month: 'short' })

export const rs = (n) => `Rs ${Number(n || 0).toLocaleString('en-LK')}`

export const totalNights = (stops) => stops.reduce((sum, s) => sum + Number(s.nights || 0), 0)

export const tripDays = (stops) => totalNights(stops) + 1

function parse(date) {
  const [y, m, d] = date.split('-').map(Number)
  return new Date(y, m - 1, d)
}

export function addDays(date, days) {
  const d = parse(date)
  d.setDate(d.getDate() + days)
  return d
}

export function dateRange(startDate, stops) {
  if (!startDate) return 'Dates not set'
  const start = parse(startDate)
  const end = addDays(startDate, totalNights(stops))
  return start.getTime() === end.getTime() ? dayFmt.format(start) : `${dayFmt.format(start)} – ${dayFmt.format(end)}`
}

// Arrival date at each stop, e.g. "Sat 14 Nov"
export function stopDates(startDate, stops) {
  let offset = 0
  return stops.map((s) => {
    const label = startDate ? fullFmt.format(addDays(startDate, offset)) : `Day ${offset + 1}`
    offset += Number(s.nights || 0)
    return label
  })
}

export function routeLabel(stops, max = 3) {
  const names = stops.map((s) => s.name)
  if (names.length <= max) return names.join(' → ')
  return `${names.slice(0, max).join(' → ')} +${names.length - max}`
}

export const seatsLeft = (trip) => Math.max(0, trip.seats - trip.members.length)

export const initials = (name = '') =>
  name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0].toUpperCase())
    .join('')

// Google Maps link with every stop as a waypoint (works without an API key)
export function googleMapsRouteUrl(stops) {
  const point = (s) => `${s.lat},${s.lng}`
  if (stops.length === 1) return `https://www.google.com/maps/search/?api=1&query=${point(stops[0])}`
  const params = new URLSearchParams({ api: '1', origin: point(stops[0]), destination: point(stops.at(-1)), travelmode: 'driving' })
  if (stops.length > 2) params.set('waypoints', stops.slice(1, -1).map(point).join('|'))
  return `https://www.google.com/maps/dir/?${params}`
}
// The next 12 months, for "when" pickers
const monthFmt = new Intl.DateTimeFormat('en-GB', { month: 'long', year: 'numeric' })
export const NEXT_MONTHS = Array.from({ length: 12 }, (_, i) => {
  const d = new Date()
  d.setDate(1)
  d.setMonth(d.getMonth() + i)
  return { value: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`, label: monthFmt.format(d) }
})
