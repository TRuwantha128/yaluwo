// Sri Lankan NIC numbers.
// Old cards: 9 digits + V or X, e.g. 902341234V  (year = 19 + first 2 digits, then day of year)
// New cards (2016+): 12 digits, e.g. 199023401234 (year = first 4 digits, then day of year)
// Women have 500 added to the day of the year.
// The day count treats every year as having 29 February (day 60), as the card format does.
const DAYS_IN_MONTH = [31, 29, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31]

export function parseNic(input) {
  const value = String(input ?? '').trim().toUpperCase().replace(/\s/g, '')
  let year
  let day
  let format
  if (/^\d{9}[VX]$/.test(value)) {
    format = 'OLD'
    year = 1900 + Number(value.slice(0, 2))
    day = Number(value.slice(2, 5))
  } else if (/^\d{12}$/.test(value)) {
    format = 'NEW'
    year = Number(value.slice(0, 4))
    day = Number(value.slice(4, 7))
  } else {
    return { valid: false, reason: 'An NIC has 9 digits and V or X (old cards) or 12 digits (new cards).' }
  }

  const gender = day > 500 ? 'FEMALE' : 'MALE'
  if (day > 500) day -= 500
  if (day < 1 || day > 366) return { valid: false, reason: 'The birth day in this NIC number is not possible.' }

  let month = 0
  let rest = day
  while (rest > DAYS_IN_MONTH[month]) {
    rest -= DAYS_IN_MONTH[month]
    month++
  }
  // 29 February in a year that isn't a leap year can't be a real birthday
  const leap = (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0
  if (month === 1 && rest === 29 && !leap) return { valid: false, reason: 'The birth date in this NIC number is not possible.' }

  const birthDate = `${year}-${String(month + 1).padStart(2, '0')}-${String(rest).padStart(2, '0')}`
  return { valid: true, number: value, format, birthDate, gender, year }
}

export function ageOn(birthYmd, onYmd) {
  const [by, bm, bd] = birthYmd.split('-').map(Number)
  const [y, m, d] = onYmd.split('-').map(Number)
  return y - by - (m < bm || (m === bm && d < bd) ? 1 : 0)
}
