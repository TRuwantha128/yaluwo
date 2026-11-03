import { Router } from 'express'
import { z } from 'zod'
import { db } from '../../db/knex.js'
import { parse } from '../../middleware/http.js'
import { hasStepUp, requirePermission } from '../../middleware/auth.js'
import { bad, conflict, forbidden, needStepUp, notFound } from '../../lib/errors.js'
import { addDays, colomboDate, colomboMidnight, now } from '../../lib/time.js'
import { allSettings, clearSettingsCache, setting } from '../../services/settings.js'
import { audit, auditFrom } from '../../services/audit.js'
import { notify } from '../../services/notify.js'
import { jsonOf } from '../../lib/json.js'

const r = Router()

// Groups that need a step-up confirmation, and how much notice partners get (section 24)
const STEP_UP_GROUPS = ['fees', 'rates', 'money_safety', 'quality']
const NOTICE = { fees: 'settings.notice_fees_days', rates: 'settings.notice_rates_days' }

// ---------- Settings ----------
r.get('/settings', requirePermission('OWNER'), async (_req, res) => {
  const active = await allSettings()
  const scheduled = await db('settings').where('effective_from', '>', now()).orderBy('effective_from')
  res.json({
    settings: [...active.values()].map((s) => ({ key: s.key, group: s.group, label: s.label, value: s.value, unit: s.unit, min: s.min, max: s.max, version: s.version, effectiveFrom: s.effective_from, needsStepUp: STEP_UP_GROUPS.includes(s.group), noticeDays: null })),
    scheduled: scheduled.map((s) => ({ key: s.key, label: s.label, value: jsonOf(s.value), version: s.version, effectiveFrom: s.effective_from })),
    notice: { fees: await setting(NOTICE.fees), rates: await setting(NOTICE.rates) },
  })
})

r.get('/settings/:key/history', requirePermission('OWNER'), async (req, res) => {
  const rows = await db('settings as s').leftJoin('users as u', 'u.id', 's.created_by').where('s.key', req.params.key).select('s.*', 'u.full_name').orderBy('s.version', 'desc')
  res.json({ history: rows.map((s) => ({ version: s.version, value: jsonOf(s.value), effectiveFrom: s.effective_from, by: s.full_name ?? 'Setup', at: s.created_at })) })
})

// A change is a new version, never an edit. Undo = schedule the previous value again.
r.put('/settings/:key', requirePermission('OWNER'), async (req, res) => {
  const body = parse(z.object({ value: z.any(), effectiveFrom: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional() }), req.body)
  const current = (await allSettings()).get(req.params.key)
  if (!current) throw notFound('This setting')
  if (STEP_UP_GROUPS.includes(current.group) && !hasStepUp(req)) throw needStepUp()
  let value = body.value
  if (typeof current.value === 'number') {
    value = Number(value)
    if (!Number.isFinite(value)) throw bad('Enter a number.')
    if (current.min != null && value < Number(current.min)) throw bad(`The lowest allowed value is ${current.min}.`)
    if (current.max != null && value > Number(current.max)) throw bad(`The highest allowed value is ${current.max}.`)
  }
  if (Array.isArray(current.value) && !Array.isArray(value)) throw bad('Enter a list of values.')
  // Fee changes give partners 30 days' notice (rate cards 7); other settings can start at once
  const noticeKey = NOTICE[current.group]
  const minDays = noticeKey ? await setting(noticeKey) : 0
  const earliest = addDays(colomboDate(), minDays)
  const start = body.effectiveFrom ?? earliest
  if (start < earliest) throw bad(`This change needs ${minDays} days' notice: the earliest start is ${earliest}.`)
  const effective = start === colomboDate() ? now() : colomboMidnight(start)
  const last = await db('settings').where({ key: current.key }).max({ v: 'version' }).first()
  await db('settings').insert({
    key: current.key, group: current.group, label: current.label, unit: current.unit, min: current.min, max: current.max,
    value: JSON.stringify(value), effective_from: effective, version: Number(last.v) + 1, created_by: req.user.id, approved_by: req.user.id,
  })
  clearSettingsCache()
  await audit({ ...auditFrom(req), action: 'SETTING_CHANGED', targetType: 'SETTING', targetId: current.key, details: { from: current.value, to: value, effectiveFrom: start, stepUp: hasStepUp(req) } })
  if (current.group === 'fees') {
    const partners = await db('user_roles').whereIn('role', ['DRIVER', 'FLEET', 'SUPPLIER', 'GUIDE', 'ACTIVITY']).distinct('user_id')
    await notify(partners.map((p) => p.user_id), { type: 'FEE_CHANGE', title: `${current.label} changes on ${start}`, body: `From ${current.value}${current.unit ?? ''} to ${value}${current.unit ?? ''}. Existing bookings keep their price.`, email: true })
  }
  res.json({ ok: true, effectiveFrom: start })
})

// ---------- Rate cards (versioned: Draft → Approved → Scheduled → Active → Retired) ----------
async function cardWithRates(card) {
  const rates = await db('vehicle_rates as r').join('vehicle_types as t', 't.id', 'r.vehicle_type_id').where('r.rate_card_id', card.id).select('r.*', 't.name_en', 't.code').orderBy('t.sort_order')
  return { id: card.id, version: card.version, status: card.status, effectiveFrom: card.effective_from, notes: card.notes, seasonRules: jsonOf(card.season_rules_json, []), rates }
}

r.get('/rate-cards', requirePermission('OWNER'), async (_req, res) => {
  const cards = await db('rate_cards').where({ kind: 'VEHICLE' }).orderBy('version', 'desc')
  res.json({ cards: await Promise.all(cards.map(cardWithRates)) })
})

const rateRow = z.object({
  vehicleTypeId: z.coerce.number().int(), ratePerKm: z.coerce.number().positive(), dayMinimum: z.coerce.number().positive(), dailyRate: z.coerce.number().positive(), dailyKm: z.coerce.number().int().positive(),
  selfdriveDaily: z.coerce.number().nullable().optional(), selfdriveKm: z.coerce.number().int().nullable().optional(), deposit: z.coerce.number().nullable().optional(), driverAllowance: z.coerce.number().min(0), emptyReturnPct: z.coerce.number().min(0).max(100),
})

// New draft, copied from the active card with the changes
r.post('/rate-cards', requirePermission('OWNER'), async (req, res) => {
  const body = parse(z.object({ rates: z.array(rateRow).min(1), notes: z.string().max(500).optional(), seasonRules: z.array(z.object({ from: z.string(), to: z.string(), pct: z.number(), label: z.string() })).default([]) }), req.body)
  const id = await db.transaction(async (trx) => {
    const last = await trx('rate_cards').where({ kind: 'VEHICLE' }).max({ v: 'version' }).first()
    const [cid] = await trx('rate_cards').insert({ kind: 'VEHICLE', version: Number(last.v) + 1, status: 'DRAFT', notes: body.notes ?? null, season_rules_json: JSON.stringify(body.seasonRules), created_by: req.user.id })
    for (const x of body.rates) {
      await trx('vehicle_rates').insert({
        rate_card_id: cid, vehicle_type_id: x.vehicleTypeId, rate_per_km: x.ratePerKm, day_minimum: x.dayMinimum, daily_rate: x.dailyRate, daily_km: x.dailyKm,
        selfdrive_daily: x.selfdriveDaily ?? null, selfdrive_km: x.selfdriveKm ?? null, deposit: x.deposit ?? null, driver_allowance: x.driverAllowance, empty_return_pct: x.emptyReturnPct,
      })
    }
    await audit({ ...auditFrom(req), action: 'RATE_CARD_DRAFTED', targetType: 'RATE_CARD', targetId: cid }, trx)
    return cid
  })
  res.status(201).json({ id })
})

// Old and new values, the change in %, and how many partners and open trips are affected
r.get('/rate-cards/:id/impact', requirePermission('OWNER'), async (req, res) => {
  const card = await db('rate_cards').where({ id: req.params.id }).first()
  if (!card) throw notFound('This rate card')
  const active = await db('rate_cards').where({ kind: 'VEHICLE', status: 'ACTIVE' }).orderBy('version', 'desc').first()
  const next = await cardWithRates(card)
  const prev = active ? await cardWithRates(active) : null
  const changes = next.rates.map((x) => {
    const old = prev?.rates.find((y) => y.vehicle_type_id === x.vehicle_type_id)
    const pct = (a, b) => (b ? Math.round(((a - b) / b) * 1000) / 10 : null)
    return { type: x.name_en, ratePerKm: { from: old?.rate_per_km, to: x.rate_per_km, pct: pct(x.rate_per_km, old?.rate_per_km) }, dayMinimum: { from: old?.day_minimum, to: x.day_minimum, pct: pct(x.day_minimum, old?.day_minimum) }, dailyRate: { from: old?.daily_rate, to: x.daily_rate, pct: pct(x.daily_rate, old?.daily_rate) } }
  })
  const partners = await db('vehicles').where({ status: 'APPROVED' }).countDistinct({ n: 'owner_id' }).first()
  const openTrips = await db('trips').whereIn('status', ['OPEN', 'FULL', 'BOOKING']).count({ n: '*' }).first()
  res.json({ changes, partnersAffected: Number(partners.n), openTrips: Number(openTrips.n), note: 'Existing bookings and open offers keep their price.' })
})

r.post('/rate-cards/:id/approve', requirePermission('OWNER'), async (req, res) => {
  if (!hasStepUp(req)) throw needStepUp()
  const card = await db('rate_cards').where({ id: req.params.id }).first()
  if (!card || card.status !== 'DRAFT') throw conflict('Only a draft can be approved.')
  // Once staff exist, a second person approves and nobody approves their own work
  const staff = await db('user_roles').where({ role: 'STAFF' }).first()
  if (staff && card.created_by === req.user.id) throw forbidden('Another person must approve your own change.')
  await db('rate_cards').where({ id: card.id }).update({ status: 'APPROVED', approved_by: req.user.id, approved_at: now() })
  await audit({ ...auditFrom(req), action: 'RATE_CARD_APPROVED', targetType: 'RATE_CARD', targetId: card.id })
  res.json({ ok: true })
})

r.post('/rate-cards/:id/schedule', requirePermission('OWNER'), async (req, res) => {
  const { startDate } = parse(z.object({ startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/) }), req.body)
  const card = await db('rate_cards').where({ id: req.params.id }).first()
  if (!card || card.status !== 'APPROVED') throw conflict('Approve the rate card first.')
  const minDays = await setting('settings.notice_rates_days')
  const earliest = addDays(colomboDate(), minDays)
  if (startDate < earliest) throw bad(`Rate cards need ${minDays} days' notice: the earliest start is ${earliest}.`)
  await db('rate_cards').where({ id: card.id }).update({ status: 'SCHEDULED', effective_from: colomboMidnight(startDate) })
  const partners = await db('vehicles').where({ status: 'APPROVED' }).distinct('owner_id')
  await notify(partners.map((p) => p.owner_id), { type: 'RATE_CARD_CHANGE', title: `New rate card from ${startDate}`, body: 'Suggested prices change for new requests and offers. Existing bookings keep their price.', link: '/partner', email: true })
  await audit({ ...auditFrom(req), action: 'RATE_CARD_SCHEDULED', targetType: 'RATE_CARD', targetId: card.id, details: { startDate } })
  res.json({ ok: true })
})

// ---------- Lists (admin-editable; entries are switched off, never deleted) ----------
r.get('/lookups', requirePermission('OWNER', 'MARKETING'), async (_req, res) => {
  res.json({ lookups: await db('lookup_values').orderBy(['list', 'sort_order']), vehicleTypes: await db('vehicle_types').orderBy('sort_order') })
})

r.post('/lookups', requirePermission('OWNER', 'MARKETING'), async (req, res) => {
  const body = parse(z.object({ list: z.string().min(2).max(30), label: z.string().min(1).max(120), labelSi: z.string().max(120).optional(), labelTa: z.string().max(120).optional() }), req.body)
  const code = body.label.toUpperCase().replace(/[^A-Z0-9]+/g, '_').replace(/^_|_$/g, '')
  const max = await db('lookup_values').where({ list: body.list }).max({ m: 'sort_order' }).first()
  await db('lookup_values').insert({ list: body.list, code, label_en: body.label, label_si: body.labelSi ?? null, label_ta: body.labelTa ?? null, sort_order: Number(max.m ?? 0) + 1 })
  await audit({ ...auditFrom(req), action: 'LOOKUP_ADDED', targetType: 'LOOKUP', targetId: `${body.list}:${code}` })
  res.status(201).json({ ok: true })
})

r.put('/lookups/:id', requirePermission('OWNER', 'MARKETING'), async (req, res) => {
  const body = parse(z.object({ active: z.boolean().optional(), label: z.string().max(120).optional(), sortOrder: z.number().int().optional() }), req.body)
  await db('lookup_values').where({ id: req.params.id }).update({ ...(body.active !== undefined && { active: body.active }), ...(body.label && { label_en: body.label }), ...(body.sortOrder !== undefined && { sort_order: body.sortOrder }) })
  await audit({ ...auditFrom(req), action: 'LOOKUP_CHANGED', targetType: 'LOOKUP', targetId: req.params.id, details: body })
  res.json({ ok: true })
})

r.post('/vehicle-types', requirePermission('OWNER'), async (req, res) => {
  const body = parse(z.object({ name: z.string().min(2).max(60), maxPassengers: z.coerce.number().int().min(1).max(60), licenceClass: z.string().max(20).optional() }), req.body)
  const code = body.name.toUpperCase().replace(/[^A-Z0-9]+/g, '_')
  const max = await db('vehicle_types').max({ m: 'sort_order' }).first()
  const [id] = await db('vehicle_types').insert({ code, name_en: body.name, max_passengers: body.maxPassengers, licence_class: body.licenceClass ?? null, sort_order: Number(max.m ?? 0) + 1 })
  await audit({ ...auditFrom(req), action: 'VEHICLE_TYPE_ADDED', targetType: 'VEHICLE_TYPE', targetId: id })
  res.status(201).json({ id, note: 'Add rates for this type in a new rate card before drivers can be priced.' })
})

r.put('/vehicle-types/:id', requirePermission('OWNER'), async (req, res) => {
  const body = parse(z.object({ active: z.boolean().optional(), maxPassengers: z.coerce.number().int().optional() }), req.body)
  await db('vehicle_types').where({ id: req.params.id }).update({ ...(body.active !== undefined && { active: body.active }), ...(body.maxPassengers && { max_passengers: body.maxPassengers }) })
  await audit({ ...auditFrom(req), action: 'VEHICLE_TYPE_CHANGED', targetType: 'VEHICLE_TYPE', targetId: req.params.id, details: body })
  res.json({ ok: true })
})

// ---------- Legal pages: a new version must be accepted again at the next login ----------
r.get('/legal', requirePermission('OWNER'), async (_req, res) => {
  res.json({ pages: await db('content_pages').orderBy([{ column: 'slug' }, { column: 'version', order: 'desc' }]) })
})

r.post('/legal/:slug', requirePermission('OWNER'), async (req, res) => {
  const body = parse(z.object({ title: z.string().min(3).max(200), body: z.string().min(20), mustAccept: z.boolean().default(true) }), req.body)
  const last = await db('content_pages').where({ slug: req.params.slug, language: 'en' }).max({ v: 'version' }).first()
  const version = Number(last.v ?? 0) + 1
  await db('content_pages').insert({ slug: req.params.slug, language: 'en', title: body.title, body: body.body, version, must_accept: body.mustAccept, published_at: now() })
  await audit({ ...auditFrom(req), action: 'LEGAL_PAGE_PUBLISHED', targetType: 'PAGE', targetId: `${req.params.slug}@${version}` })
  res.json({ version })
})

export default r
