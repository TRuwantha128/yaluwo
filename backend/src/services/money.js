import { db } from '../db/knex.js'
import { env } from '../config/env.js'
import { md5Upper } from '../lib/crypto.js'
import { bad, conflict } from '../lib/errors.js'
import { addDays, addHours, addWorkingDays, colomboDate, colomboMidnight, daysBetween, now } from '../lib/time.js'
import { setting, settings } from './settings.js'
import { notify, adminIds, pingAdmins } from './notify.js'
import { systemMessage, tripThread } from './chat.js'
import { commissionOf, round2, splitEven } from './pricing.js'
import { activeMembers, history, memberBalance, notifyMembers, recalculateShares, setStatus, tripDays } from './trips.js'

const fmt = (n) => `Rs ${Number(n).toLocaleString('en-LK', { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`
export { fmt }

// ---------- PayHere (hosted checkout; card numbers never reach Yaluwo) ----------
// hash = UPPER(MD5(merchant_id + order_id + amount + currency + UPPER(MD5(secret))))
export function payhereHash(orderId, amount, currency = 'LKR') {
  return md5Upper(`${env.payhere.merchantId}${orderId}${Number(amount).toFixed(2)}${currency}${md5Upper(env.payhere.secret)}`)
}
// md5sig = UPPER(MD5(merchant_id + order_id + payhere_amount + payhere_currency + status_code + UPPER(MD5(secret))))
export function payhereNotifySig({ merchant_id, order_id, payhere_amount, payhere_currency, status_code }) {
  return md5Upper(`${merchant_id}${order_id}${payhere_amount}${payhere_currency}${status_code}${md5Upper(env.payhere.secret)}`)
}

export function payhereCheckout(payment, user, { itemName }) {
  const [first, ...rest] = user.full_name.split(' ')
  return {
    action: env.payhere.mode === 'simulate' ? `${env.appUrl}/pay/test/${payment.order_id}` : env.payhere.checkoutUrl,
    simulate: env.payhere.mode === 'simulate',
    fields: {
      merchant_id: env.payhere.merchantId,
      return_url: `${env.appUrl}/pay/return?order=${payment.order_id}`,
      cancel_url: `${env.appUrl}/pay/cancelled?order=${payment.order_id}`,
      notify_url: `${env.apiUrl}/api/v1/webhooks/payhere`,
      order_id: payment.order_id,
      items: itemName,
      currency: payment.currency,
      amount: Number(payment.amount).toFixed(2),
      first_name: first,
      last_name: rest.join(' ') || first,
      email: user.email,
      phone: user.phone,
      address: 'Sri Lanka',
      city: 'Colombo',
      country: 'Sri Lanka',
      hash: payhereHash(payment.order_id, payment.amount, payment.currency),
    },
  }
}

// ---------- Creating payment orders ----------
export async function memberNumber(member, trx = db) {
  const all = await trx('trip_members').where({ trip_id: member.trip_id }).orderBy('id').select('id')
  return all.findIndex((m) => m.id === member.id) + 1
}

export async function createSharePayment({ trip, member, user, channel }, trx = db) {
  if (trip.status !== 'PAYMENT_DUE') throw conflict('Payment is not open for this trip.')
  const { balance } = await memberBalance(member, trx)
  if (balance <= 0) throw conflict('You have already paid your share.')
  const pending = await trx('payments').where({ member_id: member.id, purpose: 'SHARE' }).whereIn('status', ['UNDER_REVIEW']).first()
  if (pending) throw conflict('Your bank slip is being checked. You can pay by card if it is rejected.')
  if (channel === 'BANK_TRANSFER') {
    const minDays = await setting('money.slip_min_days_ahead')
    if (daysBetween(colomboDate(), trip.start_date) < minDays) throw bad(`Bank transfers are only for trips starting at least ${minDays} days from today. Please pay by card or wallet.`)
  }
  // Cancel older unfinished orders for this member so only one is open
  await trx('payments').where({ member_id: member.id, status: 'PENDING' }).update({ status: 'CANCELLED' })
  const n = await memberNumber(member, trx)
  const count = await trx('payments').where({ member_id: member.id }).count({ c: '*' }).first()
  const reference = `${trip.code}-M${n}`
  const orderId = `${reference}-${Number(count.c) + 1}`
  const feePct = await setting('fees.booking_fee_pct')
  const feePart = round2((balance * feePct) / (100 + feePct))
  const [id] = await trx('payments').insert({
    order_id: orderId, user_id: user.id, trip_id: trip.id, member_id: member.id, channel, purpose: 'SHARE',
    amount: balance, share_part: round2(balance - feePart), fee_part: feePart, reference, expires_at: trip.payment_due_at,
  })
  return trx('payments').where({ id }).first()
}

export async function createDepositPayment({ trip, user, channel }, trx = db) {
  const amount = await setting('trips.listing_deposit')
  const paid = await trx('payments').where({ trip_id: trip.id, purpose: 'DEPOSIT' }).whereIn('status', ['PAID', 'UNDER_REVIEW']).first()
  if (paid) throw conflict('The listing deposit is already paid or being checked.')
  await trx('payments').where({ trip_id: trip.id, purpose: 'DEPOSIT', status: 'PENDING' }).update({ status: 'CANCELLED' })
  const count = await trx('payments').where({ trip_id: trip.id, purpose: 'DEPOSIT' }).count({ c: '*' }).first()
  const reference = `${trip.code}-D`
  const [id] = await trx('payments').insert({
    order_id: `${reference}-${Number(count.c) + 1}`, user_id: user.id, trip_id: trip.id, channel, purpose: 'DEPOSIT',
    amount, share_part: amount, fee_part: 0, reference,
  })
  return trx('payments').where({ id }).first()
}

export async function bankDetails(payment) {
  const account = await setting('bank.transfer_account')
  return { ...account, amount: payment.amount, reference: payment.reference, note: `Write ${payment.reference} on the slip or in the transfer note.` }
}

// ---------- Money arrives ----------
// settledOn: when the money is in Yaluwo's bank (PayHere T+2 working days, or the bank statement date)
export async function markPaid(paymentId, { method = null, payhereId = null, settledOn = null, statusCode = null, raw = null, paidAmount = null }, trx = db) {
  const p = await trx('payments').where({ id: paymentId }).forUpdate().first()
  if (!p || p.status === 'PAID') return { already: true, payment: p }
  const settle = settledOn ?? (p.channel === 'PAYHERE' ? addWorkingDays(colomboDate(), await setting('money.payhere_settlement_working_days')) : colomboDate())
  const amount = paidAmount != null ? round2(paidAmount) : Number(p.amount)
  const update = { status: 'PAID', paid_at: now(), settled_on: settle, method, payhere_payment_id: payhereId, status_code: statusCode, signature_ok: raw ? true : null, raw_notify: raw ? JSON.stringify(raw) : null, amount }
  if (amount !== Number(p.amount)) {
    const feePct = p.purpose === 'SHARE' ? await setting('fees.booking_fee_pct') : 0
    update.fee_part = round2((amount * feePct) / (100 + feePct))
    update.share_part = round2(amount - update.fee_part)
  }
  await trx('payments').where({ id: p.id }).update(update)
  const paid = { ...p, ...update }

  const status = settle <= colomboDate() ? 'HELD' : 'WAITING_SETTLEMENT'
  if (p.purpose === 'SHARE') {
    await trx('ledger_entries').insert([
      { payment_id: p.id, trip_id: p.trip_id, user_id: p.user_id, type: 'SHARE', amount: paid.share_part, status },
      { payment_id: p.id, trip_id: p.trip_id, user_id: p.user_id, type: 'BOOKING_FEE', amount: paid.fee_part, status: 'EARNED' },
    ])
  } else if (p.purpose === 'DEPOSIT') {
    await trx('ledger_entries').insert({ payment_id: p.id, trip_id: p.trip_id, user_id: p.user_id, type: 'DEPOSIT', amount, status })
  }
  await invoiceFor(paid, trx)
  await notify(p.user_id, { type: 'PAYMENT_RECEIVED', title: `Payment received: ${fmt(amount)}`, body: `Thank you. Your receipt is in Payments & refunds.`, link: '/me/payments', email: true }, trx)
  pingAdmins('payments')

  if (p.purpose === 'SHARE') {
    const trip = await trx('trips').where({ id: p.trip_id }).forUpdate().first()
    await history(trip.id, p.user_id, 'PAYMENT', `A member paid ${fmt(amount)}`, null, trx)
    await maybeConfirm(trip, trx)
  }
  if (p.purpose === 'DEPOSIT') {
    const trip = await trx('trips').where({ id: p.trip_id }).first()
    await trx('trips').where({ id: trip.id }).update({ deposit_payment_id: p.id })
    await history(trip.id, p.user_id, 'DEPOSIT', 'Listing deposit paid', null, trx)
  }
  return { already: false, payment: paid }
}

async function invoiceFor(payment, trx) {
  const year = colomboDate().slice(0, 4)
  const last = await trx('invoices').where('number', 'like', `R-${year}-%`).orderBy('id', 'desc').forUpdate().first()
  const n = last ? Number(last.number.split('-')[2]) + 1 : 1
  await trx('invoices').insert({ number: `R-${year}-${String(n).padStart(6, '0')}`, type: 'RECEIPT', party_id: payment.user_id, payment_id: payment.id, amount: payment.amount })
}

// Everyone has paid: the trip is Confirmed (section 13)
export async function maybeConfirm(trip, trx = db) {
  if (trip.status !== 'PAYMENT_DUE') return false
  const members = await activeMembers(trip.id, trx)
  for (const m of members) {
    const { balance } = await memberBalance(m, trx)
    if (balance > 0) return false
  }
  await confirmTrip(trip, trx)
  return true
}

export async function confirmTrip(trip, trx = db) {
  await setStatus(trip, 'CONFIRMED', { trx, text: 'Everyone has paid. The trip is confirmed: phone numbers are now visible in this chat.', extra: { confirmed_at: now(), needs_rebook: false } })
  const commissionPct = await setting('fees.commission_pct')
  const bookings = await trx('bookings').where({ trip_id: trip.id, status: 'ACCEPTED' })
  const stops = await trx('trip_stops').where({ trip_id: trip.id })
  const days = tripDays(stops)
  for (const b of bookings) {
    const existing = await trx('payouts').where({ booking_id: b.id }).whereNot({ status: 'CANCELLED' }).first()
    if (existing) continue
    const { commission, net } = commissionOf(Number(b.amount) - Number(b.discount), Number(b.commission_rate ?? commissionPct))
    await trx('payouts').insert({ partner_id: b.partner_id, booking_id: b.id, trip_id: trip.id, kind: 'BOOKING', gross: Number(b.amount) - Number(b.discount), commission, amount: net, status: 'HELD' })
    await trx('ledger_entries').insert({ booking_id: b.id, trip_id: trip.id, partner_id: b.partner_id, type: 'COMMISSION', amount: commission, status: 'EARNED' })
    if (b.vehicle_id) {
      for (let d = 0; d < days; d++) {
        const date = addDays(trip.start_date, d)
        await trx('availability').insert({ owner_type: 'VEHICLE', owner_id: b.vehicle_id, date, status: 'BOOKED', booking_id: b.id }).onConflict(['owner_type', 'owner_id', 'date']).merge({ status: 'BOOKED', booking_id: b.id })
      }
    }
    await notify(b.partner_id, { type: 'BOOKING_CONFIRMED', title: `Booking confirmed: ${trip.title}`, body: `Starts ${trip.start_date}. The group has paid; your payout is held until the trip ends.`, link: '/partner', email: true }, trx)
  }
  await notifyMembers(trip.id, { type: 'TRIP_CONFIRMED', title: `${trip.title} is confirmed`, body: `Everyone has paid. See you on ${trip.start_date}!`, link: `/trips/${trip.code}` }, { email: true, trx })
}

// ---------- Refunds ----------
export async function createRefund({ payment, amount, reason, approvedBy = null }, trx = db) {
  amount = round2(Math.min(amount, Number(payment.amount) - Number(payment.refunded_amount ?? 0)))
  if (amount <= 0) return null
  const [id] = await trx('refunds').insert({ payment_id: payment.id, user_id: payment.user_id, trip_id: payment.trip_id, amount, reason, method: payment.channel, approved_by: approvedBy })
  const refunded = round2(Number(payment.refunded_amount ?? 0) + amount)
  await trx('payments').where({ id: payment.id }).update({ refunded_amount: refunded, status: refunded >= Number(payment.amount) ? 'REFUNDED' : 'PART_REFUNDED' })
  payment.refunded_amount = refunded
  await trx('ledger_entries').insert({ payment_id: payment.id, trip_id: payment.trip_id, user_id: payment.user_id, type: 'REFUND', amount: -amount, status: 'HELD', note: reason })
  await notify(payment.user_id, {
    type: 'REFUND',
    title: `Refund of ${fmt(amount)} on its way`,
    body: payment.channel === 'PAYHERE' ? 'Card refunds take several working days, set by your bank.' : 'Bank transfer refunds go to an account in your name with the next payment batch.',
    link: '/me/payments',
    email: true,
  }, trx)
  pingAdmins('refunds')
  return id
}

// Refund up to `amount` from a member's paid share payments, newest first
export async function refundMember(memberId, amount, reason, trx = db, approvedBy = null) {
  let left = round2(amount)
  const payments = await trx('payments').where({ member_id: memberId, purpose: 'SHARE' }).whereIn('status', ['PAID', 'PART_REFUNDED']).orderBy('id', 'desc')
  for (const p of payments) {
    if (left <= 0) break
    const available = round2(Number(p.amount) - Number(p.refunded_amount))
    const take = Math.min(available, left)
    if (take > 0) {
      await createRefund({ payment: p, amount: take, reason, approvedBy }, trx)
      left = round2(left - take)
    }
  }
  return round2(amount - left)
}

// Everything a member paid, back (organiser, admin or system cancellation)
export async function refundAllForTrip(trip, reason, trx = db, approvedBy = null) {
  const payments = await trx('payments').where({ trip_id: trip.id, purpose: 'SHARE' }).whereIn('status', ['PAID', 'PART_REFUNDED'])
  let total = 0
  for (const p of payments) {
    const amount = round2(Number(p.amount) - Number(p.refunded_amount))
    if (amount > 0) {
      await createRefund({ payment: p, amount, reason, approvedBy }, trx)
      total += amount
    }
  }
  // Slips still being checked are rejected so nobody is charged
  const pendingSlips = await trx('payments').where({ trip_id: trip.id }).whereIn('status', ['UNDER_REVIEW', 'PENDING'])
  for (const p of pendingSlips) {
    await trx('payments').where({ id: p.id }).update({ status: 'CANCELLED' })
    await trx('payment_proofs').where({ payment_id: p.id, status: 'UNDER_REVIEW' }).update({ status: 'REJECTED', reason: 'Trip cancelled. If you already sent money, it will be refunded.' })
  }
  return round2(total)
}

// ---------- Cancellations (section 15) ----------
// What a member gets back if they cancel their seat today
export async function memberCancellationTerms(trip, member, trx = db) {
  const { fullDays, halfDays, halfPct } = await settings({ fullDays: 'cancel.member_full_days', halfDays: 'cancel.member_half_days', halfPct: 'cancel.member_half_pct' })
  const credit = await memberBalance(member, trx)
  const paidShare = await trx('payments').where({ member_id: member.id, purpose: 'SHARE' }).whereIn('status', ['PAID', 'PART_REFUNDED']).sum({ s: 'share_part', r: 'refunded_amount' }).first()
  const shareLeft = round2(Math.max(0, Number(paidShare.s ?? 0) - Number(paidShare.r ?? 0)))
  const days = daysBetween(colomboDate(), trip.start_date)
  let refund = 0
  let rule
  if (credit.credit <= 0) {
    rule = 'Nothing was paid, so nothing is refunded. Your seat reopens.'
  } else if (days >= fullDays) {
    refund = shareLeft
    rule = `${days} days before the start: your share is refunded; the booking fee is kept.`
  } else if (days >= halfDays) {
    refund = round2((shareLeft * halfPct) / 100)
    rule = `${days} days before the start: ${halfPct}% of your share is refunded.`
  } else {
    rule = `Less than ${halfDays} days before the start: no refund. Your share still covers the booked services.`
  }
  return { days, refund, paid: credit.credit, rule }
}

export async function cancelBookingsAndPayouts(trip, reason, trx = db) {
  const bookings = await trx('bookings').where({ trip_id: trip.id }).whereIn('status', ['REQUESTED', 'ACCEPTED'])
  for (const b of bookings) {
    await trx('bookings').where({ id: b.id }).update({ status: 'CANCELLED', cancelled_at: now(), cancel_reason: reason })
    await notify(b.partner_id, { type: 'BOOKING_CANCELLED', title: `Booking cancelled: ${trip.title}`, body: reason, link: '/partner', email: true }, trx)
  }
  await trx('payouts').where({ trip_id: trip.id }).whereIn('status', ['HELD', 'WAITING_SETTLEMENT', 'READY', 'FROZEN']).update({ status: 'CANCELLED' })
  await trx('availability').whereIn('booking_id', bookings.map((b) => b.id)).del()
  await trx('driver_offers').where({ trip_id: trip.id, status: 'OPEN' }).update({ status: 'EXPIRED' })
}

// Cancel the whole trip. by: ORGANISER | ADMIN | SYSTEM
export async function cancelTrip(trip, { by, reason, actorId = null }, trx = db) {
  if (['ONGOING', 'COMPLETED', 'CLOSED', 'CANCELLED'].includes(trip.status)) throw conflict('This trip can no longer be cancelled.')
  const wasPaid = ['PAYMENT_DUE', 'CONFIRMED'].includes(trip.status)
  const refunded = await refundAllForTrip(trip, `Trip cancelled (${by.toLowerCase()}): ${reason}`, trx, actorId)
  await cancelBookingsAndPayouts(trip, `The trip was cancelled: ${reason}`, trx)
  await trx('trip_members').where({ trip_id: trip.id, status: 'REQUESTED' }).update({ status: 'EXPIRED', decided_at: now() })
  await setStatus(trip, 'CANCELLED', { actorId, trx, text: `The trip was cancelled. ${refunded > 0 ? 'Everything paid is being refunded.' : ''}`, extra: { cancelled_at: now(), cancel_reason: reason, cancelled_by: by } })
  // The listing deposit is kept when the organiser cancels; refunded when the system or admin does
  if (by !== 'ORGANISER' && trip.deposit_payment_id) {
    const dep = await trx('payments').where({ id: trip.deposit_payment_id }).first()
    if (dep && dep.status === 'PAID') await createRefund({ payment: dep, amount: Number(dep.amount), reason: 'Listing deposit returned: trip cancelled by Yaluwo' }, trx)
  }
  if (by === 'ORGANISER' && wasPaid) {
    await trx('strikes').insert({ partner_id: trip.organiser_id, reason: 'Organiser cancelled a paid trip' })
  }
  await notifyMembers(trip.id, { type: 'TRIP_CANCELLED', title: `${trip.title} was cancelled`, body: `${reason}${refunded > 0 ? ` Refunds: ${fmt(refunded)} in total.` : ''}`, link: `/trips/${trip.code}` }, { email: true, trx })
  return { refunded }
}

// A partner cancels after the trip is booked: the group gets 100% of that booking back
export async function partnerCancelsBooking(booking, reason, trx = db) {
  const trip = await trx('trips').where({ id: booking.trip_id }).forUpdate().first()
  await trx('bookings').where({ id: booking.id }).update({ status: 'CANCELLED_BY_PARTNER', cancelled_at: now(), cancel_reason: reason })
  await trx('payouts').where({ booking_id: booking.id }).whereNotIn('status', ['PAID', 'SENT']).update({ status: 'CANCELLED' })
  await trx('availability').where({ booking_id: booking.id }).del()
  await trx('strikes').insert({ partner_id: booking.partner_id, booking_id: booking.id, reason: `Cancelled a booking: ${reason}` })
  const wasPaid = ['PAYMENT_DUE', 'CONFIRMED'].includes(trip.status)
  if (wasPaid) {
    const members = await activeMembers(trip.id, trx)
    const feePct = await setting('fees.booking_fee_pct')
    const parts = splitEven(Number(booking.amount) - Number(booking.discount), members.length)
    for (const [i, m] of members.entries()) {
      const back = round2(parts[i] * (1 + feePct / 100))
      const { credit } = await memberBalance(m, trx)
      if (credit > 0) await refundMember(m.id, Math.min(back, credit), `${booking.code} cancelled by the partner`, trx)
    }
    await setStatus(trip, 'BOOKING', { trx, text: 'A partner cancelled their booking. The organiser will book another one; the money for it has been refunded.', extra: { needs_rebook: true } })
    await recalculateShares(trip, trx) // shares now cover only the bookings still accepted
  }
  await notify(trip.organiser_id, { type: 'PARTNER_CANCELLED', title: 'A partner cancelled your booking', body: `${reason}. Book another one from the trip page.`, link: `/trips/${trip.code}`, email: true }, trx)
  await checkStrikes(booking.partner_id, trx)
}

export async function checkStrikes(partnerId, trx = db) {
  const { limit, months } = await settings({ limit: 'quality.strike_limit', months: 'quality.strike_months' })
  const since = new Date(now().getTime() - months * 30 * 24 * 3600 * 1000)
  const c = await trx('strikes').where({ partner_id: partnerId }).where('created_at', '>', since).count({ n: '*' }).first()
  if (Number(c.n) >= limit) {
    await notify(await adminIds(trx), { type: 'STRIKES', title: `Partner #${partnerId} has ${c.n} strikes`, body: 'Flagged for a suspension review.', link: `/admin/users/${partnerId}` }, trx)
  }
}

export const paymentWindowEnds = async (trip) => {
  const { daysBefore } = await settings({ daysBefore: 'trips.complete_days_before' })
  return colomboMidnight(addDays(trip.start_date, -daysBefore))
}

export { addHours }
