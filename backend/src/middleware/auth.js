import jwt from 'jsonwebtoken'
import { env } from '../config/env.js'
import { db } from '../db/knex.js'
import { forbidden, needStepUp, unauthorized } from '../lib/errors.js'

export const ACCESS_MINUTES = 15

export function signAccess(user) {
  return jwt.sign({ sub: String(user.id), typ: 'access' }, env.jwtSecret, { expiresIn: `${ACCESS_MINUTES}m` })
}
export const signShort = (payload, minutes) => jwt.sign(payload, env.jwtSecret, { expiresIn: `${minutes}m` })
export function verifyShort(token, typ) {
  try {
    const p = jwt.verify(token, env.jwtSecret)
    return p.typ === typ ? p : null
  } catch {
    return null
  }
}

// Loads the person behind the access token on every call, so a suspension
// or lock takes effect at once.
export async function loadUser(id) {
  const user = await db('users').where({ id }).first()
  if (!user) return null
  const roles = (await db('user_roles').where({ user_id: id }).select('role')).map((r) => r.role)
  const permissions = (await db('admin_permissions').where({ user_id: id }).select('permission')).map((r) => r.permission)
  return { ...user, roles, permissions, isAdmin: roles.includes('ADMIN') || roles.includes('STAFF'), isOwner: permissions.includes('OWNER') }
}

function tokenFrom(req) {
  const h = req.headers.authorization ?? ''
  return h.startsWith('Bearer ') ? h.slice(7) : null
}

export async function optionalAuth(req, _res, next) {
  const token = tokenFrom(req)
  if (token) {
    const p = verifyShort(token, 'access')
    if (p) req.user = await loadUser(p.sub)
  }
  next()
}

export async function requireAuth(req, _res, next) {
  const p = verifyShort(tokenFrom(req), 'access')
  if (!p) throw unauthorized()
  const user = await loadUser(p.sub)
  if (!user) throw unauthorized()
  if (user.status === 'BANNED' || user.status === 'LOCKED') throw unauthorized('This account is locked. Check your email or contact support.')
  req.user = user
  next()
}

// Suspended accounts can still log in and read, but not act
export function requireActive(req, _res, next) {
  if (req.user.status !== 'ACTIVE') throw forbidden('Your account is suspended while the admin reviews it.')
  next()
}

export const requireRole = (...roles) => (req, _res, next) => {
  if (!roles.some((r) => req.user.roles.includes(r))) throw forbidden()
  next()
}

// Admin console. The owner passes every check; staff only their roles' checks.
export const requirePermission = (...perms) => (req, _res, next) => {
  if (!req.user.isAdmin) throw forbidden()
  if (req.user.isOwner) return next()
  if (perms.includes('OWNER') || !perms.some((p) => req.user.permissions.includes(p))) throw forbidden()
  next()
}

export const requireVerified = (req, _res, next) => {
  if (!req.user.id_verified_at) throw forbidden('Verify your ID first (Profile → Verification).')
  next()
}

// Sensitive admin actions need a fresh confirmation (password + code) from the last 5 minutes
export function hasStepUp(req) {
  const p = verifyShort(req.headers['x-step-up'], 'stepup')
  return Boolean(p && String(p.sub) === String(req.user.id))
}
export function requireStepUp(req, _res, next) {
  if (!hasStepUp(req)) throw needStepUp()
  next()
}
