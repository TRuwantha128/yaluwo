import { db } from '../db/knex.js'
import { now } from '../lib/time.js'

// One cached place to read every business value (workflow section 24: nothing hard-coded).
// A setting can have several versions; the active one is the newest version whose
// effective_from has passed.
let cache = null
let cachedAt = 0
const TTL = 30 * 1000

async function load() {
  const rows = await db('settings').where('effective_from', '<=', now()).orderBy([{ column: 'key' }, { column: 'version', order: 'desc' }])
  const map = new Map()
  for (const r of rows) {
    if (map.has(r.key)) continue
    if (r.effective_to && new Date(r.effective_to) <= now()) continue
    map.set(r.key, { ...r, value: JSON.parse(r.value) })
  }
  cache = map
  cachedAt = Date.now()
  return map
}

export async function allSettings() {
  if (!cache || Date.now() - cachedAt > TTL) await load()
  return cache
}

export async function setting(key) {
  const map = await allSettings()
  if (!map.has(key)) throw new Error(`Setting ${key} is missing`)
  return map.get(key).value
}

// Several at once: const { a, b } = await settings({ a: 'fees.booking_fee_pct', b: '...' })
export async function settings(keys) {
  const map = await allSettings()
  const out = {}
  for (const [name, key] of Object.entries(keys)) {
    if (!map.has(key)) throw new Error(`Setting ${key} is missing`)
    out[name] = map.get(key).value
  }
  return out
}

export const clearSettingsCache = () => {
  cache = null
}

// The rate card in force now (or at a given time)
export async function activeRateCard(kind = 'VEHICLE', at = now(), trx = db) {
  return trx('rate_cards').where({ kind }).whereIn('status', ['ACTIVE']).where('effective_from', '<=', at).orderBy('version', 'desc').first()
}

export async function vehicleRates(rateCardId, trx = db) {
  return trx('vehicle_rates as r')
    .join('vehicle_types as t', 't.id', 'r.vehicle_type_id')
    .where('r.rate_card_id', rateCardId)
    .select('r.*', 't.code', 't.name_en', 't.max_passengers', 't.active', 't.sort_order')
    .orderBy('t.sort_order')
}

export async function lookups(list) {
  return db('lookup_values').where({ list, active: true }).orderBy('sort_order').select('code', 'label_en', 'label_si', 'label_ta')
}
