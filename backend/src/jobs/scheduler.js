import { db } from '../db/knex.js'
import { addDays, addHours, colomboDate, colomboMidnight, daysBetween, now } from '../lib/time.js'
import { setting, settings, clearSettingsCache } from '../services/settings.js'
import { notify } from '../services/notify.js'
import { systemMessage, removeParticipant, tripThread } from '../services/chat.js'
import { activeMembers, history, memberBalance, setStatus, notifyMembers } from '../services/trips.js'
import { cancelTrip, createRefund, fmt, maybeConfirm, refundMember } from '../services/money.js'
import { promotePayouts } from '../services/payouts.js'
import { expireOldSlips } from '../services/slips.js'
import { publishAllForTrip } from '../services/reviews.js'
import { continueWithFewer } from '../routes/trips.js'

// "Every deadline has an automatic outcome" (workflow principle 6).
// Runs every minute. Each job is safe to run again: it only touches rows that are still due.
const jsonArr = (v) => (v ? (typeof v === 'string' ? JSON.parse(v) : v) : [])

async function expireJoinRequests() {
  const rows = await db('trip_members as m').join('trips as t', 't.id', 'm.trip_id').where('m.status', 'REQUESTED').where('m.expires_at', '<', now()).select('m.*', 't.title', 't.code')
  for (const m of rows) {
    await db('trip_members').where({ id: m.id, status: 'REQUESTED' }).update({ status: 'EXPIRED', decided_at: now() })
    await notify(m.user_id, { type: 'JOIN_EXPIRED', title: `Your request for ${m.title} expired`, body: 'The organiser did not answer in time. Try another trip.', link: '/trips' })
  }
  return rows.length
}

async function expireBookingRequests() {
  const rows = await db('bookings as b').join('trips as t', 't.id', 'b.trip_id').where('b.status', 'REQUESTED').where('b.expires_at', '<', now()).select('b.*', 't.organiser_id', 't.title', 't.code as trip_code')
  for (const b of rows) {
    await db('bookings').where({ id: b.id, status: 'REQUESTED' }).update({ status: 'EXPIRED' })
    await notify(b.organiser_id, { type: 'BOOKING_EXPIRED', title: `A driver did not answer for ${b.title}`, body: 'Pick another one from the suggestions.', link: `/trips/${b.trip_code}#booking`, email: true })
  }
  await db('driver_offers').where({ status: 'OPEN' }).where('valid_until', '<', now()).update({ status: 'EXPIRED' })
  return rows.length
}

// Payment window: reminders at 24 and 4 hours; members who don't pay are removed
async function paymentDeadlines() {
  const reminderHours = await setting('money.payment_reminder_hours')
  const trips = await db('trips').where({ status: 'PAYMENT_DUE' }).whereNotNull('payment_due_at')
  let n = 0
  for (const trip of trips) {
    const sent = jsonArr(trip.reminders_sent)
    const dueAt = new Date(trip.payment_due_at)
    for (const h of reminderHours) {
      const key = `pay-${h}-${dueAt.getTime()}`
      if (!sent.includes(key) && addHours(dueAt, -h) <= now() && dueAt > now()) {
        for (const m of await activeMembers(trip.id)) {
          const { balance } = await memberBalance(m)
          if (balance > 0) await notify(m.user_id, { type: 'PAYMENT_REMINDER', title: `${h} hours left to pay ${fmt(balance)} for ${trip.title}`, link: `/trips/${trip.code}#pay`, email: true })
        }
        sent.push(key)
        await db('trips').where({ id: trip.id }).update({ reminders_sent: JSON.stringify(sent) })
      }
    }
    if (dueAt > now() || trip.unpaid_decision_due_at || trip.seat_open_until) continue
    await db.transaction(async (trx) => {
      const t = await trx('trips').where({ id: trip.id }).forUpdate().first()
      if (t.status !== 'PAYMENT_DUE') return
      const removed = []
      for (const m of await activeMembers(t.id, trx)) {
        if (m.role === 'ORGANISER') continue
        const { balance, credit } = await memberBalance(m, trx)
        const slip = await trx('payments').where({ member_id: m.id, status: 'UNDER_REVIEW' }).first()
        if (balance <= 0 || slip) continue
        await trx('trip_members').where({ id: m.id }).update({ status: 'REMOVED', removed_reason: 'Did not pay in time', decided_at: now() })
        if (credit > 0) await refundMember(m.id, credit, 'Removed for not paying in full: what you paid is refunded', trx)
        const thread = await tripThread(t.id, trx)
        await removeParticipant(thread.id, m.user_id, trx)
        await notify(m.user_id, { type: 'REMOVED_UNPAID', title: `You were removed from ${t.title}`, body: 'The payment window closed before you paid.', link: '/me/trips', email: true }, trx)
        removed.push(m.full_name.split(' ')[0])
      }
      const organiser = (await activeMembers(t.id, trx)).find((m) => m.role === 'ORGANISER')
      if (organiser && (await memberBalance(organiser, trx)).balance > 0) {
        // The organiser not paying ends the trip
        await cancelTrip(t, { by: 'SYSTEM', reason: 'The organiser did not pay their share in time' }, trx)
        return
      }
      if (removed.length) {
        const hours = await setting('trips.change_confirm_hours')
        await trx('trips').where({ id: t.id }).update({ unpaid_decision_due_at: addHours(now(), hours) })
        await history(t.id, null, 'UNPAID_REMOVED', `Removed for not paying: ${removed.join(', ')}`, null, trx)
        const thread = await tripThread(t.id, trx)
        await systemMessage(thread.id, `${removed.join(', ')} did not pay in time and left the trip. The organiser decides within ${hours} hours: reopen the seat, or continue with fewer people.`, trx)
        await notify(t.organiser_id, { type: 'UNPAID_DECISION', title: `${removed.length} ${removed.length === 1 ? 'member' : 'members'} did not pay`, body: `Reopen the seat for ${hours} hours, or continue with fewer people (the shares are split again).`, link: `/trips/${t.code}#pay`, email: true }, trx)
      } else {
        await maybeConfirm(t, trx)
      }
      n++
    })
  }
  return n
}

async function unpaidDecisionTimeouts() {
  const rows = await db('trips').where({ status: 'PAYMENT_DUE' }).where((w) => w.where('unpaid_decision_due_at', '<', now()).orWhere('seat_open_until', '<', now()))
  for (const t of rows) {
    await db.transaction(async (trx) => {
      const trip = await trx('trips').where({ id: t.id }).forUpdate().first()
      await continueWithFewer(trip, trx)
    })
  }
  return rows.length
}

// Booking and payment must be finished 3 days before the start; otherwise the trip is
// cancelled and everything paid is refunded. Organisers are reminded 7 and 4 days before.
async function startDateRules() {
  const { daysBefore, reminders } = await settings({ daysBefore: 'trips.complete_days_before', reminders: 'trips.reminder_days' })
  const today = colomboDate()
  const trips = await db('trips').whereIn('status', ['OPEN', 'FULL', 'BOOKING', 'PAYMENT_DUE', 'UNDER_REVIEW', 'DRAFT']).whereNotNull('start_date')
  let cancelled = 0
  for (const trip of trips) {
    const days = daysBetween(today, trip.start_date)
    const sent = jsonArr(trip.reminders_sent)
    for (const d of reminders) {
      const key = `start-${d}`
      if (days <= d && days > daysBefore && !sent.includes(key) && ['OPEN', 'FULL', 'BOOKING', 'PAYMENT_DUE'].includes(trip.status)) {
        await notify(trip.organiser_id, { type: 'START_REMINDER', title: `${trip.title} starts in ${days} days`, body: `Booking and payment must be finished ${daysBefore} days before the start, or the trip is cancelled.`, link: `/trips/${trip.code}`, email: true })
        sent.push(key)
        await db('trips').where({ id: trip.id }).update({ reminders_sent: JSON.stringify(sent) })
      }
    }
    if (days <= daysBefore) {
      await db.transaction(async (trx) => {
        const t = await trx('trips').where({ id: trip.id }).forUpdate().first()
        if (['DRAFT', 'UNDER_REVIEW'].includes(t.status)) {
          await trx('trips').where({ id: t.id }).update({ status: 'CANCELLED', cancelled_at: now(), cancel_reason: 'The start date came before the trip was published', cancelled_by: 'SYSTEM' })
          const dep = await trx('payments').where({ trip_id: t.id, purpose: 'DEPOSIT', status: 'PAID' }).first()
          if (dep) await createRefund({ payment: dep, amount: Number(dep.amount), reason: 'Trip never published: deposit returned' }, trx)
          return
        }
        if (['OPEN', 'FULL', 'BOOKING', 'PAYMENT_DUE'].includes(t.status)) {
          await cancelTrip(t, { by: 'SYSTEM', reason: `Booking and payment were not finished ${daysBefore} days before the start` }, trx)
          cancelled++
        }
      })
    }
  }
  return cancelled
}

// Midnight on the start date: Confirmed → Ongoing. The day after the last day: → Completed.
async function startAndCompleteTrips() {
  const today = colomboDate()
  for (const t of await db('trips').where({ status: 'CONFIRMED' }).where('start_date', '<=', today)) {
    await db.transaction(async (trx) => {
      const trip = await trx('trips').where({ id: t.id }).forUpdate().first()
      if (trip.status === 'CONFIRMED') await setStatus(trip, 'ONGOING', { trx, text: 'The trip has started. Check in at the first pickup. SOS is on the trip page.', extra: { started_at: now() } })
    })
  }
  for (const t of await db('trips').where({ status: 'ONGOING' }).where('end_date', '<', today)) {
    await db.transaction(async (trx) => {
      const trip = await trx('trips').where({ id: t.id }).forUpdate().first()
      if (trip.status !== 'ONGOING') return
      await trx('bookings').where({ trip_id: trip.id, status: 'ACCEPTED' }).update({ status: 'COMPLETED' })
      const members = await activeMembers(trip.id, trx)
      for (const m of members) {
        if (!m.checked_in_at) await trx('trip_members').where({ id: m.id }).update({ no_show: true })
        else await trx('profiles').where({ user_id: m.user_id }).increment('trips_completed', 1)
      }
      await setStatus(trip, 'COMPLETED', { trx, text: 'Welcome back! Rate your companions and driver within 14 days. Ratings stay hidden until both sides have rated.', extra: { completed_at: now() } })
      await notifyMembers(trip.id, { type: 'REVIEW_OPEN', title: `How was ${trip.title}?`, body: 'Rate your companions and driver.', link: `/trips/${trip.code}#review` }, { email: true, trx })
      const partners = await trx('bookings').where({ trip_id: trip.id, status: 'COMPLETED' }).distinct('partner_id')
      await notify(partners.map((p) => p.partner_id), { type: 'REVIEW_OPEN', title: `Rate the group from ${trip.title}`, link: `/trips/${trip.code}#review` }, trx)
    })
  }
}

// Review reminder on day 7; after 14 days the trip closes, reviews are published and the deposit returned
async function reviewWindow() {
  const { windowDays, reminderDay } = await settings({ windowDays: 'quality.review_window_days', reminderDay: 'quality.review_reminder_day' })
  for (const t of await db('trips').where({ status: 'COMPLETED' })) {
    const sent = jsonArr(t.reminders_sent)
    if (!sent.includes('review-reminder') && addDays(colomboDate(new Date(t.completed_at)), reminderDay) <= colomboDate()) {
      await notifyMembers(t.id, { type: 'REVIEW_REMINDER', title: `Last week to review ${t.title}`, link: `/trips/${t.code}#review` })
      sent.push('review-reminder')
      await db('trips').where({ id: t.id }).update({ reminders_sent: JSON.stringify(sent) })
    }
    if (addHours(t.completed_at, windowDays * 24) <= now()) {
      await db.transaction(async (trx) => {
        const trip = await trx('trips').where({ id: t.id }).forUpdate().first()
        if (trip.status !== 'COMPLETED') return
        await publishAllForTrip(trip.id, trx)
        if (trip.deposit_payment_id) {
          const upheld = await trx('reports').where({ target_type: 'TRIP', target_id: trip.id, status: 'UPHELD' }).first()
          const dep = await trx('payments').where({ id: trip.deposit_payment_id, status: 'PAID' }).first()
          if (dep && !upheld) await createRefund({ payment: dep, amount: Number(dep.amount), reason: 'Clean trip: listing deposit returned' }, trx)
        }
        await setStatus(trip, 'CLOSED', { trx, text: 'The trip is closed and the reviews are published.', extra: { closed_at: now() } })
      })
    }
  }
}

async function activateRateCards() {
  const due = await db('rate_cards').where({ status: 'SCHEDULED' }).where('effective_from', '<=', now()).orderBy('version')
  for (const card of due) {
    await db.transaction(async (trx) => {
      await trx('rate_cards').where({ kind: card.kind, status: 'ACTIVE' }).update({ status: 'RETIRED', retired_at: now() })
      await trx('rate_cards').where({ id: card.id }).update({ status: 'ACTIVE' })
    })
  }
  if (due.length) clearSettingsCache()
}

// Expired licences and insurance block bookings on the day; partners are warned 30 days before
async function documentExpiry() {
  const today = colomboDate()
  const soon = addDays(today, 30)
  for (const v of await db('verifications').where({ status: 'APPROVED' }).whereNotNull('expires_on').where('expires_on', '<=', soon)) {
    if (v.expires_on < today) {
      await db('verifications').where({ id: v.id }).update({ status: 'EXPIRED' })
      if (v.type === 'VEHICLE' && v.vehicle_id) await db('vehicles').where({ id: v.vehicle_id }).update({ status: 'PENDING' })
      await notify(v.user_id, { type: 'DOCUMENT_EXPIRED', title: `Your ${v.type.toLowerCase()} document has expired`, body: 'You are hidden from search until you upload a new one.', link: '/partner', email: true })
      continue
    }
    const warned = await db('notifications').where({ user_id: v.user_id, type: 'DOCUMENT_EXPIRING' }).whereRaw("payload_json->>'v' = ?", [String(v.id)]).first()
    if (!warned) await notify(v.user_id, { type: 'DOCUMENT_EXPIRING', title: `Your ${v.type.toLowerCase()} document expires on ${v.expires_on}`, body: 'Upload the new one before then to stay bookable.', link: '/partner', email: true, payload: { v: v.id } })
  }
  // Ledger entries for money that has now reached the bank
  await db('ledger_entries').where('status', 'WAITING_SETTLEMENT').whereIn('payment_id', db('payments').select('id').where('settled_on', '<=', today)).update({ status: 'HELD' })
}

const JOBS = { expireJoinRequests, expireBookingRequests, paymentDeadlines, unpaidDecisionTimeouts, startDateRules, startAndCompleteTrips, reviewWindow, promotePayouts: () => promotePayouts(), expireOldSlips: () => expireOldSlips(), activateRateCards, documentExpiry }

export async function runJobs() {
  const results = {}
  for (const [name, job] of Object.entries(JOBS)) {
    try {
      results[name] = (await job()) ?? 'ok'
    } catch (e) {
      console.error(`[job ${name}]`, e)
      results[name] = `error: ${e.message}`
    }
  }
  return results
}

let timer = null
let running = false
export function startScheduler(everyMs = 60 * 1000) {
  if (timer) return
  timer = setInterval(async () => {
    if (running) return
    running = true
    try {
      await runJobs()
    } finally {
      running = false
    }
  }, everyMs)
  timer.unref?.()
}
export const stopScheduler = () => {
  clearInterval(timer)
  timer = null
}
