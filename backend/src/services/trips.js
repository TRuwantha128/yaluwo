import { db } from '../db/knex.js'
import { bad, conflict, notFound } from '../lib/errors.js'
import { addDays, colomboDate, colomboMidnight, daysBetween, monthCode, now } from '../lib/time.js'
import { setting, settings } from './settings.js'
import { notify } from './notify.js'
import { systemMessage, tripThread } from './chat.js'
import { afterCommit, emitToUser } from './realtime.js'
import { memberShares, round2 } from './pricing.js'

// Allowed moves between trip statuses (workflow section 2). Cancelled is possible
// from every status before Ongoing.
export const NEXT = {
  DRAFT: ['UNDER_REVIEW', 'OPEN', 'CANCELLED'],
  UNDER_REVIEW: ['OPEN', 'DRAFT', 'CANCELLED'],
  OPEN: ['FULL', 'BOOKING', 'CANCELLED'],
  FULL: ['OPEN', 'BOOKING', 'CANCELLED'],
  BOOKING: ['PAYMENT_DUE', 'CANCELLED'],
  PAYMENT_DUE: ['CONFIRMED', 'BOOKING', 'CANCELLED'],
  CONFIRMED: ['ONGOING', 'PAYMENT_DUE', 'BOOKING', 'CANCELLED'],
  ONGOING: ['COMPLETED'],
  COMPLETED: ['CLOSED'],
  CLOSED: [],
  CANCELLED: [],
}
export const ACTIVE_STATUSES = ['UNDER_REVIEW', 'OPEN', 'FULL', 'BOOKING', 'PAYMENT_DUE', 'CONFIRMED', 'ONGOING']

export async function newTripCode(trx = db) {
  const prefix = `YLW-${monthCode()}-`
  const last = await trx('trips').where('code', 'like', `${prefix}%`).orderBy('code', 'desc').forUpdate().first()
  const n = last ? Number(last.code.slice(prefix.length)) + 1 : 1
  return `${prefix}${String(n).padStart(4, '0')}`
}

export async function newCode(table, prefix, trx = db) {
  const p = `${prefix}-${monthCode()}-`
  const last = await trx(table).where('code', 'like', `${p}%`).orderBy('code', 'desc').forUpdate().first()
  const n = last ? Number(last.code.slice(p.length)) + 1 : 1
  return `${p}${String(n).padStart(4, '0')}`
}

export async function tripByCode(code, trx = db, { lock = false } = {}) {
  const q = trx('trips').where({ code: String(code).toUpperCase() })
  if (lock) q.forUpdate()
  const trip = await q.first()
  if (!trip) throw notFound('This trip')
  return trip
}

export async function history(tripId, actorId, event, text, details = null, trx = db) {
  await trx('trip_history').insert({ trip_id: tripId, actor_id: actorId, event, text, details: details ? JSON.stringify(details) : null })
}

export async function setStatus(trip, to, { actorId = null, text, trx = db, extra = {} }) {
  if (!NEXT[trip.status]?.includes(to)) throw conflict(`A trip that is ${trip.status.toLowerCase().replace('_', ' ')} can't become ${to.toLowerCase().replace('_', ' ')}.`)
  await trx('trips').where({ id: trip.id }).update({ status: to, updated_at: now(), ...extra })
  await history(trip.id, actorId, `STATUS_${to}`, text ?? `Trip is now ${to.toLowerCase().replace('_', ' ')}`, null, trx)
  const thread = await tripThread(trip.id, trx)
  if (thread && text) await systemMessage(thread.id, text, trx)
  const members = await activeMemberIds(trip.id, trx)
  afterCommit(trx, () => { for (const id of members) emitToUser(id, 'trip', { code: trip.code, status: to }) })
  trip.status = to
  Object.assign(trip, extra)
  return trip
}

// Members who are in the trip (organiser included)
export async function activeMembers(tripId, trx = db) {
  return trx('trip_members as m').join('users as u', 'u.id', 'm.user_id').where('m.trip_id', tripId).where('m.status', 'APPROVED')
    .select('m.*', 'u.full_name', 'u.email', 'u.phone', 'u.gender', 'u.id_verified_at').orderBy([{ column: 'm.role', order: 'desc' }, { column: 'm.id' }])
}
export const activeMemberIds = async (tripId, trx = db) => (await activeMembers(tripId, trx)).map((m) => m.user_id)

export const tripDays = (stops) => stops.reduce((s, x) => s + Number(x.nights || 0), 0) + 1
export const tripNights = (stops) => stops.reduce((s, x) => s + Number(x.nights || 0), 0)

// Money a member has actually given Yaluwo for this trip (paid minus refunds)
export async function memberCredit(memberId, trx = db) {
  const paid = await trx('payments').where({ member_id: memberId, purpose: 'SHARE' }).whereIn('status', ['PAID', 'PART_REFUNDED', 'REFUNDED']).sum({ s: 'amount' }).first()
  const refunded = await trx('refunds as r').join('payments as p', 'p.id', 'r.payment_id').where('p.member_id', memberId).where('p.purpose', 'SHARE').whereIn('r.status', ['PENDING', 'PROCESSED']).sum({ s: 'r.amount' }).first()
  return round2(Number(paid.s ?? 0) - Number(refunded.s ?? 0))
}

export async function memberBalance(member, trx = db) {
  const due = round2(Number(member.share_amount ?? 0) + Number(member.fee_amount ?? 0))
  const credit = await memberCredit(member.id, trx)
  return { due, credit, balance: round2(Math.max(0, due - credit)) }
}

// Work out (or recalculate) each member's share from the accepted bookings (section 12)
export async function recalculateShares(trip, trx = db) {
  const bookings = await trx('bookings').where({ trip_id: trip.id }).whereIn('status', ['ACCEPTED', 'COMPLETED'])
  const total = round2(bookings.reduce((s, b) => s + Number(b.amount) - Number(b.discount), 0))
  const members = await activeMembers(trip.id, trx)
  if (!members.length) return []
  const feePct = await setting('fees.booking_fee_pct')
  const shares = memberShares(total, members.map((m) => m.id), feePct)
  for (const s of shares) await trx('trip_members').where({ id: s.memberId }).update({ share_amount: s.share, fee_amount: s.fee })
  return shares
}

// The payment deadline: 48 hours, but never later than 3 days before the start
export async function paymentDeadline(trip) {
  const { hours, daysBefore } = await settings({ hours: 'money.payment_window_hours', daysBefore: 'trips.complete_days_before' })
  const window = new Date(now().getTime() + hours * 3600 * 1000)
  const latest = colomboMidnight(addDays(trip.start_date, -daysBefore))
  return window < latest ? window : latest
}

export async function checkStartDate(startDate) {
  const minDays = await setting('trips.min_days_ahead')
  const earliest = addDays(colomboDate(), minDays)
  if (!startDate || startDate < earliest) throw bad(`The start date must be at least ${minDays} days from today (${earliest} or later).`, { fields: { startDate: `${earliest} or later` } })
}

export const daysUntilStart = (trip) => daysBetween(colomboDate(), trip.start_date)

export async function notifyMembers(tripId, message, { except = null, email = false, trx = db } = {}) {
  const ids = (await activeMemberIds(tripId, trx)).filter((id) => id !== except)
  await notify(ids, { ...message, email }, trx)
}
