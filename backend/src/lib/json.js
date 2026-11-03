// PostgreSQL returns JSON columns already parsed; older rows or raw text may be strings. Accept both.
export function jsonOf(value, fallback = null) {
  if (value == null) return fallback
  if (typeof value !== 'string') return value
  try {
    return JSON.parse(value)
  } catch {
    return fallback
  }
}
