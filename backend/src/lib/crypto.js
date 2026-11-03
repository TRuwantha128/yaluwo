import crypto from 'node:crypto'
import { env } from '../config/env.js'

const KEY = Buffer.from(env.dataKey, 'hex')

// AES-256-GCM for NIC, licence and bank numbers and two-step secrets
export function encrypt(text) {
  if (text == null) return null
  const iv = crypto.randomBytes(12)
  const cipher = crypto.createCipheriv('aes-256-gcm', KEY, iv)
  const data = Buffer.concat([cipher.update(String(text), 'utf8'), cipher.final()])
  return ['v1', iv.toString('base64'), cipher.getAuthTag().toString('base64'), data.toString('base64')].join(':')
}

export function decrypt(payload) {
  if (!payload) return null
  const [v, iv, tag, data] = payload.split(':')
  if (v !== 'v1') throw new Error('Unknown encryption version')
  const decipher = crypto.createDecipheriv('aes-256-gcm', KEY, Buffer.from(iv, 'base64'))
  decipher.setAuthTag(Buffer.from(tag, 'base64'))
  return Buffer.concat([decipher.update(Buffer.from(data, 'base64')), decipher.final()]).toString('utf8')
}

export const sha256 = (value) => crypto.createHash('sha256').update(String(value)).digest('hex')
// Keyed hash, so an ID number can be checked for duplicates without storing it in the clear
export const lookupHash = (value) => crypto.createHmac('sha256', KEY).update(String(value).trim().toUpperCase()).digest('hex')
export const hmac = (secret, value) => crypto.createHmac('sha256', secret).update(String(value)).digest('hex')
export const randomToken = (bytes = 32) => crypto.randomBytes(bytes).toString('base64url')
export const randomDigits = (length = 6) => String(crypto.randomInt(0, 10 ** length)).padStart(length, '0')
export const safeEqual = (a, b) => {
  const x = Buffer.from(String(a))
  const y = Buffer.from(String(b))
  return x.length === y.length && crypto.timingSafeEqual(x, y)
}
export const md5Upper = (value) => crypto.createHash('md5').update(String(value)).digest('hex').toUpperCase()

export const mask = (value, keep = 4) => {
  if (!value) return ''
  const s = String(value)
  return `${'•'.repeat(Math.max(0, s.length - keep))}${s.slice(-keep)}`
}
