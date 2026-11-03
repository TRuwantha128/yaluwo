import { stringify } from 'csv-stringify/sync'
import { db } from '../db/knex.js'
import { decrypt } from '../lib/crypto.js'
import { addHours, colomboDate, now } from '../lib/time.js'
import { setting } from './settings.js'
import { notify, pingAdmins } from './notify.js'
import { round2 } from './pricing.js'
import { saveBuffer } from './files.js'
import { newCode } from './trips.js'
import { fmt } from './money.js'

// Money for a trip is "settled" once every payment behind it is in Yaluwo's bank
// (PayHere T+2, or the bank statement date for slips).
export async function tripSettled(tripId, trx = db) {
  const unsettled = await trx('payments').where({ trip_id: tripId, purpose: 'SHARE' }).whereIn('status', ['PAID', 'PART_REFUNDED'])
    .where((w) => w.whereNull('settled_on').orWhere('settled_on', '>', colomboDate())).first()
  return !unsettled
}

async function partnerCanBePaid(partnerId, trx) {
  const account = await trx('bank_accounts').where({ partner_id: partnerId, status: 'VERIFIED' }).orderBy('id', 'desc').first()
  const user = await trx('users').where({ id: partnerId }).first()
  if (!account) return { ok: false, reason: 'No verified bank account yet' }
  const holds = [account.payouts_hold_until, user.payouts_hold_until].filter(Boolean).map((d) => new Date(d))
  if (holds.some((d) => d > now())) return { ok: false, reason: 'Payouts paused after a bank account or password change' }
  if (user.status !== 'ACTIVE') return { ok: false, reason: 'Account suspended' }
  return { ok: true, account }
}

// Driver's fuel advance (section 14): a share of the transport booking becomes Ready
// when the driver and the members check in on day 1.
export async function releaseFuelAdvances(trip, trx = db) {
  const pct = await setting('rates.fuel_advance_pct')
  if (!pct) return
  const members = await trx('trip_members').where({ trip_id: trip.id, status: 'APPROVED' })
  if (members.some((m) => !m.checked_in_at)) return
  const bookings = await trx('bookings').where({ trip_id: trip.id, kind: 'TRANSPORT', status: 'ACCEPTED' }).whereNotNull('partner_checked_in_at')
  for (const b of bookings) {
    const main = await trx('payouts').where({ booking_id: b.id, kind: 'BOOKING' }).whereIn('status', ['HELD', 'WAITING_SETTLEMENT']).first()
    const advanced = await trx('payouts').where({ booking_id: b.id, kind: 'FUEL_ADVANCE' }).first()
    if (!main || advanced) continue
    const amount = round2((Number(main.amount) * pct) / 100)
    const settled = await tripSettled(trip.id, trx)
    await trx('payouts').where({ id: main.id }).update({ amount: round2(Number(main.amount) - amount), gross: round2(Number(main.gross) - (Number(main.gross) * pct) / 100), commission: round2(Number(main.commission) - (Number(main.commission) * pct) / 100) })
    await trx('payouts').insert({ partner_id: b.partner_id, booking_id: b.id, trip_id: trip.id, kind: 'FUEL_ADVANCE', gross: round2((Number(main.gross) * pct) / 100), commission: round2((Number(main.commission) * pct) / 100), amount, status: settled ? 'READY' : 'WAITING_SETTLEMENT', ready_at: settled ? now() : null })
    await notify(b.partner_id, { type: 'FUEL_ADVANCE', title: `Fuel advance ${fmt(amount)} ${settled ? 'ready' : 'waiting for settlement'}`, body: `${pct}% of your booking for ${trip.title}.`, link: '/partner/earnings', email: true }, trx)
    pingAdmins('payouts')
  }
}

// Called by the scheduler. Held payouts become Ready 24 hours after the trip when the
// money has arrived and there is no dispute; partners are told why if not.
export async function promotePayouts(trx = db) {
  const hours = await setting('money.payout_ready_hours')
  const rows = await trx('payouts as p').join('trips as t', 't.id', 'p.trip_id').whereIn('p.status', ['HELD', 'WAITING_SETTLEMENT'])
    .whereIn('t.status', ['COMPLETED', 'CLOSED']).select('p.*', 't.completed_at', 't.id as tid', 't.title')
  let promoted = 0
  for (const p of rows) {
    if (p.kind === 'BOOKING' && addHours(p.completed_at, hours) > now()) continue
    const dispute = await trx('disputes').where({ booking_id: p.booking_id }).whereNot({ status: 'DECIDED' }).first()
    if (dispute) {
      await trx('payouts').where({ id: p.id }).update({ status: 'FROZEN' })
      continue
    }
    if (!(await tripSettled(p.tid, trx))) {
      if (p.status !== 'WAITING_SETTLEMENT') await trx('payouts').where({ id: p.id }).update({ status: 'WAITING_SETTLEMENT' })
      continue
    }
    await trx('payouts').where({ id: p.id }).update({ status: 'READY', ready_at: now() })
    await notify(p.partner_id, { type: 'PAYOUT_READY', title: `Payout ready: ${fmt(p.amount)}`, body: `For ${p.title}. Yaluwo sends it with the next bank batch.`, link: '/partner/earnings' }, trx)
    promoted++
  }
  if (promoted) pingAdmins('payouts')
  return promoted
}

// Release: make a bank bulk payment file (CEFT) for the chosen Ready payouts.
// The admin uploads it to Yaluwo's internet banking, approves it there, then types the batch reference back.
export async function createBatch(payoutIds, adminId, trx = db) {
  const rows = await trx('payouts').whereIn('id', payoutIds).where({ status: 'READY' }).forUpdate()
  if (!rows.length) return null
  const lines = []
  for (const p of rows) {
    const check = await partnerCanBePaid(p.partner_id, trx)
    if (!check.ok) continue
    lines.push({ payout: p, account: check.account })
  }
  if (!lines.length) return { skipped: rows.length }
  const total = round2(lines.reduce((s, l) => s + Number(l.payout.amount), 0))
  const code = await newCode('payout_batches', 'PB', trx)
  const csv = stringify(
    lines.map(({ payout, account }) => ({
      beneficiary_name: account.holder_name,
      bank: account.bank,
      branch: account.branch,
      account_number: decrypt(account.account_no_enc),
      amount: Number(payout.amount).toFixed(2),
      reference: `${code}-P${payout.id}`,
    })),
    { header: true },
  )
  const fileKey = await saveBuffer(Buffer.from(csv), { folder: 'payout-batches', ext: 'csv' })
  const [batchId] = await trx('payout_batches').insert({ code, created_by: adminId, approved_by: adminId, total, count: lines.length, file_key: fileKey, status: 'APPROVED' })
  for (const { payout, account } of lines) await trx('payouts').where({ id: payout.id }).update({ status: 'APPROVED', batch_id: batchId, bank_account_id: account.id })
  return { batchId, code, total, count: lines.length, skipped: rows.length - lines.length }
}

export async function markBatchSent(batchId, bankRef, trx = db) {
  await trx('payout_batches').where({ id: batchId }).update({ status: 'SENT', bank_ref: bankRef, sent_at: now() })
  const payouts = await trx('payouts').where({ batch_id: batchId, status: 'APPROVED' })
  for (const p of payouts) {
    await trx('payouts').where({ id: p.id }).update({ status: 'SENT', bank_ref: bankRef })
    await notify(p.partner_id, { type: 'PAYOUT_SENT', title: `Payout sent to your bank: ${fmt(p.amount)}`, body: `Bank reference ${bankRef}.`, link: '/partner/earnings' }, trx)
  }
}

export async function markPayoutPaid(payoutId, trx = db) {
  const p = await trx('payouts').where({ id: payoutId }).first()
  await trx('payouts').where({ id: payoutId }).update({ status: 'PAID', paid_at: now() })
  await trx('ledger_entries').insert({ booking_id: p.booking_id, trip_id: p.trip_id, partner_id: p.partner_id, type: 'PAYOUT', amount: -p.amount, status: 'PAID' })
  await notify(p.partner_id, { type: 'PAYOUT_PAID', title: `Paid: ${fmt(p.amount)}`, link: '/partner/earnings', email: true }, trx)
  const left = await trx('payouts').where({ batch_id: p.batch_id }).whereNotIn('status', ['PAID', 'FAILED']).first()
  if (!left) {
    const failed = await trx('payouts').where({ batch_id: p.batch_id, status: 'FAILED' }).first()
    await trx('payout_batches').where({ id: p.batch_id }).update({ status: failed ? 'PARTIAL' : 'PAID' })
  }
}

export async function markPayoutFailed(payoutId, reason, trx = db) {
  const p = await trx('payouts').where({ id: payoutId }).first()
  await trx('payouts').where({ id: payoutId }).update({ status: 'READY', batch_id: null, failure_reason: reason })
  await notify(p.partner_id, { type: 'PAYOUT_FAILED', title: 'Your payout could not be sent', body: `${reason}. Please check your bank account details.`, link: '/partner/earnings', email: true }, trx)
}
