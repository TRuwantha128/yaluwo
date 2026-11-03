import { parse as parseCsv } from 'csv-parse/sync'
import { db } from '../db/knex.js'
import { sha256 } from '../lib/crypto.js'
import { bad, conflict } from '../lib/errors.js'
import { addWorkingDays, colomboDate, now } from '../lib/time.js'
import { setting } from './settings.js'
import { notify } from './notify.js'
import { createRefund, fmt, markPaid } from './money.js'
import { round2 } from './pricing.js'
import { audit } from './audit.js'

// Bank statement import (CSV). Columns are found by name, so most bank exports work:
// date, description / narration / details, amount / credit, reference / ref / cheque no.
const pick = (row, names) => {
  for (const key of Object.keys(row)) if (names.some((n) => key.toLowerCase().replace(/[^a-z]/g, '').includes(n))) return row[key]
  return undefined
}

function toDate(v) {
  const s = String(v ?? '').trim()
  let m = s.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})/)
  if (m) return `${m[1]}-${m[2].padStart(2, '0')}-${m[3].padStart(2, '0')}`
  m = s.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{4})/)
  if (m) return `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`
  return null
}

export async function importStatement(buffer, filename, adminId, trx = db) {
  let rows
  try {
    rows = parseCsv(buffer, { columns: true, skip_empty_lines: true, trim: true, bom: true })
  } catch {
    throw bad('This file could not be read as CSV.')
  }
  if (!rows.length) throw bad('The file has no lines.')
  const [importId] = await trx('bank_statement_imports').insert({ uploaded_by: adminId, filename, line_count: rows.length })
  let added = 0
  let duplicates = 0
  for (const row of rows) {
    const date = toDate(pick(row, ['date', 'valuedate', 'txndate']))
    const amount = Number(String(pick(row, ['credit', 'amount', 'deposit']) ?? '').replace(/[, ]/g, ''))
    const description = String(pick(row, ['description', 'narration', 'details', 'particulars', 'remarks']) ?? '').slice(0, 250)
    const bankRef = String(pick(row, ['reference', 'ref', 'chequeno', 'transactionid']) ?? '').slice(0, 60) || null
    if (!date || !(amount > 0)) continue
    const lineHash = sha256(`${date}|${amount.toFixed(2)}|${description}|${bankRef ?? ''}`)
    const exists = await trx('bank_statement_lines').where({ line_hash: lineHash }).first()
    if (exists) {
      duplicates++
      continue
    }
    await trx('bank_statement_lines').insert({ import_id: importId, date, amount, description, bank_ref: bankRef, line_hash: lineHash })
    added++
  }
  // Try to match every slip still waiting
  const waiting = await trx('payment_proofs').where({ status: 'UNDER_REVIEW' }).whereNull('statement_line_id')
  let matched = 0
  for (const p of waiting) if (await autoMatchSlip(p.id, trx)) matched++
  await audit({ actorId: adminId, action: 'BANK_STATEMENT_IMPORTED', targetType: 'IMPORT', targetId: importId, details: { added, duplicates, matched } }, trx)
  return { importId, added, duplicates, matched }
}

// A line matches when it carries the slip's reference (YLW-2611-0042-M3) and is not used yet
export async function autoMatchSlip(proofId, trx = db) {
  const proof = await trx('payment_proofs').where({ id: proofId }).first()
  if (!proof || proof.statement_line_id) return false
  const ref = proof.reference.toUpperCase()
  const candidates = await trx('bank_statement_lines').whereNull('matched_payment_id').where((w) => w.where('description', 'like', `%${ref}%`).orWhere('bank_ref', 'like', `%${ref}%`))
  const byRef = candidates.find((l) => {
    const text = `${l.description} ${l.bank_ref ?? ''}`.toUpperCase()
    // "...-M1" must not match "...-M12"
    return new RegExp(`${ref.replace(/[-]/g, '\\-')}(?!\\d)`).test(text)
  })
  const line = byRef ?? (proof.bank_ref ? (await trx('bank_statement_lines').whereNull('matched_payment_id').where({ bank_ref: proof.bank_ref })).at(0) : null)
  if (!line) return false
  await trx('payment_proofs').where({ id: proof.id }).update({ statement_line_id: line.id })
  await trx('bank_statement_lines').where({ id: line.id }).update({ matched_payment_id: proof.payment_id, matched_at: now() })
  return true
}

export async function approveSlip(proofId, adminId, trx = db) {
  const proof = await trx('payment_proofs').where({ id: proofId }).forUpdate().first()
  if (!proof || proof.status !== 'UNDER_REVIEW') throw conflict('This slip has already been decided.')
  if (!proof.statement_line_id) throw conflict('No matching money in the bank statement yet. A slip counts only when the money is seen in the bank.')
  const line = await trx('bank_statement_lines').where({ id: proof.statement_line_id }).first()
  const payment = await trx('payments').where({ id: proof.payment_id }).first()
  const received = Number(line.amount)
  const expected = Number(payment.amount)
  if (received < expected) throw conflict(`The bank shows ${fmt(received)} but ${fmt(expected)} is due. Use "Ask for balance".`)
  await trx('payment_proofs').where({ id: proof.id }).update({ status: 'APPROVED', reviewed_by: adminId, reviewed_at: now() })
  await markPaid(payment.id, { method: 'BANK_TRANSFER', settledOn: line.date, paidAmount: expected }, trx)
  if (received > expected) {
    // More was paid: the extra is refunded (as its own small payment record)
    const [extraId] = await trx('payments').insert({ order_id: `${payment.order_id}-X`, user_id: payment.user_id, trip_id: payment.trip_id, member_id: null, channel: 'BANK_TRANSFER', purpose: payment.purpose, amount: round2(received - expected), status: 'PAID', paid_at: now(), settled_on: line.date, reference: payment.reference })
    const extra = await trx('payments').where({ id: extraId }).first()
    await createRefund({ payment: extra, amount: Number(extra.amount), reason: 'You paid more than the amount due', approvedBy: adminId }, trx)
  }
  await audit({ actorId: adminId, action: 'SLIP_APPROVED', targetType: 'PAYMENT', targetId: payment.id, amount: expected }, trx)
}

export async function rejectSlip(proofId, adminId, reason, trx = db) {
  const proof = await trx('payment_proofs').where({ id: proofId }).forUpdate().first()
  if (!proof || proof.status !== 'UNDER_REVIEW') throw conflict('This slip has already been decided.')
  await trx('payment_proofs').where({ id: proof.id }).update({ status: 'REJECTED', reviewed_by: adminId, reviewed_at: now(), reason })
  if (proof.statement_line_id) await trx('bank_statement_lines').where({ id: proof.statement_line_id }).update({ matched_payment_id: null, matched_at: null })
  const payment = await trx('payments').where({ id: proof.payment_id }).first()
  await trx('payments').where({ id: payment.id }).update({ status: 'REJECTED' })
  await notify(payment.user_id, { type: 'SLIP_REJECTED', title: 'Your bank slip was not accepted', body: `${reason} You can upload it again or pay by card.`, link: '/me/payments', email: true }, trx)
  if (adminId) await audit({ actorId: adminId, action: 'SLIP_REJECTED', targetType: 'PAYMENT', targetId: payment.id, details: { reason } }, trx)
}

// Less was paid: the received money counts, and the member is asked for the rest
export async function askBalance(proofId, adminId, trx = db) {
  const proof = await trx('payment_proofs').where({ id: proofId }).forUpdate().first()
  if (!proof?.statement_line_id) throw conflict('Match the slip to a bank line first.')
  const line = await trx('bank_statement_lines').where({ id: proof.statement_line_id }).first()
  const payment = await trx('payments').where({ id: proof.payment_id }).first()
  const balance = round2(Number(payment.amount) - Number(line.amount))
  if (balance <= 0) throw conflict('Nothing is missing: approve the slip instead.')
  await trx('payment_proofs').where({ id: proof.id }).update({ status: 'BALANCE_DUE', reviewed_by: adminId, reviewed_at: now(), balance_due: balance })
  await markPaid(payment.id, { method: 'BANK_TRANSFER', settledOn: line.date, paidAmount: Number(line.amount) }, trx)
  await notify(payment.user_id, { type: 'BALANCE_DUE', title: `Please pay the balance: ${fmt(balance)}`, body: `We received ${fmt(line.amount)} of ${fmt(payment.amount)}.`, link: '/me/trips', email: true }, trx)
  await audit({ actorId: adminId, action: 'SLIP_BALANCE_ASKED', targetType: 'PAYMENT', targetId: payment.id, amount: balance }, trx)
}

// Scheduler: slips with no money after 3 working days are rejected
export async function expireOldSlips(trx = db) {
  const days = await setting('money.slip_reject_working_days')
  const waiting = await trx('payment_proofs').where({ status: 'UNDER_REVIEW' }).whereNull('statement_line_id')
  let n = 0
  for (const p of waiting) {
    const created = new Date(p.created_at)
    const ymd = new Date(created.getTime() + 330 * 60000).toISOString().slice(0, 10)
    if (addWorkingDays(ymd, days) <= colomboDate()) {
      await rejectSlip(p.id, null, `No money reached Yaluwo's bank within ${days} working days.`, trx)
      n++
    }
  }
  return n
}
