import { db } from '../db/knex.js'
import { env } from '../config/env.js'
import { randomToken, sha256 } from '../lib/crypto.js'
import { addMinutes, now } from '../lib/time.js'
import { signAccess, ACCESS_MINUTES } from '../middleware/auth.js'
import { setting } from './settings.js'
import { sendEmail } from './messages.js'

export const REFRESH_COOKIE = 'ylw_rt'
const REFRESH_DAYS = 30

export const cookieOptions = () => ({
  httpOnly: true,
  // SameSite=None is only accepted by browsers together with Secure
  secure: env.isProd || env.cookieSameSite === 'none',
  sameSite: env.cookieSameSite,
  path: '/api/v1/auth',
})

const deviceOf = (req) => String(req.headers['user-agent'] ?? 'unknown').slice(0, 250)

export async function issueSession(req, res, user, { notifyNewDevice = true } = {}) {
  const token = randomToken(32)
  const isAdmin = user.roles?.includes('ADMIN') || user.roles?.includes('STAFF')
  const device = deviceOf(req)

  if (notifyNewDevice) {
    const seen = await db('refresh_tokens').where({ user_id: user.id, device }).first()
    const anyBefore = await db('refresh_tokens').where({ user_id: user.id }).first()
    if (anyBefore && !seen) {
      await sendEmail(user.email, 'New login to your Yaluwo account', `Someone logged in to your account from a new device or browser:\n${device}\nIP: ${req.ip}\n\nIf this wasn't you, change your password now and use "Log out of all devices" in Settings → Security.`)
    }
  }

  await db('refresh_tokens').insert({
    user_id: user.id,
    token_hash: sha256(token),
    device,
    ip: req.ip,
    last_used_at: now(),
    expires_at: addMinutes(now(), REFRESH_DAYS * 24 * 60),
  })
  await db('users').where({ id: user.id }).update({ last_login_at: now(), last_login_ip: req.ip, failed_logins: 0, locked_until: null })
  res.cookie(REFRESH_COOKIE, token, { ...cookieOptions(), maxAge: REFRESH_DAYS * 24 * 3600 * 1000 })
  return { accessToken: signAccess(user), expiresIn: ACCESS_MINUTES * 60, isAdmin }
}

// Swap the refresh token for a new one (rotation). Admin sessions end after the idle time.
export async function refreshSession(req, res) {
  const token = req.cookies?.[REFRESH_COOKIE]
  if (!token) return null
  const row = await db('refresh_tokens').where({ token_hash: sha256(token) }).first()
  if (!row || row.revoked_at || new Date(row.expires_at) < now()) return null
  const user = await db('users').where({ id: row.user_id }).first()
  if (!user || ['BANNED', 'LOCKED'].includes(user.status)) return null
  const roles = (await db('user_roles').where({ user_id: user.id }).select('role')).map((r) => r.role)
  const isAdmin = roles.includes('ADMIN') || roles.includes('STAFF')
  if (isAdmin) {
    const idle = await setting('accounts.admin_idle_minutes')
    if (addMinutes(row.last_used_at ?? row.created_at, idle) < now()) {
      await db('refresh_tokens').where({ id: row.id }).update({ revoked_at: now() })
      return null
    }
  }
  const next = randomToken(32)
  await db('refresh_tokens').where({ id: row.id }).update({ revoked_at: now() })
  await db('refresh_tokens').insert({ user_id: user.id, token_hash: sha256(next), device: row.device, ip: req.ip, last_used_at: now(), expires_at: row.expires_at })
  res.cookie(REFRESH_COOKIE, next, { ...cookieOptions(), maxAge: new Date(row.expires_at) - now() })
  return { accessToken: signAccess(user), expiresIn: ACCESS_MINUTES * 60, isAdmin }
}

export async function endSession(req, res) {
  const token = req.cookies?.[REFRESH_COOKIE]
  if (token) await db('refresh_tokens').where({ token_hash: sha256(token) }).update({ revoked_at: now() })
  res.clearCookie(REFRESH_COOKIE, cookieOptions())
}

export async function revokeAll(userId, exceptToken = null, trx = db) {
  const q = trx('refresh_tokens').where({ user_id: userId }).whereNull('revoked_at')
  if (exceptToken) q.whereNot({ token_hash: sha256(exceptToken) })
  await q.update({ revoked_at: now() })
}
