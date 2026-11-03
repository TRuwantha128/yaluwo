process.env.NODE_ENV = 'test'
import zlib from 'node:zlib'
import request from 'supertest'
import { db } from '../src/db/knex.js'
import { createApp } from '../src/app.js'
import { encrypt } from '../src/lib/crypto.js'
import { generateSecret, totpAt } from '../src/lib/totp.js'
import { hashPassword } from '../src/lib/passwords.js'
import { clearSettingsCache } from '../src/services/settings.js'
import { dropAll } from '../src/db/reset.js'

export const app = createApp()
export { db }

export async function resetDb() {
  await dropAll()
  await db.migrate.latest()
  clearSettingsCache()
}

// A tiny valid PNG, different each time (so slip hashes differ)
let pngSeed = 0
export function png() {
  pngSeed++
  const crcTable = Array.from({ length: 256 }, (_, n) => {
    let c = n
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    return c >>> 0
  })
  const crc = (buf) => {
    let c = 0xffffffff
    for (const b of buf) c = crcTable[(c ^ b) & 255] ^ (c >>> 8)
    return (c ^ 0xffffffff) >>> 0
  }
  const chunk = (type, data) => {
    const len = Buffer.alloc(4)
    len.writeUInt32BE(data.length)
    const td = Buffer.concat([Buffer.from(type), data])
    const c = Buffer.alloc(4)
    c.writeUInt32BE(crc(td))
    return Buffer.concat([len, td, c])
  }
  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(2, 0)
  ihdr.writeUInt32BE(2, 4)
  ihdr[8] = 8
  ihdr[9] = 2
  const raw = Buffer.from([0, pngSeed % 255, 10, 20, 30, 40, 50, 0, 60, 70, 80, 90, 100, 110])
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', zlib.deflateSync(raw)), chunk('IEND', Buffer.alloc(0))])
}

export const call = (method, path, token) => {
  const req = request(app)[method](`/api/v1${path}`)
  if (token) req.set('Authorization', `Bearer ${token}`)
  return req
}

export async function lastCode(target) {
  const row = await db('dev_outbox').where({ to: target }).orderBy('id', 'desc').first()
  return row?.body.match(/\b(\d{6})\b/)?.[1]
}

const legal = async () => {
  const pages = await db('content_pages').select('slug', 'version')
  const v = (slug) => Math.max(...pages.filter((p) => p.slug === slug).map((p) => p.version))
  return { terms: v('terms'), privacy: v('privacy'), community: v('community') }
}

export async function register({ name, email, phone, gender = 'FEMALE', dob = '1995-03-10', partnerRole = null, password = 'Tr@velSL-2026!' }) {
  for (const [channel, target] of [['EMAIL', email], ['SMS', phone]]) {
    const s = await call('post', '/auth/otp/send').send({ channel, target, purpose: 'REGISTER' })
    if (s.status !== 200) throw new Error(`otp send ${s.status} ${JSON.stringify(s.body)}`)
  }
  const normPhone = phone.startsWith('0') ? `+94${phone.slice(1)}` : phone
  const ep = await call('post', '/auth/otp/verify').send({ channel: 'EMAIL', target: email, purpose: 'REGISTER', code: await lastCode(email) })
  const pp = await call('post', '/auth/otp/verify').send({ channel: 'SMS', target: phone, purpose: 'REGISTER', code: await lastCode(normPhone) })
  const res = await call('post', '/auth/register').send({
    fullName: name, email, phone, password, emailProof: ep.body.proof, phoneProof: pp.body.proof, gender, dateOfBirth: dob, partnerRole, accept: await legal(),
  })
  if (res.status !== 201) throw new Error(`register ${res.status} ${JSON.stringify(res.body)}`)
  return { token: res.body.accessToken, user: res.body.user, password, email, phone: normPhone }
}

// Creates the owner admin the same way the setup command does
export async function createOwner() {
  const secret = generateSecret()
  const password = 'Owner-Admin-Pass-2026!'
  const hash = await hashPassword(password)
  const [id] = await db('users').insert({ email: 'owner@yaluwo.lk', phone: '+94770000001', full_name: 'Owner Admin', password_hash: hash, totp_secret_enc: encrypt(secret), totp_enabled: true })
  await db('user_roles').insert({ user_id: id, role: 'ADMIN' })
  await db('admin_permissions').insert({ user_id: id, permission: 'OWNER' })
  await db('profiles').insert({ user_id: id })
  const login = await call('post', '/auth/login').send({ identifier: 'owner@yaluwo.lk', password, admin: true })
  const done = await call('post', '/auth/2fa/login').send({ mfaToken: login.body.mfaToken, code: totpAt(secret) })
  if (!done.body.accessToken) throw new Error(`admin login ${JSON.stringify(done.body)}`)
  return { token: done.body.accessToken, secret, password, id }
}

export async function stepUp(token, password, secret) {
  const r = await call('post', '/auth/step-up', token).send({ password, code: secret ? totpAt(secret) : undefined })
  if (!r.body.stepUpToken) throw new Error(`step-up ${JSON.stringify(r.body)}`)
  return r.body.stepUpToken
}

export async function verifyNic(person, nic, admin) {
  const r = await call('post', '/me/verifications', person.token).field('type', 'NIC').field('number', nic).attach('front', png(), 'front.png').attach('back', png(), 'back.png').attach('selfie', png(), 'selfie.png')
  if (r.status !== 201) throw new Error(`verification ${r.status} ${JSON.stringify(r.body)}`)
  const d = await call('post', `/admin/verifications/${r.body.id}/decide`, admin.token).send({ decision: 'APPROVE' })
  if (d.status !== 200) throw new Error(`approve ${JSON.stringify(d.body)}`)
  return r.body.id
}

export const ok = (res, status = 200) => {
  if (res.status !== status) throw new Error(`Expected ${status}, got ${res.status}: ${JSON.stringify(res.body)}`)
  return res.body
}
