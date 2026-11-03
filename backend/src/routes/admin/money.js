import { Router } from 'express'
import fs from 'node:fs/promises'
import { z } from 'zod'
import { db } from '../../db/knex.js'
import { parse, upload } from '../../middleware/http.js'
import { hasStepUp, requirePermission } from '../../middleware/auth.js'
import { bad, conflict, needStepUp, notFound } from '../../lib/errors.js'
import { colomboDate, now } from '../../lib/time.js'
import { setting } from '../../services/settings.js'
import { filePath, signedUrl } from '../../services/files.js'
import { audit, auditFrom } from '../../services/audit.js'
import { notify } from '../../services/notify.js'
import { approveSlip, askBalance, importStatement, rejectSlip } from '../../services/slips.js'
import { createBatch, markBatchSent, markPayoutFailed, markPayoutPaid } from '../../services/payouts.js'
import { createRefund, fmt, refundMember } from '../../services/money.js'
import { activeMembers } from '../../services/trips.js'
import { round2, splitEven } from '../../services/pricing.js'
import { jsonOf } from '../../lib/json.js'

const r = Router()
r.use(requirePermission('FINANCE'))

// ---------- Incoming ----------
r.get('/payments', async (req, res) => {
  const q = db('payments as p').join('users as u', 'u.id', 'p.user_id').leftJoin('trips as t', 't.id', 'p.trip_id').whereNot('p.status', 'CANCELLED')
    .select('p.*', 'u.full_name', 't.code as trip_code').orderBy('p.id', 'desc').limit(300)
  if (req.query.status) q.where('p.status', req.query.status)
  const rows = await q
  res.json({ payments: rows.map((p) => ({ id: p.id, date: p.paid_at ?? p.created_at, trip: p.trip_code, payer: p.full_name, amount: p.amount, method: p.channel === 'PAYHERE' ? `PayHere${p.method ? ` · ${p.method}` : ''}` : 'Bank transfer', ref: p.payhere_payment_id ?? p.reference, status: p.status, purpose: p.purpose, settledOn: p.settled_on, refunded: p.refunded_amount })) })
})

// ---------- Slips to check, side by side with the bank statement ----------
r.get('/slips', async (req, res) => {
  const rows = await db('payment_proofs as s').join('payments as p', 'p.id', 's.payment_id').join('users as u', 'u.id', 'p.user_id').leftJoin('bank_statement_lines as l', 'l.id', 's.statement_line_id')
    .where('s.status', req.query.status ?? 'UNDER_REVIEW')
    .select('s.*', 'p.amount as due', 'p.order_id', 'u.full_name', 'l.date as line_date', 'l.amount as line_amount', 'l.description as line_description', 'l.bank_ref as line_ref').orderBy('s.id')
  res.json({
    slips: rows.map((s) => ({
      id: s.id, reference: s.reference, payer: s.full_name, due: s.due, entered: s.amount_entered, paidOn: s.paid_on, bank: s.bank, bankRef: s.bank_ref, file: signedUrl(s.file_key), status: s.status, submittedAt: s.created_at,
      line: s.statement_line_id ? { date: s.line_date, amount: s.line_amount, description: s.line_description, ref: s.line_ref } : null,
    })),
    unmatchedLines: await db('bank_statement_lines').whereNull('matched_payment_id').orderBy('date', 'desc').limit(100),
  })
})

r.post('/bank-statements', upload.single('statement'), async (req, res) => {
  if (!req.file) throw bad('Choose the bank statement CSV.')
  const out = await db.transaction((trx) => importStatement(req.file.buffer, req.file.originalname, req.user.id, trx))
  res.json(out)
})

// Manually link a slip to a statement line (when the payer wrote the reference wrongly)
r.post('/slips/:id/match', async (req, res) => {
  const { lineId } = parse(z.object({ lineId: z.coerce.number().int() }), req.body)
  await db.transaction(async (trx) => {
    const proof = await trx('payment_proofs').where({ id: req.params.id, status: 'UNDER_REVIEW' }).first()
    const line = await trx('bank_statement_lines').where({ id: lineId }).whereNull('matched_payment_id').first()
    if (!proof || !line) throw conflict('This slip or bank line is not available.')
    await trx('payment_proofs').where({ id: proof.id }).update({ statement_line_id: line.id })
    await trx('bank_statement_lines').where({ id: line.id }).update({ matched_payment_id: proof.payment_id, matched_at: now() })
    await audit({ ...auditFrom(req), action: 'SLIP_MATCHED_MANUALLY', targetType: 'SLIP', targetId: proof.id, details: { lineId } }, trx)
  })
  res.json({ ok: true })
})

r.post('/slips/:id/approve', async (req, res) => {
  await db.transaction((trx) => approveSlip(req.params.id, req.user.id, trx))
  res.json({ ok: true })
})
r.post('/slips/:id/reject', async (req, res) => {
  const { reason } = parse(z.object({ reason: z.string().min(5).max(500) }), req.body)
  await db.transaction((trx) => rejectSlip(req.params.id, req.user.id, reason, trx))
  res.json({ ok: true })
})
r.post('/slips/:id/ask-balance', async (req, res) => {
  await db.transaction((trx) => askBalance(req.params.id, req.user.id, trx))
  res.json({ ok: true })
})

// ---------- PayHere settlements: each deposit matched to the payments it covers ----------
r.get('/settlements', async (_req, res) => {
  const rows = await db('payments').where({ channel: 'PAYHERE' }).whereIn('status', ['PAID', 'PART_REFUNDED', 'REFUNDED']).groupBy('settled_on').select('settled_on').sum({ total: 'amount' }).count({ n: '*' }).orderBy('settled_on', 'desc')
  const recorded = await db('settlements')
  res.json({ days: rows.map((d) => { const s = recorded.find((x) => x.date === d.settled_on); return { date: d.settled_on, expected: Number(d.total), payments: Number(d.n), bankCredit: s?.bank_credit ?? null, matched: Boolean(s?.matched), arrived: d.settled_on <= colomboDate() } }) })
})

r.post('/settlements', async (req, res) => {
  const body = parse(z.object({ date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/), bankCredit: z.coerce.number(), notes: z.string().max(500).optional() }), req.body)
  const expected = await db('payments').where({ channel: 'PAYHERE', settled_on: body.date }).whereIn('status', ['PAID', 'PART_REFUNDED', 'REFUNDED']).sum({ t: 'amount' }).first()
  // PayHere takes its fee before paying out, so the bank credit is usually a little less
  const matched = Math.abs(Number(expected.t ?? 0) - body.bankCredit) / Math.max(1, Number(expected.t ?? 0)) < 0.05
  await db('settlements').insert({ date: body.date, payhere_total: Number(expected.t ?? 0), bank_credit: body.bankCredit, matched, notes: body.notes ?? null })
  await audit({ ...auditFrom(req), action: 'SETTLEMENT_RECORDED', targetType: 'SETTLEMENT', targetId: body.date, amount: body.bankCredit, details: { expected: expected.t, matched } })
  res.json({ matched, expected: Number(expected.t ?? 0) })
})

// ---------- Payouts: Held, Ready, Sent and paid ----------
r.get('/payouts', async (req, res) => {
  const statuses = String(req.query.status ?? 'READY').split(',')
  const rows = await db('payouts as p').join('users as u', 'u.id', 'p.partner_id').leftJoin('trips as t', 't.id', 'p.trip_id').leftJoin('bank_accounts as a', (j) => j.on('a.partner_id', 'p.partner_id').andOnVal('a.status', 'VERIFIED'))
    .leftJoin('payout_batches as pb', 'pb.id', 'p.batch_id').whereIn('p.status', statuses)
    .select('p.*', 'u.full_name', 't.code as trip_code', 't.title', 'a.bank', 'a.account_last4', 'pb.code as batch_code').orderBy('p.id', 'desc').limit(300)
  res.json({ payouts: rows.map((p) => ({ id: p.id, partner: p.full_name, trip: p.trip_code, title: p.title, kind: p.kind, gross: p.gross, commission: p.commission, net: p.amount, status: p.status, account: p.bank ? `${p.bank} ••••${p.account_last4}` : 'No verified account', readyAt: p.ready_at, batch: p.batch_code, bankRef: p.bank_ref })) })
})

// One click (or select several). Batches over the step-up limit need a fresh password + code.
r.post('/payouts/release', async (req, res) => {
  const { ids } = parse(z.object({ ids: z.array(z.number().int()).min(1) }), req.body)
  const total = await db('payouts').whereIn('id', ids).where({ status: 'READY' }).sum({ t: 'amount' }).first()
  const limit = await setting('money.stepup_limit')
  if (Number(total.t ?? 0) > limit && !hasStepUp(req)) throw needStepUp()
  const out = await db.transaction(async (trx) => {
    const batch = await createBatch(ids, req.user.id, trx)
    if (!batch?.batchId) throw conflict(batch?.skipped ? 'None of these partners can be paid yet (no verified bank account, or payouts are paused).' : 'Nothing to release.')
    await audit({ ...auditFrom(req), action: 'PAYOUTS_RELEASED', targetType: 'PAYOUT_BATCH', targetId: batch.code, amount: batch.total, details: { ids, stepUp: hasStepUp(req) } }, trx)
    return batch
  })
  res.json(out)
})

r.get('/payout-batches', async (_req, res) => {
  const rows = await db('payout_batches').orderBy('id', 'desc').limit(100)
  res.json({ batches: rows.map((b) => ({ id: b.id, code: b.code, total: b.total, count: b.count, status: b.status, bankRef: b.bank_ref, sentAt: b.sent_at, createdAt: b.created_at })) })
})

// The bank bulk payment file (CSV) to upload in Yaluwo's internet banking
r.get('/payout-batches/:id/file', async (req, res) => {
  const b = await db('payout_batches').where({ id: req.params.id }).first()
  if (!b?.file_key) throw notFound('This file')
  await audit({ ...auditFrom(req), action: 'PAYOUT_FILE_DOWNLOADED', targetType: 'PAYOUT_BATCH', targetId: b.code })
  res.setHeader('Content-Type', 'text/csv')
  res.setHeader('Content-Disposition', `attachment; filename="${b.code}.csv"`)
  res.send(await fs.readFile(filePath(b.file_key)))
})

r.post('/payout-batches/:id/sent', async (req, res) => {
  const { bankRef } = parse(z.object({ bankRef: z.string().trim().min(3).max(60) }), req.body)
  await db.transaction(async (trx) => {
    const b = await trx('payout_batches').where({ id: req.params.id }).first()
    if (!b || b.status !== 'APPROVED') throw conflict('This batch is not waiting to be sent.')
    await markBatchSent(b.id, bankRef, trx)
    await audit({ ...auditFrom(req), action: 'PAYOUT_BATCH_SENT', targetType: 'PAYOUT_BATCH', targetId: b.code, amount: b.total, details: { bankRef } }, trx)
  })
  res.json({ ok: true })
})

r.post('/payouts/:id/paid', async (req, res) => {
  await db.transaction(async (trx) => {
    const p = await trx('payouts').where({ id: req.params.id }).first()
    if (!p || p.status !== 'SENT') throw conflict('This payout has not been sent.')
    await markPayoutPaid(p.id, trx)
    await audit({ ...auditFrom(req), action: 'PAYOUT_PAID', targetType: 'PAYOUT', targetId: p.id, amount: p.amount }, trx)
  })
  res.json({ ok: true })
})

r.post('/payouts/:id/failed', async (req, res) => {
  const { reason } = parse(z.object({ reason: z.string().min(3).max(300) }), req.body)
  await db.transaction(async (trx) => {
    const p = await trx('payouts').where({ id: req.params.id }).first()
    if (!p || !['SENT', 'APPROVED'].includes(p.status)) throw conflict('This payout is not in a batch.')
    await markPayoutFailed(p.id, reason, trx)
    await audit({ ...auditFrom(req), action: 'PAYOUT_FAILED', targetType: 'PAYOUT', targetId: p.id, amount: p.amount, details: { reason } }, trx)
  })
  res.json({ ok: true })
})

// ---------- Refunds ----------
r.get('/refunds', async (req, res) => {
  const rows = await db('refunds as x').join('users as u', 'u.id', 'x.user_id').join('payments as p', 'p.id', 'x.payment_id').leftJoin('trips as t', 't.id', 'x.trip_id')
    .where('x.status', req.query.status ?? 'PENDING').select('x.*', 'u.full_name', 'p.order_id', 'p.payhere_payment_id', 't.code as trip_code').orderBy('x.id')
  res.json({ refunds: rows.map((x) => ({ id: x.id, payer: x.full_name, amount: x.amount, method: x.method, reason: x.reason, order: x.order_id, payhereId: x.payhere_payment_id, trip: x.trip_code, createdAt: x.created_at, status: x.status, ref: x.payhere_ref ?? x.bank_ref })) })
})

// Card refunds go through PayHere's Refund API (or its merchant portal); slip refunds by bank transfer
r.post('/refunds/:id/processed', async (req, res) => {
  const { reference } = parse(z.object({ reference: z.string().trim().min(3).max(60) }), req.body)
  await db.transaction(async (trx) => {
    const x = await trx('refunds').where({ id: req.params.id }).forUpdate().first()
    if (!x || x.status !== 'PENDING') throw conflict('This refund is not pending.')
    await trx('refunds').where({ id: x.id }).update({ status: 'PROCESSED', processed_at: now(), approved_by: req.user.id, ...(x.method === 'PAYHERE' ? { payhere_ref: reference } : { bank_ref: reference }) })
    await trx('ledger_entries').where({ payment_id: x.payment_id, type: 'REFUND', status: 'HELD' }).update({ status: 'REFUNDED' })
    await notify(x.user_id, { type: 'REFUND_SENT', title: `Refund sent: ${fmt(x.amount)}`, body: `Reference ${reference}.`, link: '/me/payments', email: true }, trx)
    await audit({ ...auditFrom(req), action: 'REFUND_PROCESSED', targetType: 'REFUND', targetId: x.id, amount: x.amount, details: { reference } }, trx)
  })
  res.json({ ok: true })
})

r.post('/refunds', async (req, res) => {
  const body = parse(z.object({ paymentId: z.coerce.number().int(), amount: z.coerce.number().positive(), reason: z.string().min(5).max(500) }), req.body)
  const id = await db.transaction(async (trx) => {
    const p = await trx('payments').where({ id: body.paymentId }).forUpdate().first()
    if (!p || !['PAID', 'PART_REFUNDED'].includes(p.status)) throw conflict('Only paid payments can be refunded.')
    const rid = await createRefund({ payment: p, amount: body.amount, reason: body.reason, approvedBy: req.user.id }, trx)
    await audit({ ...auditFrom(req), action: 'REFUND_CREATED', targetType: 'PAYMENT', targetId: p.id, amount: body.amount, details: { reason: body.reason } }, trx)
    return rid
  })
  res.json({ id })
})

// ---------- Chargebacks ----------
r.get('/chargebacks', async (_req, res) => {
  const rows = await db('chargebacks as c').join('payments as p', 'p.id', 'c.payment_id').leftJoin('trips as t', 't.id', 'p.trip_id').select('c.*', 'p.order_id', 't.code as trip_code').orderBy('c.id', 'desc')
  res.json({ chargebacks: rows })
})

r.post('/chargebacks/:id/outcome', async (req, res) => {
  const body = parse(z.object({ outcome: z.enum(['EVIDENCE_SENT', 'WON', 'LOST']), recoverFromPartnerId: z.coerce.number().int().optional(), amount: z.coerce.number().optional() }), req.body)
  await db('chargebacks').where({ id: req.params.id }).update({ status: body.outcome, recovered_from_partner_id: body.recoverFromPartnerId ?? null, recovered_amount: body.amount ?? null })
  await audit({ ...auditFrom(req), action: `CHARGEBACK_${body.outcome}`, targetType: 'CHARGEBACK', targetId: req.params.id, amount: body.amount })
  res.json({ ok: true })
})

// ---------- Disputes: the admin decides within 72 hours ----------
r.get('/disputes', async (req, res) => {
  const rows = await db('disputes as d').join('bookings as b', 'b.id', 'd.booking_id').join('users as o', 'o.id', 'd.opened_by').join('users as p', 'p.id', 'b.partner_id').join('trips as t', 't.id', 'd.trip_id')
    .where((w) => (req.query.all ? w : w.whereNot('d.status', 'DECIDED'))).select('d.*', 'b.code as booking_code', 'b.amount', 'o.full_name as opened_by_name', 'p.full_name as partner_name', 't.code as trip_code').orderBy('d.admin_due_at')
  res.json({ disputes: rows.map((d) => ({ id: d.id, code: d.code, booking: d.booking_code, trip: d.trip_code, amount: d.amount, openedBy: d.opened_by_name, partner: d.partner_name, reason: d.reason, response: d.partner_response, status: d.status, decision: d.decision, partnerDueAt: d.partner_due_at, adminDueAt: d.admin_due_at, evidence: jsonOf(d.evidence_keys, []).map((k) => signedUrl(k)), partnerEvidence: jsonOf(d.partner_evidence_keys, []).map((k) => signedUrl(k)) })) })
})

r.post('/disputes/:id/decide', async (req, res) => {
  const body = parse(z.object({ decision: z.enum(['RELEASE', 'PARTIAL', 'REFUND']), refundAmount: z.coerce.number().min(0).optional(), note: z.string().min(5).max(1000) }), req.body)
  await db.transaction(async (trx) => {
    const d = await trx('disputes').where({ id: req.params.id }).forUpdate().first()
    if (!d || d.status === 'DECIDED') throw conflict('This dispute is already decided.')
    const b = await trx('bookings').where({ id: d.booking_id }).first()
    const gross = Number(b.amount) - Number(b.discount)
    const refundTotal = body.decision === 'REFUND' ? gross : body.decision === 'PARTIAL' ? round2(body.refundAmount ?? 0) : 0
    if (refundTotal > gross) throw bad('The refund cannot be more than the booking.')
    if (refundTotal > 0) {
      const members = await activeMembers(d.trip_id, trx)
      const parts = splitEven(refundTotal, members.length)
      for (const [i, m] of members.entries()) await refundMember(m.id, parts[i], `Dispute ${d.code} decided`, trx, req.user.id)
    }
    const payouts = await trx('payouts').where({ booking_id: b.id }).whereIn('status', ['FROZEN', 'HELD', 'WAITING_SETTLEMENT', 'READY'])
    if (body.decision === 'REFUND') {
      await trx('payouts').whereIn('id', payouts.map((p) => p.id)).update({ status: 'CANCELLED' })
    } else {
      // The partner's payout shrinks by the refund (and its commission); then it goes back into the normal flow
      for (const p of payouts) {
        const share = gross > 0 ? Number(p.gross) / gross : 0
        const cut = round2(refundTotal * share)
        const newGross = round2(Number(p.gross) - cut)
        const commission = round2((newGross * Number(b.commission_rate)) / 100)
        await trx('payouts').where({ id: p.id }).update({ gross: newGross, commission, amount: round2(newGross - commission), status: 'HELD' })
      }
    }
    if (body.decision !== 'RELEASE') await trx('strikes').insert({ partner_id: b.partner_id, booking_id: b.id, reason: `Lost dispute ${d.code}` })
    await trx('disputes').where({ id: d.id }).update({ status: 'DECIDED', decision: body.decision, refund_amount: refundTotal, decision_note: body.note, decided_by: req.user.id, decided_at: now() })
    await notify([d.opened_by, b.partner_id], { type: 'DISPUTE_DECIDED', title: `Dispute ${d.code} decided`, body: `${body.note}${refundTotal ? ` Refund: ${fmt(refundTotal)}.` : ''}`, email: true }, trx)
    await audit({ ...auditFrom(req), action: `DISPUTE_${body.decision}`, targetType: 'DISPUTE', targetId: d.code, amount: refundTotal, details: { note: body.note } }, trx)
  })
  res.json({ ok: true })
})

// ---------- Held money and revenue ----------
r.get('/held', async (_req, res) => {
  const rows = await db('payouts as p').join('trips as t', 't.id', 'p.trip_id').join('users as u', 'u.id', 'p.partner_id').whereIn('p.status', ['HELD', 'WAITING_SETTLEMENT', 'FROZEN'])
    .select('t.code', 't.title', 't.status as trip_status', 'u.full_name', 'p.amount', 'p.status')
  res.json({ held: rows })
})

r.get('/revenue', async (_req, res) => {
  const fees = await db('ledger_entries').whereIn('type', ['BOOKING_FEE', 'COMMISSION']).select(db.raw("to_char(created_at, 'YYYY-MM') as month"), 'type').sum({ total: 'amount' }).groupBy('month', 'type').orderBy('month', 'desc')
  const months = {}
  for (const f of fees) {
    months[f.month] ??= { month: f.month, bookingFees: 0, commission: 0, ads: 0 }
    if (f.type === 'BOOKING_FEE') months[f.month].bookingFees = Number(f.total)
    if (f.type === 'COMMISSION') months[f.month].commission = Number(f.total)
  }
  // Booking fees on refunded seats are kept (they cover the gateway fee); commission on cancelled bookings is not earned
  const cancelled = await db('ledger_entries as l').join('bookings as b', 'b.id', 'l.booking_id').where('l.type', 'COMMISSION').whereIn('b.status', ['CANCELLED', 'CANCELLED_BY_PARTNER']).select(db.raw("to_char(l.created_at, 'YYYY-MM') as month")).sum({ total: 'l.amount' }).groupBy('month')
  for (const c of cancelled) if (months[c.month]) months[c.month].commission = round2(months[c.month].commission - Number(c.total))
  const held = await db('payouts').whereIn('status', ['HELD', 'WAITING_SETTLEMENT', 'FROZEN', 'READY', 'APPROVED']).sum({ t: 'amount' }).first()
  res.json({ months: Object.values(months).map((m) => ({ ...m, total: round2(m.bookingFees + m.commission + m.ads) })), heldForPartners: Number(held.t ?? 0) })
})

export default r
