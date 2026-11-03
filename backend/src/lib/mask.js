// Before a trip is Confirmed, phone numbers, emails, links and requests to pay
// outside Yaluwo are hidden in chat and trip descriptions (workflow section 8).
const PATTERNS = [
  // phone numbers: +94 77 123 4567, 0771234567, 077-123-4567, 94771234567
  /(?:\+?94|0)[\s\-.]?(?:7\d|[1-9]\d)[\s\-.]?\d{3}[\s\-.]?\d{4}/g,
  // any long run of digits (8+), possibly spaced, e.g. "seven seven ..." is not caught but digits are
  /\b(?:\d[\s\-.]?){8,}\d\b/g,
  // emails
  /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi,
  // links and handles
  /\b(?:https?:\/\/|www\.)\S+/gi,
  /\b[\w-]+\.(?:com|lk|net|org|io|me|co|app|link|ly)(?:\/\S*)?\b/gi,
  /(?:wa\.me|whatsapp|viber|telegram|t\.me|instagram|insta|facebook|fb\.com|imo)\S*/gi,
  /@[A-Za-z0-9_.]{3,}/g,
]
const OFF_PLATFORM = /\b(pay|send|transfer|deposit)\b[^.!?]{0,40}\b(cash|direct(ly)?|outside|my account|bank account|ez ?cash|frimi|genie)\b/gi

export function maskContacts(text) {
  let masked = String(text ?? '')
  let found = false
  for (const re of PATTERNS) {
    masked = masked.replace(re, () => {
      found = true
      return '[hidden until the trip is confirmed]'
    })
  }
  masked = masked.replace(OFF_PLATFORM, () => {
    found = true
    return '[payments only through Yaluwo]'
  })
  return { masked, found }
}

export const hasContactDetails = (text) => maskContacts(text).found
