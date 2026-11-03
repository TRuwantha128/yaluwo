import bcrypt from 'bcryptjs'
import { bad } from './errors.js'

// Passwords seen most often in leaks. The full check (Have I Been Pwned range API)
// can be switched on later; this list blocks the obvious ones offline.
const COMMON = new Set(
  `123456 123456789 12345678 password qwerty123 qwerty 111111 12345 123123 1234567890 1234567 qwertyuiop
  000000 password1 iloveyou 1q2w3e4r 1qaz2wsx abc123 abcd1234 admin admin123 letmein welcome welcome123
  monkey dragon football baseball sunshine princess master shadow superman michael trustno1 passw0rd
  password123 password1234 qwerty1234 zaq12wsx asdfghjkl asdf1234 changeme default secret computer
  srilanka srilanka123 colombo colombo123 kandy123 lanka123 yaluwo yaluwo123 1234554321 987654321
  11111111 22222222 88888888 99999999 123321 654321 666666 7777777 121212 aaaaaa q1w2e3r4t5`.split(/\s+/),
)

export async function hashPassword(password) {
  return bcrypt.hash(password, 12)
}

export async function checkPassword(password, hash) {
  if (!hash) return false
  return bcrypt.compare(password, hash)
}

// min comes from the settings (10 for users, 14 for admin and staff)
export function validatePassword(password, { min, email = '', name = '' }) {
  const p = String(password ?? '')
  if (p.length < min) throw bad(`Use at least ${min} characters.`, { fields: { password: `At least ${min} characters` } })
  if (p.length > 128) throw bad('Use 128 characters or fewer.')
  const lower = p.toLowerCase()
  if (COMMON.has(lower) || COMMON.has(lower.replace(/\d+$/, ''))) throw bad('This password is too common. Choose something harder to guess.', { fields: { password: 'Too common' } })
  if (/^(.)\1+$/.test(p)) throw bad('Do not use one repeated character.')
  const local = email.split('@')[0]?.toLowerCase()
  if (local && local.length >= 4 && lower.includes(local)) throw bad('Do not use your email address in your password.')
  const first = name.split(' ')[0]?.toLowerCase()
  if (first && first.length >= 4 && lower === first) throw bad('Do not use your name as your password.')
}
