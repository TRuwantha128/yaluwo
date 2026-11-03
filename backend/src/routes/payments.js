import { Router } from 'express'
import express from 'express'
import { z } from 'zod'
import PDFDocument from 'pdfkit'
import { db } from '../db/knex.js'
import { env } from '../config/env.js'
import { parse, upload } from '../middleware/http.js'
import { requireAuth } from '../middleware/auth.js'
import { bad, conflict, forbidden, notFound } from '../lib/errors.js'
import { safeEqual } from '../lib/crypto.js'
import { colomboDate, now } from '../lib/time.js'
import { saveUpload } from '../services/files.js'
import { notify, adminIds, pingAdmins } from '../services/notify.js'
import { markPaid, payhereNotifySig, fmt } from '../services/money.js'
import { audit } from '../services/audit.js'
import { autoMatchSlip } from '../services/slips.js'

const r = Router()

// ---------- PayHere server-to-server notice (section 13) ----------
// Counted only if the md5sig checks out and status is 2. Safe to receive twice.
export async function handlePayhereNotice(body) {
  const required = ['merchant_id', 'order_id', 'payhere_amount', 'payhere_currency', 'status_code', 'md5sig']
  for (const k of required) if (body[k] == null) throw bad(`Missing ${k}`)
  const expected = payhereNotifySig(body)
  if (!safeEqual(expected, String(body.md5sig).toUpperCase()) || body.merchant_id !== env.payhere.merchantId) {
    await audit({ action: 'PAYHERE_BAD_SIGNATURE', targetType: 'PAYMENT', targetId: body.order_id, details: { order: body.order_id } })
    throw forbidden('Bad signature')
  }
  const payment = await db('payments').where({ order_id: body.order_id }).first()
  if (!payment) throw notFound('This order')
  const status = Number(body.status_code)
  // Amounts are always recalculated on our side: the notice must match what we asked for
  if (Number(body.payhere_amount).toFixed(2) !== Number(payment.amount).toFixed(2) || body.payhere_currency !== payment.currency) {
    await audit({ action: 'PAYHERE_AMOUNT_MISMATCH', targetType: 'PAYMENT', targetId: payment.id, details: { got: body.payhere_amount } })
    throw bad('Amount mismatch')
  }
  if (status === 2) {
    return db.transaction((trx) => markPaid(payment.id, { method: body.method ?? null, payhereId: body.payment_id ?? null, statusCode: 2, raw: body }, trx))
  }
  if (status === -3) {
    // Chargeback: the admin is alerted and disputes it with evidence (section 14)
    await db.transaction(async (trx) => {
      await trx('payments').where({ id: payment.id }).update({ status: 'CHARGEBACK', status_code: -3 })
      await trx('chargebacks').insert({ payment_id: payment.id, amount: payment.amount, received_on: colomboDate() })
      await notify(await adminIds(trx), { type: 'CHARGEBACK', title: `Chargeback on ${payment.order_id}: ${fmt(payment.amount)}`, link: '/admin/payments?tab=chargebacks', email: true }, trx)
    })
    pingAdmins('chargebacks')
    return { chargeback: true }
  }
  if (payment.status === 'PENDING') await db('payments').where({ id: payment.id }).update({ status: status === -1 ? 'CANCELLED' : 'FAILED', status_code: status })
  return { status }
}

r.post('/webhooks/payhere', express.urlencoded({ extended: false }), async (req, res) => {
  await handlePayhereNotice(req.body)
  res.send('OK')
})

// Test mode only (PAYHERE_MODE=simulate): stands in for the PayHere page and sends a correctly
// signed notice to the webhook, so the whole flow can be tried without a merchant account.
r.post('/payments/:orderId/simulate', requireAuth, async (req, res) => {
  if (env.payhere.mode !== 'simulate') throw forbidden('Test payments are switched off.')
  const { outcome } = parse(z.object({ outcome: z.enum(['SUCCESS', 'FAIL', 'CANCEL']) }), req.body)
  const payment = await db('payments').where({ order_id: req.params.orderId }).first()
  if (!payment || payment.user_id !== req.user.id) throw notFound('This order')
  const status_code = { SUCCESS: '2', FAIL: '-2', CANCEL: '-1' }[outcome]
  const notice = { merchant_id: env.payhere.merchantId, order_id: payment.order_id, payment_id: `SIM${Date.now()}`, payhere_amount: Number(payment.amount).toFixed(2), payhere_currency: payment.currency, status_code, method: 'TEST', status_message: 'Simulated' }
  notice.md5sig = payhereNotifySig(notice)
  const out = await handlePayhereNotice(notice)
  res.json({ ok: true, outcome, result: out?.payment?.status ?? out })
})

r.get('/payments/:orderId', requireAuth, async (req, res) => {
  const p = await db('payments').where({ order_id: req.params.orderId }).first()
  if (!p || (p.user_id !== req.user.id && !req.user.isAdmin)) throw notFound('This payment')
  const trip = p.trip_id ? await db('trips').where({ id: p.trip_id }).first() : null
  res.json({ payment: { id: p.id, orderId: p.order_id, amount: p.amount, status: p.status, channel: p.channel, purpose: p.purpose, reference: p.reference, tripCode: trip?.code, tripTitle: trip?.title } })
})

// ---------- Bank slip (section 13): counted only when the money is seen in the bank statement ----------
r.post('/payments/:id/proof', requireAuth, upload.single('slip'), async (req, res) => {
  const body = parse(z.object({
    amount: z.coerce.number().positive('Enter the amount on the slip'),
    paidOn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Enter the date on the slip'),
    bank: z.string().trim().min(2, 'Which bank?').max(60),
    bankRef: z.string().trim().max(60).optional(),
  }), req.body)
  const payment = await db('payments').where({ id: req.params.id }).first()
  if (!payment || payment.user_id !== req.user.id) throw notFound('This payment')
  if (payment.channel !== 'BANK_TRANSFER') throw conflict('This payment is not a bank transfer.')
  if (!['PENDING', 'REJECTED'].includes(payment.status)) throw conflict('A slip has already been sent for this payment.')
  if (body.paidOn > colomboDate()) throw bad('The slip date is in the future.')
  const file = await saveUpload(req.file, { kind: 'document', folder: `slips/${req.user.id}` })
  // Fake-slip protection: the same image or bank reference can't be used twice
  if (await db('payment_proofs').where({ file_hash: file.hash }).first()) throw conflict('This slip has already been used.')
  if (body.bankRef && (await db('payment_proofs').where({ bank_ref: body.bankRef }).whereNot({ status: 'REJECTED' }).first())) throw conflict('This bank reference has already been used.')
  const id = await db.transaction(async (trx) => {
    const [pid] = await trx('payment_proofs').insert({ payment_id: payment.id, reference: payment.reference, file_key: file.key, file_hash: file.hash, amount_entered: body.amount, paid_on: body.paidOn, bank: body.bank, bank_ref: body.bankRef ?? null })
    await trx('payments').where({ id: payment.id }).update({ status: 'UNDER_REVIEW' })
    await autoMatchSlip(pid, trx)
    return pid
  })
  await notify(await adminIds(), { type: 'SLIP', title: `Bank slip to check: ${payment.reference}`, link: '/admin/payments?tab=slips' })
  pingAdmins('slips')
  res.status(201).json({ id, status: 'UNDER_REVIEW', message: 'Your seat is held while we find the money in our bank statement (usually 1 working day).' })
})

// ---------- Receipts (PDF) ----------
r.get('/payments/:id/receipt.pdf', requireAuth, async (req, res) => {
  const p = await db('payments').where({ id: req.params.id }).first()
  if (!p || (p.user_id !== req.user.id && !req.user.isAdmin)) throw notFound('This receipt')
  const invoice = await db('invoices').where({ payment_id: p.id, type: 'RECEIPT' }).first()
  if (!invoice) throw notFound('This receipt')
  const user = await db('users').where({ id: p.user_id }).first()
  const trip = p.trip_id ? await db('trips').where({ id: p.trip_id }).first() : null
  res.setHeader('Content-Type', 'application/pdf')
  res.setHeader('Content-Disposition', `inline; filename="yaluwo-${invoice.number}.pdf"`)
  const doc = new PDFDocument({ size: 'A4', margin: 56 })
  doc.pipe(res)
  doc.fontSize(22).text('yaluwo', { continued: false }).moveDown(0.3)
  doc.fontSize(10).fillColor('#5b6676').text('Group travel across Sri Lanka').moveDown(1.5)
  doc.fillColor('#0e1726').fontSize(16).text(`Receipt ${invoice.number}`).moveDown(0.5)
  doc.fontSize(11)
  const rows = [
    ['Date', new Date(p.paid_at).toLocaleString('en-GB', { timeZone: 'Asia/Colombo' })],
    ['Paid by', user.full_name],
    ['For', p.purpose === 'DEPOSIT' ? `Listing deposit, trip ${trip?.code}` : `${trip?.title} (${trip?.code})`],
    ['Order', p.order_id],
    ['Method', p.channel === 'PAYHERE' ? `PayHere${p.method ? ` (${p.method})` : ''}` : 'Bank transfer'],
    ['Share of services', fmt(p.share_part)],
    ['Booking fee', fmt(p.fee_part)],
    ['Total paid', fmt(p.amount)],
  ]
  for (const [k, v] of rows) doc.text(`${k}:  ${v}`).moveDown(0.2)
  doc.moveDown(1).fontSize(9).fillColor('#5b6676').text('Yaluwo holds your payment until the trip ends and then pays the partners. Refunds follow the cancellation policy shown before you paid.')
  if (p.refunded_amount > 0) doc.moveDown(0.5).text(`Refunded so far: ${fmt(p.refunded_amount)}`)
  doc.end()
})

export default r
