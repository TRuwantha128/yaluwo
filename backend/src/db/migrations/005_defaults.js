import { DEFAULT_SETTINGS, LEGAL_PAGES, LOOKUPS, RATE_DEFAULTS, VEHICLE_TYPES } from '../defaults.js'

// Loads the starting settings, vehicle types, first rate card, lists and legal page drafts.
// These are configuration, not sample accounts: the live database gets them too.
export async function up(knex) {
  const now = new Date()
  await knex('settings').insert(
    DEFAULT_SETTINGS.map(([key, group, value, unit, label, min, max]) => ({
      key, group, value: JSON.stringify(value), unit, label, min, max, effective_from: now, version: 1,
    })),
  )

  for (const [i, [code, name, max, licence, selfdrive]] of VEHICLE_TYPES.entries()) {
    await knex('vehicle_types').insert({ code, name_en: name, max_passengers: max, licence_class: licence, selfdrive_allowed: selfdrive, sort_order: i })
  }
  const [cardId] = await knex('rate_cards').insert({ kind: 'VEHICLE', version: 1, status: 'ACTIVE', effective_from: now, notes: 'Starting rate card (workflow section 9 example amounts)' })
  const types = await knex('vehicle_types').select('id', 'code')
  for (const [code, , , , , perKm, dayMin, daily, sdDay, sdDeposit] of VEHICLE_TYPES) {
    await knex('vehicle_rates').insert({
      rate_card_id: cardId,
      vehicle_type_id: types.find((t) => t.code === code).id,
      rate_per_km: perKm,
      day_minimum: dayMin,
      daily_rate: daily,
      daily_km: RATE_DEFAULTS.dailyKm,
      selfdrive_daily: sdDay,
      selfdrive_km: sdDay ? RATE_DEFAULTS.selfdriveKm : null,
      deposit: sdDeposit,
      driver_allowance: RATE_DEFAULTS.driverAllowance,
      empty_return_pct: RATE_DEFAULTS.emptyReturnPct,
    })
  }

  for (const [list, labels] of Object.entries(LOOKUPS)) {
    await knex('lookup_values').insert(labels.map((label, i) => ({ list, code: label.toUpperCase().replace(/[^A-Z0-9]+/g, '_').replace(/^_|_$/g, ''), label_en: label, sort_order: i })))
  }

  for (const [slug, title, mustAccept] of LEGAL_PAGES) {
    await knex('content_pages').insert({
      slug, title, version: 1, must_accept: mustAccept, published_at: now,
      body: `# ${title}\n\nDraft. A lawyer must review this page before Yaluwo takes real payments (workflow section 25).\n\nThe owner admin can publish a new version from the admin console. Users are asked to accept the new version at their next login.`,
    })
  }
}

export async function down(knex) {
  for (const t of ['content_pages', 'lookup_values', 'vehicle_rates', 'rate_cards', 'vehicle_types', 'settings']) await knex(t).del()
}
