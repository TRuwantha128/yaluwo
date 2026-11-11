import { Router } from 'express'
import { z } from 'zod'
import QRCode from 'qrcode'
import { db } from '../db/knex.js'
import { env } from '../config/env.js'
import { parse, limiter } from '../middleware/http.js'
import { loadUser, requireAuth, signShort, verifyShort } from '../middleware/auth.js'
import { bad, conflict, forbidden, tooMany, unauthorized, unavailable } from '../lib/errors.js'
import { decrypt, encrypt, randomDigits, randomToken, sha256 } from '../lib/crypto.js'
import { generateSecret, otpauthUrl, verifyTotp } from '../lib/totp.js'
import { checkPassword, hashPassword, validatePassword } from '../lib/passwords.js'
import { addHours, addMinutes, colomboDate, now } from '../lib/time.js'
import { ageOn } from '../lib/nic.js'
import { settings, setting } from '../services/settings.js'
import { sendEmail, sendSms } from '../services/messages.js'
import { cookieOptions, endSession, issueSession, refreshSession, revokeAll, REFRESH_COOKIE } from '../services/sessions.js'
import { audit } from '../services/audit.js'
import { notify, adminIds } from '../services/notify.js'

const r = Router()

const email = z.string().trim().toLowerCase().email('Enter a valid email address').max(190)
// Sri Lankan mobiles as +947XXXXXXXX; foreign numbers in + format
const phone = z
  .string()
  .trim()
  .transform((v) => v.replace(/[\s-]/g, ''))
  .transform((v) => (/^0\d{9}$/.test(v) ? `+94${v.slice(1)}` : /^94\d{9}$/.test(v) ? `+${v}` : v))
  .refine((v) => /^\+\d{9,15}$/.test(v), 'Enter a mobile number like 077 123 4567')

const PARTNER_ROLES = ['DRIVER', 'FLEET', 'SUPPLIER', 'GUIDE', 'ACTIVITY']

// The mobile number is confirmed by SMS code whenever a code can reach the person
// (a real gateway, or demo codes). Without either, sign-up asks for the email code only
// and the number stays "not confirmed" until a gateway is connected.
export const phoneCodeNeeded = () => env.canSms || env.isTest

// ---------- Codes (6 digits, 5 minutes, at most 3 an hour) ----------
async function sendCode({ channel, target, purpose }) {
  const { minutes, perHour } = await settings({ minutes: 'accounts.otp_minutes', perHour: 'accounts.otp_per_hour' })
  const can = channel === 'EMAIL' ? env.canEmail : env.canSms
  // Nothing can deliver this code and it may not be shown on the page: say so instead of pretending
  if (!can && !env.demoCodes && !env.isTest) throw unavailable(channel === 'EMAIL' ? 'Email sending is not set up on the server yet. Please tell the site owner.' : 'SMS sending is not set up on the server yet.')
  const recent = await db('otp_codes').where({ target, purpose }).where('created_at', '>', addHours(now(), -1)).count({ n: '*' }).first()
  if (recent.n >= perHour) throw tooMany('Too many codes requested. Try again in an hour.')
  const code = randomDigits(6)
  await db('otp_codes').insert({ target, channel, purpose, code_hash: sha256(`${target}:${code}`), expires_at: addMinutes(now(), minutes) })
  const text = `Your Yaluwo code is ${code}. It expires in ${minutes} minutes. Never share it with anyone.`
  const delivered = channel === 'EMAIL' ? await sendEmail(target, `Your Yaluwo code: ${code}`, text) : await sendSms(target, text)
  if (!delivered && can && !env.demoCodes) throw unavailable(`We could not send the code by ${channel === 'EMAIL' ? 'email' : 'SMS'} just now. Check the ${channel === 'EMAIL' ? 'address' : 'number'} and try again.`)
  // Test mode (payments not live): the page shows the code too, so sign-up never depends on the email arriving
  return { minutes, delivered, demoCode: env.demoCodes ? code : undefined }
}

async function checkCode({ target, purpose, code }) {
  const row = await db('otp_codes').where({ target, purpose }).whereNull('used_at').orderBy('id', 'desc').first()
  if (!row || new Date(row.expires_at) < now()) throw bad('This code has expired. Ask for a new one.')
  if (row.tries >= 5) throw tooMany('Too many wrong codes. Ask for a new one.')
  if (row.code_hash !== sha256(`${target}:${String(code).trim()}`)) {
    await db('otp_codes').where({ id: row.id }).increment('tries', 1)
    throw bad('That code is not right.', { fields: { code: 'Wrong code' } })
  }
  await db('otp_codes').where({ id: row.id }).update({ used_at: now() })
}

r.post('/otp/send', limiter(20), async (req, res) => {
  const body = parse(z.object({ channel: z.enum(['EMAIL', 'SMS']), target: z.string().min(3), purpose: z.enum(['REGISTER']) }), req.body)
  const target = body.channel === 'EMAIL' ? parse(email, body.target) : parse(phone, body.target)
  const taken = await db('users').where(body.channel === 'EMAIL' ? { email: target } : { phone: target }).first()
  if (taken) throw conflict(body.channel === 'EMAIL' ? 'An account with this email already exists. Log in instead.' : 'This mobile number is already used by an account.')
  if (body.channel === 'SMS' && !phoneCodeNeeded()) return res.json({ sent: false, skipped: true, target })
  const { minutes, delivered, demoCode } = await sendCode({ channel: body.channel, target, purpose: body.purpose })
  res.json({ sent: true, target, minutes, delivered, demoCode })
})

r.post('/otp/verify', limiter(30), async (req, res) => {
  const body = parse(z.object({ channel: z.enum(['EMAIL', 'SMS']), target: z.string(), purpose: z.enum(['REGISTER']), code: z.string().regex(/^\d{6}$/, 'Enter the 6-digit code') }), req.body)
  const target = body.channel === 'EMAIL' ? parse(email, body.target) : parse(phone, body.target)
  await checkCode({ target, purpose: body.purpose, code: body.code })
  res.json({ proof: signShort({ typ: 'otp', target, channel: body.channel, purpose: body.purpose }, 30) })
})

// ---------- Register ----------
r.post('/register', limiter(10), async (req, res) => {
  const askedRoles = [req.body?.role, req.body?.partnerRole, ...[].concat(req.body?.roles ?? [])]
  if (askedRoles.some((x) => ['ADMIN', 'STAFF'].includes(String(x).toUpperCase()))) throw forbidden('Admin and staff accounts cannot be created here.')
  const body = parse(
    z.object({
      fullName: z.string().trim().min(3, 'Enter your full name as on your ID').max(120),
      email,
      phone,
      password: z.string(),
      emailProof: z.string(),
      phoneProof: z.string().nullable().optional(),
      gender: z.enum(['MALE', 'FEMALE']),
      dateOfBirth: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Enter your date of birth'),
      nationality: z.string().length(2).default('LK'),
      partnerRole: z.enum(PARTNER_ROLES).nullable().optional(),
      // Admin and staff can never be chosen here (workflow section 4)
      accept: z.object({ terms: z.number().int(), privacy: z.number().int(), community: z.number().int() }),
    }),
    req.body,
  )

  const ep = verifyShort(body.emailProof, 'otp')
  const pp = body.phoneProof ? verifyShort(body.phoneProof, 'otp') : null
  if (!ep || ep.target !== body.email || ep.channel !== 'EMAIL') throw bad('Confirm your email with the code first.', { fields: { email: 'Not confirmed' } })
  const phoneConfirmed = Boolean(pp && pp.target === body.phone && pp.channel === 'SMS')
  if (!phoneConfirmed && phoneCodeNeeded()) throw bad('Confirm your mobile number with the code first.', { fields: { phone: 'Not confirmed' } })

  const { minAge, min } = await settings({ minAge: 'accounts.min_age', min: 'accounts.password_min' })
  if (ageOn(body.dateOfBirth, colomboDate()) < minAge) throw bad(`You must be ${minAge} or older to use Yaluwo.`, { fields: { dateOfBirth: `${minAge}+ only` } })
  validatePassword(body.password, { min, email: body.email, name: body.fullName })

  // The person must accept the current version of each page
  for (const page of ['terms', 'privacy', 'community']) {
    const current = await db('content_pages').where({ slug: page, language: 'en' }).whereNotNull('published_at').orderBy('version', 'desc').first()
    if (current && body.accept[page] !== current.version) throw bad('Please accept the current terms, privacy notice and community guidelines.')
  }

  const hash = await hashPassword(body.password)
  const userId = await db.transaction(async (trx) => {
    if (await trx('users').where({ email: body.email }).orWhere({ phone: body.phone }).first()) throw conflict('An account with this email or mobile number already exists.')
    const [id] = await trx('users').insert({
      email: body.email,
      phone: body.phone,
      password_hash: hash,
      full_name: body.fullName,
      gender: body.gender,
      date_of_birth: body.dateOfBirth,
      nationality: body.nationality.toUpperCase(),
      email_verified_at: now(),
      phone_verified_at: phoneConfirmed ? now() : null,
      password_changed_at: now(),
    })
    await trx('user_roles').insert([{ user_id: id, role: 'TRAVELLER' }, ...(body.partnerRole ? [{ user_id: id, role: body.partnerRole }] : [])])
    await trx('profiles').insert({ user_id: id })
    await trx('password_history').insert({ user_id: id, password_hash: hash })
    for (const page of ['terms', 'privacy', 'community']) await trx('consents').insert({ user_id: id, page, version: body.accept[page], ip: req.ip, accepted_at: now() })
    return id
  })

  const user = await loadUser(userId)
  const session = await issueSession(req, res, user, { notifyNewDevice: false })
  res.status(201).json({ ...session, user: publicSelf(user) })
})

// ---------- Login ----------
const identifierWhere = (identifier) => (identifier.includes('@') ? { email: identifier.trim().toLowerCase() } : { phone: parse(phone, identifier) })

r.post('/login', limiter(20), async (req, res) => {
  const body = parse(z.object({ identifier: z.string().min(3, 'Enter your email or mobile'), password: z.string().min(1, 'Enter your password'), admin: z.boolean().optional() }), req.body)
  const where = identifierWhere(body.identifier)
  const user = await db('users').where(where).first()
  const { tries, lockMinutes } = await settings({ tries: 'accounts.lockout_tries', lockMinutes: 'accounts.lockout_minutes' })
  const fail = () => unauthorized('The email, mobile or password is not right.')

  if (!user) {
    await hashPassword('timing-equaliser') // same response time whether or not the account exists
    throw fail()
  }
  if (user.locked_until && new Date(user.locked_until) > now()) throw tooMany(`Too many failed tries. Try again after ${lockMinutes} minutes or reset your password.`)
  if (user.status === 'LOCKED') throw unauthorized('This account is locked for safety. Reset your password to unlock it, or contact support.')
  if (user.status === 'BANNED') throw unauthorized('This account has been closed.')

  if (!(await checkPassword(body.password, user.password_hash))) {
    const failed = user.failed_logins + 1
    await db('users').where({ id: user.id }).update({ failed_logins: failed, locked_until: failed >= tries ? addMinutes(now(), lockMinutes) : null })
    throw fail()
  }

  const full = await loadUser(user.id)
  if (body.admin && !full.isAdmin) throw fail()
  if (!body.admin && full.isAdmin) throw forbidden('Admin accounts log in from the admin login page.')
  if (full.isAdmin && !user.totp_enabled) throw forbidden('Two-step login must be set up for this admin account. Run the setup command again.')

  if (user.totp_enabled) {
    return res.json({ mfaRequired: true, mfaToken: signShort({ typ: 'mfa', sub: String(user.id) }, 5) })
  }
  const session = await issueSession(req, res, full)
  res.json({ ...session, user: publicSelf(full) })
})

async function useBackupCode(userId, code) {
  const rows = await db('backup_codes').where({ user_id: userId }).whereNull('used_at')
  const clean = String(code ?? '').replace(/[\s-]/g, '').toUpperCase()
  const row = rows.find((b) => b.code_hash === sha256(clean))
  if (!row) return false
  await db('backup_codes').where({ id: row.id }).update({ used_at: now() })
  return true
}

async function checkSecondFactor(user, { code, backupCode }) {
  if (code && verifyTotp(decrypt(user.totp_secret_enc), code)) return true
  if (backupCode && (await useBackupCode(user.id, backupCode))) return true
  return false
}

r.post('/2fa/login', limiter(20), async (req, res) => {
  const body = parse(z.object({ mfaToken: z.string(), code: z.string().optional(), backupCode: z.string().optional() }), req.body)
  const p = verifyShort(body.mfaToken, 'mfa')
  if (!p) throw unauthorized('The login took too long. Start again.')
  const user = await db('users').where({ id: p.sub }).first()
  if (!(await checkSecondFactor(user, body))) {
    const failed = user.failed_logins + 1
    const { tries, lockMinutes } = await settings({ tries: 'accounts.lockout_tries', lockMinutes: 'accounts.lockout_minutes' })
    await db('users').where({ id: user.id }).update({ failed_logins: failed, locked_until: failed >= tries ? addMinutes(now(), lockMinutes) : null })
    throw unauthorized('That code is not right.')
  }
  const full = await loadUser(user.id)
  const session = await issueSession(req, res, full)
  if (full.isAdmin) await audit({ actorId: user.id, action: 'ADMIN_LOGIN', ip: req.ip })
  res.json({ ...session, user: publicSelf(full) })
})

r.post('/refresh', async (req, res) => {
  // A first-time visitor has no session: not an error
  if (!req.cookies?.[REFRESH_COOKIE]) return res.status(204).end()
  const session = await refreshSession(req, res)
  if (!session) {
    res.clearCookie(REFRESH_COOKIE, cookieOptions())
    throw unauthorized('Your session has ended. Please log in again.')
  }
  const p = verifyShort(session.accessToken, 'access')
  const user = await loadUser(p.sub)
  res.json({ ...session, user: publicSelf(user) })
})

r.post('/logout', async (req, res) => {
  await endSession(req, res)
  res.json({ ok: true })
})

r.post('/sessions/revoke-all', requireAuth, async (req, res) => {
  await revokeAll(req.user.id)
  res.clearCookie(REFRESH_COOKIE, cookieOptions())
  res.json({ ok: true })
})

r.get('/me', requireAuth, async (req, res) => {
  res.json({ user: publicSelf(req.user) })
})

// ---------- Two-step login ----------
r.post('/2fa/setup', requireAuth, async (req, res) => {
  if (req.user.totp_enabled) throw conflict('Two-step login is already on.')
  const secret = generateSecret()
  await db('users').where({ id: req.user.id }).update({ totp_secret_enc: encrypt(secret) })
  const url = otpauthUrl(secret, req.user.email)
  res.json({ secret, otpauthUrl: url, qr: await QRCode.toDataURL(url, { margin: 1, width: 220 }) })
})

export async function createBackupCodes(userId, trx = db) {
  const codes = Array.from({ length: 10 }, () => randomToken(6).replace(/[^A-Za-z0-9]/g, '').slice(0, 8).toUpperCase().padEnd(8, 'X'))
  await trx('backup_codes').where({ user_id: userId }).del()
  await trx('backup_codes').insert(codes.map((c) => ({ user_id: userId, code_hash: sha256(c) })))
  return codes.map((c) => `${c.slice(0, 4)}-${c.slice(4)}`)
}

r.post('/2fa/enable', requireAuth, async (req, res) => {
  const { code } = parse(z.object({ code: z.string() }), req.body)
  const user = await db('users').where({ id: req.user.id }).first()
  if (!user.totp_secret_enc || !verifyTotp(decrypt(user.totp_secret_enc), code)) throw bad('That code is not right. Check the time on your phone and try again.')
  await db('users').where({ id: user.id }).update({ totp_enabled: true })
  const backupCodes = await createBackupCodes(user.id)
  await sendEmail(user.email, 'Two-step login is on', 'Two-step login is now on for your Yaluwo account. Keep your backup codes somewhere safe.')
  res.json({ enabled: true, backupCodes })
})

r.post('/2fa/disable', requireAuth, async (req, res) => {
  const body = parse(z.object({ password: z.string(), code: z.string() }), req.body)
  const user = await db('users').where({ id: req.user.id }).first()
  const partner = req.user.roles.some((x) => PARTNER_ROLES.includes(x))
  if (req.user.isAdmin || partner) throw forbidden('Two-step login is required for admin and partner accounts.')
  if (!(await checkPassword(body.password, user.password_hash)) || !verifyTotp(decrypt(user.totp_secret_enc), body.code)) throw bad('The password or code is not right.')
  await db('users').where({ id: user.id }).update({ totp_enabled: false, totp_secret_enc: null })
  await db('backup_codes').where({ user_id: user.id }).del()
  res.json({ enabled: false })
})

// ---------- Step-up (re-confirm before sensitive actions) ----------
r.post('/step-up', requireAuth, limiter(20), async (req, res) => {
  const body = parse(z.object({ password: z.string(), code: z.string().optional(), backupCode: z.string().optional() }), req.body)
  const user = await db('users').where({ id: req.user.id }).first()
  if (!(await checkPassword(body.password, user.password_hash))) throw bad('The password is not right.')
  if (user.totp_enabled && !(await checkSecondFactor(user, body))) throw bad('The code is not right.')
  if (req.user.isAdmin) await audit({ actorId: user.id, action: 'STEP_UP', ip: req.ip })
  res.json({ stepUpToken: signShort({ typ: 'stepup', sub: String(user.id) }, 5), expiresIn: 300 })
})

// ---------- Passwords ----------
async function setNewPassword(userId, password, trx = db) {
  const user = await trx('users').where({ id: userId }).first()
  const full = await loadUser(userId)
  const min = await setting(full.isAdmin ? 'accounts.admin_password_min' : 'accounts.password_min')
  validatePassword(password, { min, email: user.email, name: user.full_name })
  const history = await trx('password_history').where({ user_id: userId }).orderBy('id', 'desc').limit(5)
  for (const h of history) if (await checkPassword(password, h.password_hash)) throw bad("You can't reuse one of your last 5 passwords.")
  const hash = await hashPassword(password)
  await trx('users').where({ id: userId }).update({ password_hash: hash, password_changed_at: now(), failed_logins: 0, locked_until: null })
  await trx('password_history').insert({ user_id: userId, password_hash: hash })
  return { user, full }
}

async function sendNotMeLink(user, what) {
  const token = randomToken(24)
  await db('security_tokens').insert({ user_id: user.id, purpose: 'NOT_ME', token_hash: sha256(token), expires_at: addHours(now(), 72) })
  await sendEmail(user.email, `${what} on your Yaluwo account`, `${what} on your account just now.\n\nIf this wasn't you, open this link straight away to lock your account:\n${env.appUrl}/not-me/${token}\n\nYaluwo`)
}

r.post('/password/change', requireAuth, limiter(10), async (req, res) => {
  const body = parse(z.object({ current: z.string(), next: z.string(), confirm: z.string(), code: z.string().optional() }), req.body)
  if (body.next !== body.confirm) throw bad('The new passwords do not match.', { fields: { confirm: 'Does not match' } })
  const user = await db('users').where({ id: req.user.id }).first()
  if (!(await checkPassword(body.current, user.password_hash))) throw bad('Your current password is not right.', { fields: { current: 'Not right' } })
  if (user.totp_enabled && !verifyTotp(decrypt(user.totp_secret_enc), body.code)) throw bad('Enter the code from your authenticator app.', { fields: { code: 'Not right' } })
  await setNewPassword(user.id, body.next)
  await revokeAll(user.id, req.cookies?.[REFRESH_COOKIE]) // other devices are logged out
  await sendNotMeLink(user, 'Your password was changed')
  if (req.user.isAdmin) await audit({ actorId: user.id, action: 'ADMIN_PASSWORD_CHANGED', ip: req.ip })
  res.json({ ok: true })
})

// Same reply whether or not the account exists, so nobody can test which emails are registered
const FORGOT_REPLY = { message: "If an account exists, we've sent a link or code." }

r.post('/password/forgot', limiter(10), async (req, res) => {
  const { identifier } = parse(z.object({ identifier: z.string().min(3) }), req.body)
  let where
  try {
    where = identifierWhere(identifier)
  } catch {
    return res.json(FORGOT_REPLY)
  }
  const user = await db('users').where(where).first()
  if (!user || user.status === 'BANNED') return res.json(FORGOT_REPLY)
  const full = await loadUser(user.id)
  const recent = await db('security_tokens').where({ user_id: user.id }).whereIn('purpose', ['RESET_EMAIL', 'RESET_SMS']).where('created_at', '>', addHours(now(), -1)).count({ n: '*' }).first()
  if (recent.n >= (await setting('accounts.otp_per_hour'))) return res.json(FORGOT_REPLY)

  if (where.email || full.isAdmin) {
    // The owner admin has no SMS reset (workflow section 4)
    const token = randomToken(32)
    const minutes = await setting('accounts.reset_link_minutes')
    await db('security_tokens').insert({ user_id: user.id, purpose: 'RESET_EMAIL', token_hash: sha256(token), ip: req.ip, expires_at: addMinutes(now(), minutes) })
    const path = full.isAdmin ? '/admin/reset' : '/reset-password'
    await sendEmail(user.email, 'Reset your Yaluwo password', `Use this link to choose a new password. It works once and lasts ${minutes} minutes:\n${env.appUrl}${path}/${token}\n\nIf you didn't ask for this, ignore this email.`)
  } else {
    const code = randomDigits(6)
    const minutes = await setting('accounts.otp_minutes')
    await db('security_tokens').insert({ user_id: user.id, purpose: 'RESET_SMS', token_hash: sha256(`${user.id}:${code}`), ip: req.ip, expires_at: addMinutes(now(), minutes) })
    await sendSms(user.phone, `Your Yaluwo password reset code is ${code}. It expires in ${minutes} minutes.`)
  }
  res.json(FORGOT_REPLY)
})

r.post('/password/reset', limiter(10), async (req, res) => {
  const body = parse(
    z.object({ token: z.string().optional(), phone: z.string().optional(), smsCode: z.string().optional(), password: z.string(), confirm: z.string(), code: z.string().optional(), backupCode: z.string().optional() }),
    req.body,
  )
  if (body.password !== body.confirm) throw bad('The passwords do not match.', { fields: { confirm: 'Does not match' } })
  let row
  if (body.token) {
    row = await db('security_tokens').where({ token_hash: sha256(body.token), purpose: 'RESET_EMAIL' }).first()
  } else if (body.phone && body.smsCode) {
    const user = await db('users').where({ phone: parse(phone, body.phone) }).first()
    if (user) row = await db('security_tokens').where({ user_id: user.id, purpose: 'RESET_SMS', token_hash: sha256(`${user.id}:${body.smsCode}`) }).first()
  }
  if (!row || row.used_at || new Date(row.expires_at) < now()) throw bad('This reset link or code has expired. Ask for a new one.')
  const user = await db('users').where({ id: row.user_id }).first()
  // Two-step login (or a backup code) is still needed after a reset
  if (user.totp_enabled && !(await checkSecondFactor(user, body))) throw bad('Enter the code from your authenticator app or a backup code.', { fields: { code: 'Needed' } })

  await db.transaction(async (trx) => {
    await setNewPassword(user.id, body.password, trx)
    await trx('security_tokens').where({ id: row.id }).update({ used_at: now() })
    const full = await loadUser(user.id)
    const updates = { status: user.status === 'LOCKED' ? 'ACTIVE' : user.status }
    if (full.roles.some((x) => PARTNER_ROLES.includes(x))) updates.payouts_hold_until = addHours(now(), await setting('money.password_reset_hold_hours'))
    await trx('users').where({ id: user.id }).update(updates)
    await revokeAll(user.id, null, trx)
    if (full.isAdmin) await audit({ actorId: user.id, action: 'ADMIN_PASSWORD_RESET', ip: req.ip }, trx)
  })
  await sendNotMeLink(user, 'Your password was reset')
  res.json({ ok: true })
})

// "This wasn't me" link from a security email: lock the account and end every session
r.post('/not-me/:token', limiter(10), async (req, res) => {
  const row = await db('security_tokens').where({ token_hash: sha256(req.params.token), purpose: 'NOT_ME' }).first()
  if (!row || row.used_at || new Date(row.expires_at) < now()) throw bad('This link has expired.')
  await db('security_tokens').where({ id: row.id }).update({ used_at: now() })
  await db('users').where({ id: row.user_id }).update({ status: 'LOCKED', status_reason: 'Locked by the owner from a security email' })
  await revokeAll(row.user_id)
  await audit({ actorId: row.user_id, action: 'ACCOUNT_LOCKED_NOT_ME', targetType: 'USER', targetId: row.user_id, ip: req.ip })
  await notify(await adminIds(), { type: 'ACCOUNT_LOCKED', title: 'A user locked their account from a security email', link: `/admin/users/${row.user_id}` })
  res.json({ locked: true, message: 'Your account is locked. Reset your password to unlock it.' })
})

// What the logged-in person may see about themselves
export function publicSelf(u) {
  return {
    id: u.id,
    email: u.email,
    phone: u.phone,
    fullName: u.full_name,
    firstName: u.full_name.split(' ')[0],
    gender: u.gender,
    genderVerified: Boolean(u.gender_verified),
    dateOfBirth: u.date_of_birth,
    nationality: u.nationality,
    status: u.status,
    verified: Boolean(u.id_verified_at),
    twoStep: Boolean(u.totp_enabled),
    roles: u.roles,
    permissions: u.permissions,
    isAdmin: u.isAdmin,
    isOwner: u.isOwner,
  }
}

export default r
