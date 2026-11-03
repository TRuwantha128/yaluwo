// Sri Lanka is UTC+05:30 all year (no daylight saving), so trip dates are
// worked out in Colombo time. The database stores every time in UTC.
const OFFSET_MS = 330 * 60 * 1000
const DAY = 24 * 60 * 60 * 1000

// Lets tests move the clock: setClock(() => new Date('2026-11-20T10:00:00Z'))
let clock = () => new Date()
export const setClock = (fn) => {
  clock = fn ?? (() => new Date())
}
export const now = () => clock()

export const addHours = (date, h) => new Date(new Date(date).getTime() + h * 3600 * 1000)
export const addMinutes = (date, m) => new Date(new Date(date).getTime() + m * 60 * 1000)
export const addDaysDate = (date, d) => new Date(new Date(date).getTime() + d * DAY)

// 'YYYY-MM-DD' of a moment, in Colombo
export function colomboDate(date = now()) {
  return new Date(new Date(date).getTime() + OFFSET_MS).toISOString().slice(0, 10)
}

// Midnight at the start of a Colombo date, as a UTC Date
export const colomboMidnight = (ymd) => new Date(new Date(`${ymd}T00:00:00Z`).getTime() - OFFSET_MS)

export function addDays(ymd, days) {
  const d = new Date(`${ymd}T00:00:00Z`)
  d.setUTCDate(d.getUTCDate() + days)
  return d.toISOString().slice(0, 10)
}

export const daysBetween = (fromYmd, toYmd) => Math.round((new Date(`${toYmd}T00:00:00Z`) - new Date(`${fromYmd}T00:00:00Z`)) / DAY)

// Monday to Friday. (Poya and public holidays are not counted yet: a list can be added in settings.)
export function addWorkingDays(ymd, n) {
  let d = ymd
  let added = 0
  while (added < n) {
    d = addDays(d, 1)
    const day = new Date(`${d}T00:00:00Z`).getUTCDay()
    if (day !== 0 && day !== 6) added++
  }
  return d
}

export const monthCode = (date = now()) => colomboDate(date).slice(2, 7).replace('-', '') // "2611"
