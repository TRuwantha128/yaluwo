import crypto from 'node:crypto'

// Two-step login codes (TOTP, RFC 6238), the same codes Google Authenticator,
// Microsoft Authenticator and Authy show. 30-second steps, 6 digits, SHA-1.
const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567'

export function base32Encode(buffer) {
  let bits = 0
  let value = 0
  let out = ''
  for (const byte of buffer) {
    value = (value << 8) | byte
    bits += 8
    while (bits >= 5) {
      out += ALPHABET[(value >>> (bits - 5)) & 31]
      bits -= 5
    }
  }
  if (bits > 0) out += ALPHABET[(value << (5 - bits)) & 31]
  return out
}

export function base32Decode(text) {
  const clean = text.replace(/=+$/, '').replace(/\s/g, '').toUpperCase()
  let bits = 0
  let value = 0
  const out = []
  for (const ch of clean) {
    const idx = ALPHABET.indexOf(ch)
    if (idx < 0) throw new Error('Invalid base32')
    value = (value << 5) | idx
    bits += 5
    if (bits >= 8) {
      out.push((value >>> (bits - 8)) & 255)
      bits -= 8
    }
  }
  return Buffer.from(out)
}

export const generateSecret = () => base32Encode(crypto.randomBytes(20))

export function totpAt(secret, time = Date.now(), step = 30, digits = 6) {
  const counter = Math.floor(time / 1000 / step)
  const buf = Buffer.alloc(8)
  buf.writeBigUInt64BE(BigInt(counter))
  const h = crypto.createHmac('sha1', base32Decode(secret)).update(buf).digest()
  const offset = h[h.length - 1] & 15
  const code = ((h.readUInt32BE(offset) & 0x7fffffff) % 10 ** digits).toString()
  return code.padStart(digits, '0')
}

// Accepts the code for now and one step either side (clock drift)
export function verifyTotp(secret, code, time = Date.now()) {
  const clean = String(code ?? '').replace(/\s/g, '')
  if (!/^\d{6}$/.test(clean)) return false
  return [-1, 0, 1].some((w) => crypto.timingSafeEqual(Buffer.from(totpAt(secret, time + w * 30000)), Buffer.from(clean)))
}

export const otpauthUrl = (secret, account, issuer = 'Yaluwo') =>
  `otpauth://totp/${encodeURIComponent(`${issuer}:${account}`)}?secret=${secret}&issuer=${encodeURIComponent(issuer)}&algorithm=SHA1&digits=6&period=30`
