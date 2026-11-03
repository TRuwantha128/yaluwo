import { Router } from 'express'
import { z } from 'zod'
import { db } from '../../db/knex.js'
import { parse } from '../../middleware/http.js'
import { requirePermission } from '../../middleware/auth.js'
import { bad, conflict, notFound } from '../../lib/errors.js'
import { decrypt, mask, randomToken, sha256 } from '../../lib/crypto.js'
import { addDays, addMinutes, colomboDate, now, setClock } from '../../lib/time.js'
import { runJobs } from '../../jobs/scheduler.js'
import { env } from '../../config/env.js'
import { setting } from '../../services/settings.js'
import { signedUrl } from '../../services/files.js'
import { audit, auditFrom } from '../../services/audit.js'
import { notify } from '../../services/notify.js'
import { sendEmail } from '../../services/messages.js'
import { revokeAll } from '../../services/sessions.js'
import { createRefund, cancelTrip } from '../../services/money.js'
import { setStatus, tripByCode } from '../../services/trips.js'

const r = Router()

// ---------- Today inbox (section 19): everything to do, sorted by deadline ----------
r.get('/today', requirePermission('VERIFICATION', 'FINANCE', 'SUPPORT', 'MARKETING'), async (req, res) => {
  const items = []
  const add = (order, kind, title, link, dueAt, extra = {}) => items.push({ order, kind, title, link, dueAt, overdue: dueAt ? new Date(dueAt) < now() : false, ...extra })
  const can = (p) => req.user.isOwner || req.user.permissions.includes(p)

  if (can('SUPPORT')) {
    for (const s of await db('safety_events as s').join('users as u', 'u.id', 's.user_id').leftJoin('trips as t', 't.id', 's.trip_id').where({ 's.type': 'SOS' }).whereNull('s.handled_at').select('s.*', 'u.full_name', 'u.phone', 't.code')) {
      add(1, 'SOS', `SOS: ${s.full_name} (${s.phone}) on ${s.code ?? 'no trip'}`, `/admin/sos/${s.id}`, addMinutes(s.created_at, 15), { id: s.id, lat: s.lat, lng: s.lng })
    }
  }
  if (can('FINANCE')) {
    for (const d of await db('disputes').whereNot('status', 'DECIDED')) add(2, 'DISPUTE', `Dispute ${d.code}${d.status === 'RESPONDED' ? ' · partner replied' : ''}`, `/admin/disputes/${d.id}`, d.admin_due_at, { id: d.id })
    for (const c of await db('chargebacks').where({ status: 'OPEN' })) add(2, 'CHARGEBACK', `Chargeback #${c.id}`, '/admin/payments?tab=chargebacks', addDays(c.received_on, 3))
  }
  if (can('VERIFICATION')) {
    for (const v of await db('verifications as v').join('users as u', 'u.id', 'v.user_id').where('v.status', 'PENDING').select('v.*', 'u.full_name').orderBy('v.due_at')) {
      add(3, 'VERIFICATION', `${{ NIC: 'NIC', PASSPORT: 'Passport', LICENCE: 'Driving licence', POLICE: 'Police clearance', VEHICLE: 'Vehicle', BANK: 'Bank account' }[v.type] ?? v.type}: ${v.full_name}`, `/admin/verifications/${v.id}`, v.due_at, { id: v.id })
    }
    for (const t of await db('trips').where({ status: 'UNDER_REVIEW' })) add(3, 'TRIP_REVIEW', `Trip to review: ${t.title}`, `/admin/trips/${t.code}`, addMinutes(t.submitted_at, 24 * 60), { code: t.code })
  }
  if (can('FINANCE')) {
    for (const p of await db('payment_proofs').where({ status: 'UNDER_REVIEW' })) add(4, 'SLIP', `Bank slip ${p.reference}${p.statement_line_id ? ' · money found' : ' · waiting for money'}`, '/admin/payments?tab=slips', addDays(colomboDate(new Date(p.created_at)), 1), { id: p.id, matched: Boolean(p.statement_line_id) })
    const ready = await db('payouts').where({ status: 'READY' }).count({ n: '*' }).sum({ total: 'amount' }).first()
    if (Number(ready.n)) add(4, 'PAYOUTS', `${ready.n} payouts ready to release (Rs ${Number(ready.total).toLocaleString()})`, '/admin/payments?tab=ready', now())
    const refunds = await db('refunds').where({ status: 'PENDING' }).count({ n: '*' }).first()
    if (Number(refunds.n)) add(4, 'REFUNDS', `${refunds.n} refunds to send`, '/admin/payments?tab=refunds', now())
  }
  if (can('SUPPORT')) {
    for (const x of await db('reports').where({ status: 'OPEN' })) add(6, 'REPORT', `Report: ${x.target_type.toLowerCase()} · ${x.reason}`, `/admin/reports`, addMinutes(x.created_at, 48 * 60), { id: x.id })
    for (const u of await db('users').where({ status: 'SUSPENDED' }).whereNotNull('status_reason')) add(6, 'SUSPENDED', `Suspended for review: ${u.full_name}`, `/admin/users/${u.id}`, addMinutes(u.updated_at, 48 * 60))
  }
  if (req.user.isOwner) {
    for (const s of await db('settings').where('effective_from', '>', now())) add(7, 'SETTING', `Setting change goes live: ${s.label}`, '/admin/settings', s.effective_from)
    for (const c of await db('rate_cards').whereIn('status', ['SCHEDULED', 'APPROVED'])) add(7, 'RATE_CARD', `Rate card v${c.version} ${c.status === 'SCHEDULED' ? 'goes live' : 'approved, not scheduled'}`, '/admin/settings?tab=rates', c.effective_from)
  }
  const soon = addDays(colomboDate(), 30)
  for (const v of await db('verifications').where({ status: 'APPROVED' }).whereNotNull('expires_on').where('expires_on', '<=', soon)) add(7, 'EXPIRING', `${v.type} expires ${v.expires_on}`, `/admin/verifications/${v.id}`, null)

  items.sort((a, b) => a.order - b.order || new Date(a.dueAt ?? 8.64e15) - new Date(b.dueAt ?? 8.64e15))
  const counts = {}
  for (const i of items) counts[i.kind] = (counts[i.kind] ?? 0) + 1
  res.json({ items, counts, total: items.length })
})

r.post('/sos/:id/handled', requirePermission('SUPPORT'), async (req, res) => {
  await db('safety_events').where({ id: req.params.id }).update({ handled_by: req.user.id, handled_at: now() })
  await audit({ ...auditFrom(req), action: 'SOS_HANDLED', targetType: 'SAFETY', targetId: req.params.id })
  res.json({ ok: true })
})

// ---------- Verifications ----------
r.get('/verifications', requirePermission('VERIFICATION'), async (req, res) => {
  const status = req.query.status ?? 'PENDING'
  const rows = await db('verifications as v').join('users as u', 'u.id', 'v.user_id').where('v.status', status).select('v.id', 'v.type', 'v.status', 'v.due_at', 'v.created_at', 'v.vehicle_id', 'u.full_name', 'u.id as user_id').orderBy('v.due_at')
  res.json({ verifications: rows })
})

// Opening someone's ID documents is recorded in the audit log (section 22)
r.get('/verifications/:id', requirePermission('VERIFICATION'), async (req, res) => {
  const v = await db('verifications').where({ id: req.params.id }).first()
  if (!v) throw notFound('This verification')
  const u = await db('users').where({ id: v.user_id }).first()
  const files = v.file_keys ? (typeof v.file_keys === 'string' ? JSON.parse(v.file_keys) : v.file_keys) : {}
  const details = v.details ? (typeof v.details === 'string' ? JSON.parse(v.details) : v.details) : {}
  await audit({ ...auditFrom(req), action: 'VIEW_ID_DOCUMENTS', targetType: 'VERIFICATION', targetId: v.id })
  let vehicle = null
  if (v.vehicle_id) {
    const veh = await db('vehicles as x').join('vehicle_types as t', 't.id', 'x.type_id').where('x.id', v.vehicle_id).select('x.*', 't.name_en as type', 't.max_passengers').first()
    const photos = await db('vehicle_photos').where({ vehicle_id: v.vehicle_id })
    vehicle = { ...veh, photos: photos.map((p) => ({ id: p.id, angle: p.angle, url: signedUrl(p.file_key) })) }
  }
  const history = await db('verifications').where({ user_id: v.user_id, type: v.type }).whereNot({ id: v.id }).orderBy('id', 'desc').select('id', 'status', 'reason', 'created_at')
  res.json({
    verification: {
      id: v.id, type: v.type, status: v.status, number: v.number_enc ? decrypt(v.number_enc) : null, expiresOn: v.expires_on, dueAt: v.due_at, reason: v.reason,
      files: Object.fromEntries(Object.entries(files).map(([k, key]) => [k, signedUrl(key)])), details, faceScore: v.face_score,
    },
    user: { id: u.id, fullName: u.full_name, gender: u.gender, dateOfBirth: u.date_of_birth, nationality: u.nationality, email: u.email, phone: u.phone, verified: Boolean(u.id_verified_at), createdAt: u.created_at },
    vehicle,
    history,
  })
})

r.post('/verifications/:id/decide', requirePermission('VERIFICATION'), async (req, res) => {
  const body = parse(z.object({ decision: z.enum(['APPROVE', 'REJECT', 'RESUBMIT']), reason: z.string().max(500).optional() }), req.body)
  if (body.decision !== 'APPROVE' && !body.reason) throw bad('Give the person a reason.')
  await db.transaction(async (trx) => {
    const v = await trx('verifications').where({ id: req.params.id }).forUpdate().first()
    if (!v || v.status !== 'PENDING') throw conflict('This has already been decided.')
    const status = { APPROVE: 'APPROVED', REJECT: 'REJECTED', RESUBMIT: 'RESUBMIT' }[body.decision]
    await trx('verifications').where({ id: v.id }).update({ status, reviewed_by: req.user.id, reviewed_at: now(), reason: body.reason ?? null })
    const details = v.details ? (typeof v.details === 'string' ? JSON.parse(v.details) : v.details) : {}
    const label = { NIC: 'ID', PASSPORT: 'passport', LICENCE: 'driving licence', POLICE: 'police clearance', VEHICLE: 'vehicle', BANK: 'bank account' }[v.type]
    if (body.decision === 'APPROVE') {
      if (v.type === 'NIC' || v.type === 'PASSPORT') {
        // Gender and birth date from the verified NIC are used for women-only trips and the age rule
        const update = { id_verified_at: now() }
        if (details.nic) Object.assign(update, { gender: details.nic.gender, gender_verified: true, date_of_birth: details.nic.birthDate })
        else update.gender_verified = true
        await trx('users').where({ id: v.user_id }).update(update)
      }
      if (v.type === 'VEHICLE') await trx('vehicles').where({ id: v.vehicle_id }).update({ status: 'APPROVED', reject_reason: null, photos_verified_at: now() })
      if (v.type === 'VEHICLE') await trx('vehicle_photos').where({ vehicle_id: v.vehicle_id }).update({ verified: true })
      if (v.type === 'BANK') await trx('bank_accounts').where({ id: details.bankAccountId }).update({ status: 'VERIFIED', verified_by: req.user.id })
    } else {
      if (v.type === 'VEHICLE') await trx('vehicles').where({ id: v.vehicle_id }).update({ status: 'REJECTED', reject_reason: body.reason })
      if (v.type === 'BANK') await trx('bank_accounts').where({ id: details.bankAccountId }).update({ status: 'REJECTED', reason: body.reason })
    }
    await notify(v.user_id, {
      type: `VERIFICATION_${status}`,
      title: body.decision === 'APPROVE' ? `Your ${label} is verified` : body.decision === 'RESUBMIT' ? `Please send a clearer photo of your ${label}` : `Your ${label} was not accepted`,
      body: body.reason ?? '',
      link: v.type === 'VEHICLE' || v.type === 'BANK' ? '/partner' : '/verify',
      email: true,
    }, trx)
    await audit({ ...auditFrom(req), action: `VERIFICATION_${status}`, targetType: 'VERIFICATION', targetId: v.id, details: { type: v.type, reason: body.reason } }, trx)
  })
  res.json({ ok: true })
})

// ---------- Trips under review (section 7) ----------
r.get('/trips', requirePermission('VERIFICATION', 'SUPPORT'), async (req, res) => {
  const q = db('trips as t').join('users as u', 'u.id', 't.organiser_id').select('t.*', 'u.full_name', 'u.id_verified_at').orderBy('t.id', 'desc').limit(200)
  if (req.query.status) q.where('t.status', req.query.status)
  if (req.query.q) q.where((w) => w.where('t.code', 'ilike', `%${req.query.q}%`).orWhere('t.title', 'ilike', `%${req.query.q}%`))
  const rows = await q
  res.json({ trips: rows.map((t) => ({ code: t.code, title: t.title, status: t.status, startDate: t.start_date, seats: t.seats, organiser: t.full_name, organiserVerified: Boolean(t.id_verified_at), reports: t.report_count, hidden: Boolean(t.hidden), submittedAt: t.submitted_at })) })
})

r.post('/trips/:code/decide', requirePermission('VERIFICATION'), async (req, res) => {
  const body = parse(z.object({ decision: z.enum(['APPROVE', 'REJECT']), reason: z.string().max(500).optional() }), req.body)
  if (body.decision === 'REJECT' && !body.reason) throw bad('Give the organiser a reason.')
  await db.transaction(async (trx) => {
    const trip = await tripByCode(req.params.code, trx, { lock: true })
    if (trip.status !== 'UNDER_REVIEW') throw conflict('This trip is not waiting for review.')
    if (body.decision === 'APPROVE') {
      const nic = await trx('verifications').where({ user_id: trip.organiser_id }).whereIn('type', ['NIC', 'PASSPORT']).orderBy('id', 'desc').first()
      if (nic?.status !== 'APPROVED') throw conflict("Approve the organiser's ID first (it is in Verifications).")
      await setStatus(trip, 'OPEN', { actorId: req.user.id, trx, text: 'The trip was approved and is live on the Trip Board.', extra: { published_at: now(), rejected_reason: null } })
      await notify(trip.organiser_id, { type: 'TRIP_APPROVED', title: `${trip.title} is live`, link: `/trips/${trip.code}`, email: true }, trx)
    } else {
      await setStatus(trip, 'DRAFT', { actorId: req.user.id, trx, text: `The trip needs changes: ${body.reason}`, extra: { rejected_reason: body.reason } })
      // A rejected trip gets its listing deposit back in full
      const dep = await trx('payments').where({ trip_id: trip.id, purpose: 'DEPOSIT', status: 'PAID' }).first()
      if (dep) {
        await createRefund({ payment: dep, amount: Number(dep.amount), reason: 'Trip not approved: deposit returned', approvedBy: req.user.id }, trx)
        await trx('trips').where({ id: trip.id }).update({ deposit_payment_id: null })
      }
      await notify(trip.organiser_id, { type: 'TRIP_REJECTED', title: `${trip.title} needs changes`, body: body.reason, link: `/trips/${trip.code}/edit`, email: true }, trx)
    }
    await audit({ ...auditFrom(req), action: `TRIP_${body.decision}`, targetType: 'TRIP', targetId: trip.code, details: { reason: body.reason } }, trx)
  })
  res.json({ ok: true })
})

r.post('/trips/:code/cancel', requirePermission('SUPPORT'), async (req, res) => {
  const { reason } = parse(z.object({ reason: z.string().min(5).max(500) }), req.body)
  const out = await db.transaction(async (trx) => {
    const trip = await tripByCode(req.params.code, trx, { lock: true })
    const result = await cancelTrip(trip, { by: 'ADMIN', reason, actorId: req.user.id }, trx)
    await audit({ ...auditFrom(req), action: 'TRIP_CANCELLED_BY_ADMIN', targetType: 'TRIP', targetId: trip.code, amount: result.refunded, details: { reason } }, trx)
    return result
  })
  res.json(out)
})

r.post('/trips/:code/visibility', requirePermission('SUPPORT'), async (req, res) => {
  const { hidden } = parse(z.object({ hidden: z.boolean() }), req.body)
  const trip = await tripByCode(req.params.code)
  await db('trips').where({ id: trip.id }).update({ hidden, ...(hidden ? {} : { report_count: 0 }) })
  await audit({ ...auditFrom(req), action: hidden ? 'TRIP_HIDDEN' : 'TRIP_SHOWN', targetType: 'TRIP', targetId: trip.code })
  res.json({ hidden })
})

// ---------- Users (the admin never sees or sets a password) ----------
r.get('/users', requirePermission('SUPPORT', 'VERIFICATION'), async (req, res) => {
  const q = db('users as u').select('u.id', 'u.full_name', 'u.email', 'u.phone', 'u.status', 'u.id_verified_at', 'u.created_at').orderBy('u.id', 'desc').limit(200)
  if (req.query.q) q.where((w) => w.where('u.full_name', 'ilike', `%${req.query.q}%`).orWhere('u.email', 'ilike', `%${req.query.q}%`).orWhere('u.phone', 'ilike', `%${req.query.q}%`))
  if (req.query.status) q.where('u.status', req.query.status)
  const rows = await q
  const roles = await db('user_roles').whereIn('user_id', rows.map((x) => x.id))
  res.json({ users: rows.map((u) => ({ id: u.id, name: u.full_name, email: u.email, phone: u.phone, status: u.status, verified: Boolean(u.id_verified_at), roles: roles.filter((r) => r.user_id === u.id).map((r) => r.role), createdAt: u.created_at })) })
})

r.get('/users/:id', requirePermission('SUPPORT', 'VERIFICATION'), async (req, res) => {
  const u = await db('users').where({ id: req.params.id }).first()
  if (!u) throw notFound('This user')
  const roles = (await db('user_roles').where({ user_id: u.id })).map((x) => x.role)
  const trips = await db('trip_members as m').join('trips as t', 't.id', 'm.trip_id').where('m.user_id', u.id).select('t.code', 't.title', 't.status', 'm.role', 'm.status as member_status', 'm.removed_reason')
  const verifications = await db('verifications').where({ user_id: u.id }).orderBy('id', 'desc').select('id', 'type', 'status', 'created_at')
  const strikes = await db('strikes').where({ partner_id: u.id }).orderBy('id', 'desc')
  const reports = await db('reports').where({ target_type: 'USER', target_id: u.id })
  const sessions = await db('refresh_tokens').where({ user_id: u.id }).whereNull('revoked_at').where('expires_at', '>', now()).count({ n: '*' }).first()
  const bank = await db('bank_accounts').where({ partner_id: u.id }).whereNot('status', 'REPLACED').first()
  res.json({
    user: { id: u.id, name: u.full_name, email: u.email, phone: u.phone, gender: u.gender, dateOfBirth: u.date_of_birth, status: u.status, statusReason: u.status_reason, verified: Boolean(u.id_verified_at), twoStep: Boolean(u.totp_enabled), roles, createdAt: u.created_at, lastLoginAt: u.last_login_at, activeSessions: Number(sessions.n) },
    trips, verifications, strikes, reports,
    // Support never sees full bank details (section 4)
    bank: bank ? { bank: bank.bank, account: mask(bank.account_last4), status: bank.status } : null,
  })
})

r.post('/users/:id/action', requirePermission('SUPPORT'), async (req, res) => {
  const { action, reason } = parse(z.object({ action: z.enum(['SUSPEND', 'RESTORE', 'BAN', 'LOCK', 'LOGOUT_ALL', 'SEND_RESET']), reason: z.string().max(500).optional() }), req.body)
  const u = await db('users').where({ id: req.params.id }).first()
  if (!u) throw notFound('This user')
  const roles = (await db('user_roles').where({ user_id: u.id })).map((x) => x.role)
  if (roles.includes('ADMIN')) throw conflict('The owner account is managed with the server command.')
  if (['SUSPEND', 'BAN', 'LOCK'].includes(action) && !reason) throw bad('Give a reason.')
  if (action === 'SUSPEND') await db('users').where({ id: u.id }).update({ status: 'SUSPENDED', status_reason: reason })
  if (action === 'RESTORE') await db('users').where({ id: u.id }).update({ status: 'ACTIVE', status_reason: null, locked_until: null, failed_logins: 0 })
  if (action === 'BAN') {
    await db('users').where({ id: u.id }).update({ status: 'BANNED', status_reason: reason })
    await revokeAll(u.id)
  }
  if (action === 'LOCK') {
    await db('users').where({ id: u.id }).update({ status: 'LOCKED', status_reason: reason })
    await revokeAll(u.id)
  }
  if (action === 'LOGOUT_ALL') await revokeAll(u.id)
  if (action === 'SEND_RESET') {
    const token = randomToken(32)
    const minutes = await setting('accounts.reset_link_minutes')
    await db('security_tokens').insert({ user_id: u.id, purpose: 'RESET_EMAIL', token_hash: sha256(token), ip: req.ip, expires_at: addMinutes(now(), minutes) })
    await sendEmail(u.email, 'Reset your Yaluwo password', `Yaluwo support sent you a password reset link. It works once and lasts ${minutes} minutes:\n${env.appUrl}/reset-password/${token}`)
  }
  if (['SUSPEND', 'BAN', 'RESTORE'].includes(action)) await notify(u.id, { type: `ACCOUNT_${action}`, title: action === 'RESTORE' ? 'Your account is active again' : `Your account was ${action === 'BAN' ? 'closed' : 'suspended'}`, body: reason ?? '', email: true })
  await audit({ ...auditFrom(req), action: `USER_${action}`, targetType: 'USER', targetId: u.id, details: { reason } })
  res.json({ ok: true })
})

// ---------- Reports ----------
r.get('/reports', requirePermission('SUPPORT'), async (req, res) => {
  const rows = await db('reports as r').join('users as u', 'u.id', 'r.reporter_id').where('r.status', req.query.status ?? 'OPEN').select('r.*', 'u.full_name as reporter').orderBy('r.id', 'desc')
  const out = []
  for (const x of rows) {
    let target = null
    if (x.target_type === 'MESSAGE') {
      // The admin reads a chat message only when it has been reported
      const m = await db('messages as m').leftJoin('users as u', 'u.id', 'm.sender_id').where('m.id', x.target_id).select('m.*', 'u.full_name').first()
      const around = m ? await db('messages as m').leftJoin('users as u', 'u.id', 'm.sender_id').where('m.thread_id', m.thread_id).whereBetween('m.id', [m.id - 5, m.id + 5]).select('m.id', 'm.content', 'm.created_at', 'u.full_name') : []
      target = { message: m?.content, sender: m?.full_name, senderId: m?.sender_id, context: around }
    }
    if (x.target_type === 'TRIP') {
      const t = await db('trips').where({ id: x.target_id }).first()
      target = { code: t?.code, title: t?.title, hidden: Boolean(t?.hidden) }
    }
    if (x.target_type === 'USER') {
      const u = await db('users').where({ id: x.target_id }).first()
      target = { name: u?.full_name, id: u?.id, status: u?.status }
    }
    out.push({ id: x.id, type: x.target_type, targetId: x.target_id, reason: x.reason, details: x.details, reporter: x.reporter, createdAt: x.created_at, target })
  }
  if (rows.some((x) => x.target_type === 'MESSAGE')) await audit({ ...auditFrom(req), action: 'VIEW_REPORTED_MESSAGES', targetType: 'REPORTS' })
  res.json({ reports: out })
})

r.post('/reports/:id/decide', requirePermission('SUPPORT'), async (req, res) => {
  const { decision, note } = parse(z.object({ decision: z.enum(['UPHOLD', 'DISMISS']), note: z.string().max(500).optional() }), req.body)
  const rep = await db('reports').where({ id: req.params.id }).first()
  if (!rep) throw notFound('This report')
  await db('reports').where({ id: rep.id }).update({ status: decision === 'UPHOLD' ? 'UPHELD' : 'DISMISSED', handled_by: req.user.id, handled_at: now() })
  if (rep.target_type === 'REVIEW' && decision === 'UPHOLD') await db('reviews').where({ id: rep.target_id }).update({ hidden: true })
  if (rep.target_type === 'TRIP' && decision === 'DISMISS') {
    const open = await db('reports').where({ target_type: 'TRIP', target_id: rep.target_id, status: 'OPEN' }).first()
    if (!open) await db('trips').where({ id: rep.target_id }).update({ hidden: false })
  }
  await audit({ ...auditFrom(req), action: `REPORT_${decision}`, targetType: 'REPORT', targetId: rep.id, details: { note } })
  res.json({ ok: true })
})

// ---------- Audit log (owner) ----------
r.get('/audit-log', requirePermission('OWNER'), async (req, res) => {
  const rows = await db('audit_log as a').leftJoin('users as u', 'u.id', 'a.actor_id').select('a.*', 'u.full_name').orderBy('a.id', 'desc').limit(300)
  res.json({ entries: rows.map((x) => ({ id: x.id, at: x.created_at, actor: x.full_name ?? 'System', action: x.action, target: x.target_type ? `${x.target_type} ${x.target_id ?? ''}` : '', amount: x.amount, ip: x.ip, details: typeof x.details === 'string' ? JSON.parse(x.details) : x.details })) })
})

// ---------- Development only: the emails and SMS that would have been sent ----------
r.get('/dev-outbox', requirePermission('OWNER'), async (req, res) => {
  if (env.isProd) throw notFound('This page')
  res.json({ messages: await db('dev_outbox').orderBy('id', 'desc').limit(100) })
})

// Local demo only: move the server's clock forward to show a trip's whole life
// (trip day, completion, payouts) without waiting. Never available in production.
let offsetDays = 0
r.get('/dev/clock', requirePermission('OWNER'), async (_req, res) => {
  if (env.isProd) throw notFound('This page')
  res.json({ now: now(), offsetDays })
})
r.post('/dev/clock', requirePermission('OWNER'), async (req, res) => {
  if (env.isProd) throw notFound('This page')
  const { days } = parse(z.object({ days: z.number().min(0).max(60) }), req.body)
  const before = offsetDays
  offsetDays = days === 0 ? 0 : offsetDays + days
  const ms = offsetDays * 86400000
  // Open sessions move with the clock, so nobody is logged out by the jump
  const shift = Math.round((offsetDays - before) * 86400)
  await db('refresh_tokens').whereNull('revoked_at').update({
    last_used_at: db.raw('last_used_at + make_interval(secs => ?)', [shift]),
    expires_at: db.raw('expires_at + make_interval(secs => ?)', [shift]),
  })
  setClock(() => new Date(Date.now() + ms))
  await runJobs()
  await audit({ actorId: req.user.id, action: 'DEV_CLOCK_MOVED', details: { offsetDays } })
  res.json({ now: now(), offsetDays })
})

export default r
