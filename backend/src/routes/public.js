import { Router } from 'express'
import fs from 'node:fs'
import { db } from '../db/knex.js'
import { env } from '../config/env.js'
import { notFound, forbidden } from '../lib/errors.js'
import { allSettings, activeRateCard, vehicleRates, lookups } from '../services/settings.js'
import { checkSignature, filePath } from '../services/files.js'

const r = Router()

// Active settings, rate card and lists for the website (no secrets, no bank details)
r.get('/config', async (_req, res) => {
  const map = await allSettings()
  const values = {}
  for (const [key, s] of map) if (s.group !== 'money_safety') values[key] = s.value
  const card = await activeRateCard('VEHICLE')
  const rates = card ? await vehicleRates(card.id) : []
  const lists = {}
  for (const list of ['TRIP_TAG', 'LANGUAGE', 'REPORT_REASON', 'CANCEL_REASON', 'VEHICLE_PHOTO_ANGLE', 'BANK']) lists[list] = await lookups(list)
  const pages = await db('content_pages').whereNotNull('published_at').where({ language: 'en' }).select('slug', 'title', 'version', 'must_accept').orderBy('version', 'desc')
  const latest = {}
  for (const p of pages) latest[p.slug] ??= p
  res.json({
    settings: values,
    rateCard: card && {
      id: card.id,
      version: card.version,
      vehicles: rates.filter((x) => x.active).map((x) => ({
        typeId: x.vehicle_type_id, code: x.code, name: x.name_en, maxPassengers: x.max_passengers,
        ratePerKm: x.rate_per_km, dayMinimum: x.day_minimum, dailyRate: x.daily_rate, dailyKm: x.daily_km,
        driverAllowance: x.driver_allowance, emptyReturnPct: x.empty_return_pct,
      })),
    },
    lists,
    legal: Object.values(latest),
    payments: { mode: env.payhere.mode },
    routes: { google: Boolean(env.googleServerKey) },
    signup: { emailCode: true, phoneCode: env.canSms || env.demoCodes || env.isTest, demoCodes: env.demoCodes },
    environment: env.isProd ? 'live' : env.isTest ? 'test' : 'local',
  })
})

r.get('/legal/:slug', async (req, res) => {
  const page = await db('content_pages').where({ slug: req.params.slug, language: 'en' }).whereNotNull('published_at').orderBy('version', 'desc').first()
  if (!page) throw notFound('This page')
  res.json({ slug: page.slug, title: page.title, version: page.version, body: page.body, publishedAt: page.published_at })
})

// Private files through signed links that expire after 5 minutes
r.get(/^\/files\/(.+)$/, async (req, res) => {
  const key = req.params[0]
  if (!checkSignature(key, req.query.exp, req.query.sig)) throw forbidden('This link has expired.')
  const full = filePath(key)
  if (!fs.existsSync(full)) throw notFound('This file')
  res.set('Cache-Control', 'private, max-age=300')
  res.set('X-Content-Type-Options', 'nosniff')
  res.sendFile(full)
})

r.get('/health', async (_req, res) => {
  await db.raw('select 1')
  res.json({ ok: true })
})

export default r
