import { Router } from 'express'
import { z } from 'zod'
import { db } from '../db/knex.js'
import { parse, upload } from '../middleware/http.js'
import { hasStepUp, requireActive, requireAuth, requireRole } from '../middleware/auth.js'
import { bad, conflict, forbidden, needStepUp, notFound } from '../lib/errors.js'
import { encrypt, lookupHash, mask } from '../lib/crypto.js'
import { addDays, addHours, colomboDate, now } from '../lib/time.js'
import { setting, activeRateCard, vehicleRates } from '../services/settings.js'
import { saveUpload, signedUrl } from '../services/files.js'
import { adminIds, notify, pingAdmins } from '../services/notify.js'
import { haversineKm, priceBand, round2, suggestedTransportPrice } from '../services/pricing.js'
import { returnKm } from '../services/routes.js'
import { activeMembers, history, tripDays, tripNights } from '../services/trips.js'
import { fmt, partnerCancelsBooking } from '../services/money.js'
import { sendEmail } from '../services/messages.js'

const r = Router()
r.use(requireAuth, requireRole('DRIVER', 'FLEET'))

const PHOTO_ANGLES = ['FRONT', 'BACK', 'LEFT', 'RIGHT', 'FRONT_SEATS', 'BACK_SEATS', 'LUGGAGE']
const MIN_PHOTOS = 6

async function myVehicle(req, id) {
  const v = await db('vehicles').where({ id }).first()
  if (!v || v.owner_id !== req.user.id) throw notFound('This vehicle')
  return v
}

async function shapeVehicle(v) {
  const type = await db('vehicle_types').where({ id: v.type_id }).first()
  const photos = await db('vehicle_photos').where({ vehicle_id: v.id }).orderBy('id')
  const docs = await db('verifications').where({ vehicle_id: v.id, type: 'VEHICLE' }).whereNot('status', 'REPLACED').orderBy('id', 'desc').first()
  return {
    id: v.id, type: type.name_en, typeId: v.type_id, typeCode: type.code, make: v.make, model: v.model, year: v.year, plate: v.plate, seats: v.seats,
    luggage: v.luggage, ac: Boolean(v.ac), fuel: v.fuel, gearbox: v.gearbox, modes: v.modes ? (typeof v.modes === 'string' ? JSON.parse(v.modes) : v.modes) : ['WITH_DRIVER'],
    base: { name: v.base_name, lat: v.base_lat, lng: v.base_lng }, districts: v.districts ? (typeof v.districts === 'string' ? JSON.parse(v.districts) : v.districts) : [],
    insuranceExpires: v.insurance_expires, licenceExpires: v.licence_expires, emissionExpires: v.emission_expires,
    status: v.status, rejectReason: v.reject_reason, rating: v.avg_rating, reviews: v.review_count,
    photos: photos.map((p) => ({ id: p.id, angle: p.angle, url: signedUrl(p.file_key, 3600), verified: Boolean(p.verified) })),
    documents: docs ? { status: docs.status, reason: docs.reason } : null,
  }
}

// ---------- Dashboard: the next action first ----------
r.get('/dashboard', async (req, res) => {
  const requests = await db('bookings as b').join('trips as t', 't.id', 'b.trip_id').where({ 'b.partner_id': req.user.id, 'b.status': 'REQUESTED' }).where('b.expires_at', '>', now()).select('b.*', 't.title', 't.code as trip_code', 't.start_date').orderBy('b.expires_at')
  const upcoming = await db('bookings as b').join('trips as t', 't.id', 'b.trip_id').where({ 'b.partner_id': req.user.id, 'b.status': 'ACCEPTED' }).whereIn('t.status', ['BOOKING', 'PAYMENT_DUE', 'CONFIRMED', 'ONGOING']).select('b.*', 't.title', 't.code as trip_code', 't.start_date', 't.end_date', 't.status as trip_status').orderBy('t.start_date')
  const vehicles = await db('vehicles').where({ owner_id: req.user.id })
  const licence = await db('verifications').where({ user_id: req.user.id, type: 'LICENCE' }).whereNot('status', 'REPLACED').orderBy('id', 'desc').first()
  const bank = await db('bank_accounts').where({ partner_id: req.user.id }).whereNot('status', 'REPLACED').orderBy('id', 'desc').first()
  const sums = await db('payouts').where({ partner_id: req.user.id }).groupBy('status').select('status').sum({ total: 'amount' })
  const disputes = await db('disputes as d').join('bookings as b', 'b.id', 'd.booking_id').where('b.partner_id', req.user.id).where('d.status', 'OPEN').select('d.*')

  const steps = []
  if (!req.user.id_verified_at) steps.push({ text: 'Verify your NIC and selfie', link: '/verify', done: false })
  if (!licence || licence.status !== 'APPROVED') steps.push({ text: licence?.status === 'PENDING' ? 'Driving licence is being checked' : 'Add your driving licence', link: '/verify?type=LICENCE', done: false })
  if (!vehicles.some((v) => v.status === 'APPROVED')) steps.push({ text: vehicles.length ? 'Finish your vehicle and send it for review' : 'Register your vehicle', link: '/partner/vehicles', done: false })
  if (!req.user.totp_enabled) steps.push({ text: 'Turn on two-step login (needed for payouts)', link: '/settings/security', done: false })
  if (!bank || bank.status !== 'VERIFIED') steps.push({ text: bank?.status === 'PENDING' ? 'Bank account is being checked' : 'Add your bank account for payouts', link: '/partner/earnings', done: false })

  let next = null
  if (disputes.length) next = { text: `Reply to a dispute about ${disputes[0].code}`, link: '/partner/requests', urgent: true, dueAt: disputes[0].partner_due_at }
  else if (requests.length) next = { text: `Accept or decline: ${requests[0].title}`, link: '/partner/requests', urgent: true, dueAt: requests[0].expires_at }
  else if (steps.length) next = steps[0]
  res.json({
    next, steps,
    requests: requests.map((b) => ({ id: b.id, code: b.code, trip: b.title, tripCode: b.trip_code, startDate: b.start_date, amount: b.amount, expiresAt: b.expires_at })),
    upcoming: upcoming.map((b) => ({ id: b.id, code: b.code, trip: b.title, tripCode: b.trip_code, startDate: b.start_date, endDate: b.end_date, tripStatus: b.trip_status, amount: b.amount, net: b.partner_net })),
    earnings: Object.fromEntries(sums.map((s) => [s.status, Number(s.total)])),
    vehicles: vehicles.length,
  })
})

// ---------- Vehicles (section 9) ----------
const vehicleSchema = z.object({
  typeId: z.coerce.number().int(),
  make: z.string().trim().min(2).max(40),
  model: z.string().trim().min(1).max(40),
  year: z.coerce.number().int().min(1980).max(new Date().getFullYear() + 1),
  plate: z.string().trim().toUpperCase().regex(/^[A-Z]{2,3}[\s-]?\d{4}$|^\d{2,3}[\s-]?\d{4}$/, 'Enter the plate like CAB-1234 or 252-1234'),
  seats: z.coerce.number().int().min(1).max(60),
  luggage: z.string().max(60).optional(),
  ac: z.boolean().default(true),
  fuel: z.enum(['PETROL', 'DIESEL', 'HYBRID', 'ELECTRIC']).optional(),
  gearbox: z.enum(['MANUAL', 'AUTO']).optional(),
  modes: z.array(z.enum(['WITH_DRIVER', 'SELF_DRIVE'])).min(1).default(['WITH_DRIVER']),
  baseName: z.string().trim().min(2).max(120),
  baseLat: z.coerce.number().min(5.5).max(10.2),
  baseLng: z.coerce.number().min(79.3).max(82.2),
  districts: z.array(z.string().max(40)).max(25).default([]),
})

r.get('/vehicles', async (req, res) => {
  const rows = await db('vehicles').where({ owner_id: req.user.id }).orderBy('id')
  res.json({ vehicles: await Promise.all(rows.map(shapeVehicle)), types: await db('vehicle_types').where({ active: true }).orderBy('sort_order'), minPhotos: MIN_PHOTOS, angles: PHOTO_ANGLES })
})

r.post('/vehicles', requireActive, async (req, res) => {
  const b = parse(vehicleSchema, req.body)
  const type = await db('vehicle_types').where({ id: b.typeId, active: true }).first()
  if (!type) throw bad('Choose a vehicle type.')
  if (b.seats > type.max_passengers) throw bad(`A ${type.name_en.toLowerCase()} can carry at most ${type.max_passengers} passengers.`, { fields: { seats: `Max ${type.max_passengers}` } })
  const plate = b.plate.replace(/\s/g, '-')
  if (await db('vehicles').where({ plate }).first()) throw conflict('This number plate is already registered.')
  const [id] = await db('vehicles').insert({
    owner_id: req.user.id, type_id: b.typeId, make: b.make, model: b.model, year: b.year, plate, seats: b.seats, luggage: b.luggage ?? null, ac: b.ac, fuel: b.fuel ?? null, gearbox: b.gearbox ?? null,
    modes: JSON.stringify(b.modes), base_name: b.baseName, base_lat: b.baseLat, base_lng: b.baseLng, districts: JSON.stringify(b.districts), status: 'DRAFT',
  })
  res.status(201).json({ vehicle: await shapeVehicle(await db('vehicles').where({ id }).first()) })
})

r.put('/vehicles/:id', requireActive, async (req, res) => {
  const v = await myVehicle(req, req.params.id)
  const b = parse(vehicleSchema.partial(), req.body)
  const changes = {}
  for (const [k, col] of Object.entries({ make: 'make', model: 'model', year: 'year', seats: 'seats', luggage: 'luggage', ac: 'ac', fuel: 'fuel', gearbox: 'gearbox', baseName: 'base_name', baseLat: 'base_lat', baseLng: 'base_lng' })) if (b[k] !== undefined) changes[col] = b[k]
  if (b.modes) changes.modes = JSON.stringify(b.modes)
  if (b.districts) changes.districts = JSON.stringify(b.districts)
  // Changing what travellers rely on sends an approved vehicle back for review
  if (v.status === 'APPROVED' && ['make', 'model', 'year', 'seats'].some((k) => changes[k] !== undefined && String(changes[k]) !== String(v[k]))) changes.status = 'PENDING'
  await db('vehicles').where({ id: v.id }).update({ ...changes, updated_at: now() })
  res.json({ vehicle: await shapeVehicle(await db('vehicles').where({ id: v.id }).first()) })
})

r.post('/vehicles/:id/photos', requireActive, upload.array('photos', 8), async (req, res) => {
  const v = await myVehicle(req, req.params.id)
  const angles = [].concat(req.body.angles ?? [])
  if (!req.files?.length) throw bad('Choose at least one photo.')
  for (const [i, f] of req.files.entries()) {
    const saved = await saveUpload(f, { kind: 'image', folder: `vehicles/${v.id}` })
    const angle = PHOTO_ANGLES.includes(angles[i]) ? angles[i] : 'OTHER'
    await db('vehicle_photos').insert({ vehicle_id: v.id, file_key: saved.key, angle })
  }
  // New photos are checked by the admin before they appear (section 5)
  if (v.status === 'APPROVED') await db('vehicles').where({ id: v.id }).update({ photos_verified_at: null })
  res.json({ vehicle: await shapeVehicle(await db('vehicles').where({ id: v.id }).first()) })
})

r.delete('/vehicles/:id/photos/:photoId', async (req, res) => {
  const v = await myVehicle(req, req.params.id)
  await db('vehicle_photos').where({ id: req.params.photoId, vehicle_id: v.id }).del()
  res.json({ ok: true })
})

// Revenue licence, insurance (covering paying passengers) and emission certificate, then send for review
r.post('/vehicles/:id/submit', requireActive, upload.fields([{ name: 'revenueLicence', maxCount: 1 }, { name: 'insurance', maxCount: 1 }, { name: 'emission', maxCount: 1 }]), async (req, res) => {
  const v = await myVehicle(req, req.params.id)
  const body = parse(z.object({
    licenceExpires: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Revenue licence expiry'),
    insuranceExpires: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Insurance expiry'),
    emissionExpires: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
    insuranceCoversPassengers: z.enum(['true', 'false']).transform((x) => x === 'true'),
  }), req.body)
  const files = req.files ?? {}
  for (const f of ['revenueLicence', 'insurance']) if (!files[f]?.[0]) throw bad(`Add the ${f === 'insurance' ? 'insurance certificate' : 'revenue licence'}.`)
  if (!body.insuranceCoversPassengers) throw bad('The insurance must cover paying passengers (hire use).')
  const today = colomboDate()
  if (body.licenceExpires <= today || body.insuranceExpires <= today) throw bad('The revenue licence and insurance must be valid.')
  const photos = await db('vehicle_photos').where({ vehicle_id: v.id }).count({ n: '*' }).first()
  if (Number(photos.n) < MIN_PHOTOS) throw bad(`Add at least ${MIN_PHOTOS} photos: front, back, both sides, front and back seats.`)
  const keys = {}
  for (const f of ['revenueLicence', 'insurance', 'emission']) if (files[f]?.[0]) keys[f] = (await saveUpload(files[f][0], { kind: 'document', folder: `vehicles/${v.id}/docs` })).key
  await db.transaction(async (trx) => {
    await trx('verifications').where({ vehicle_id: v.id, type: 'VEHICLE' }).whereIn('status', ['PENDING', 'REJECTED', 'RESUBMIT']).update({ status: 'REPLACED' })
    await trx('verifications').insert({
      user_id: req.user.id, type: 'VEHICLE', vehicle_id: v.id, file_keys: JSON.stringify(keys), expires_on: body.insuranceExpires,
      details: JSON.stringify({ plate: v.plate, licenceExpires: body.licenceExpires, insuranceExpires: body.insuranceExpires, emissionExpires: body.emissionExpires ?? null, checks: [{ name: 'Insurance covers paying passengers', ok: body.insuranceCoversPassengers }] }),
      due_at: addHours(now(), await setting('accounts.verification_hours')),
    })
    await trx('vehicles').where({ id: v.id }).update({ status: 'PENDING', licence_expires: body.licenceExpires, insurance_expires: body.insuranceExpires, emission_expires: body.emissionExpires ?? null })
  })
  await notify(await adminIds(), { type: 'VEHICLE_REVIEW', title: `Vehicle to check: ${v.plate}`, link: '/admin/verifications' })
  pingAdmins('verifications')
  res.json({ status: 'PENDING' })
})

// Calendar: block days the vehicle isn't available (booked days are added automatically)
r.get('/availability', async (req, res) => {
  const ids = (await db('vehicles').where({ owner_id: req.user.id }).select('id')).map((v) => v.id)
  const rows = await db('availability').where({ owner_type: 'VEHICLE' }).whereIn('owner_id', ids.length ? ids : [0]).where('date', '>=', colomboDate())
  res.json({ days: rows.map((d) => ({ vehicleId: d.owner_id, date: d.date, status: d.status })) })
})

r.put('/availability', async (req, res) => {
  const body = parse(z.object({ vehicleId: z.coerce.number().int(), dates: z.array(z.string().regex(/^\d{4}-\d{2}-\d{2}$/)).max(120), blocked: z.boolean() }), req.body)
  const v = await myVehicle(req, body.vehicleId)
  for (const date of body.dates) {
    if (body.blocked) await db('availability').insert({ owner_type: 'VEHICLE', owner_id: v.id, date, status: 'BLOCKED' }).onConflict(['owner_type', 'owner_id', 'date']).ignore()
    else await db('availability').where({ owner_type: 'VEHICLE', owner_id: v.id, date, status: 'BLOCKED' }).del()
  }
  res.json({ ok: true })
})

// ---------- Requests and bookings ----------
r.get('/requests', async (req, res) => {
  const rows = await db('bookings as b').join('trips as t', 't.id', 'b.trip_id').leftJoin('vehicles as v', 'v.id', 'b.vehicle_id')
    .where('b.partner_id', req.user.id).whereNotIn('b.status', ['EXPIRED']).orderBy('b.id', 'desc').limit(100)
    .select('b.*', 't.code as trip_code', 't.title', 't.start_date', 't.end_date', 't.status as trip_status', 't.total_km', 'v.make', 'v.model', 'v.plate')
  const out = []
  for (const b of rows) {
    const stops = await db('trip_stops').where({ trip_id: b.trip_id }).orderBy('position')
    const members = await activeMembers(b.trip_id)
    const confirmed = ['CONFIRMED', 'ONGOING', 'COMPLETED', 'CLOSED'].includes(b.trip_status)
    const dispute = await db('disputes').where({ booking_id: b.id }).orderBy('id', 'desc').first()
    out.push({
      id: b.id, code: b.code, status: b.status, amount: b.amount, net: b.partner_net, commission: b.commission, expiresAt: b.expires_at,
      trip: { code: b.trip_code, title: b.title, startDate: b.start_date, endDate: b.end_date, status: b.trip_status, km: b.total_km, route: stops.map((s) => ({ name: s.name, nights: s.nights })) },
      vehicle: b.vehicle_id ? `${b.make} ${b.model} (${b.plate})` : null,
      group: members.length,
      // Names and phone numbers only after Confirmed
      organiser: confirmed ? (() => { const o = members.find((m) => m.role === 'ORGANISER'); return o ? { name: o.full_name, phone: o.phone } : null })() : null,
      guests: confirmed ? members.map((m) => m.full_name) : null,
      breakdown: b.price_breakdown_json ? (typeof b.price_breakdown_json === 'string' ? JSON.parse(b.price_breakdown_json) : b.price_breakdown_json) : null,
      dispute: dispute ? { id: dispute.id, code: dispute.code, status: dispute.status, reason: dispute.reason, dueAt: dispute.partner_due_at, response: dispute.partner_response } : null,
    })
  }
  res.json({ bookings: out })
})

async function myBooking(req, trx = db) {
  const b = await trx('bookings').where({ id: req.params.id }).forUpdate().first()
  if (!b || b.partner_id !== req.user.id) throw notFound('This booking')
  return b
}

r.post('/bookings/:id/accept', requireActive, async (req, res) => {
  await db.transaction(async (trx) => {
    const b = await myBooking(req, trx)
    if (b.status !== 'REQUESTED') throw conflict('This request has already been answered.')
    if (new Date(b.expires_at) < now()) throw conflict('This request has expired.')
    const trip = await trx('trips').where({ id: b.trip_id }).first()
    const clash = await trx('bookings as x').join('trips as t', 't.id', 'x.trip_id').where('x.vehicle_id', b.vehicle_id).where('x.status', 'ACCEPTED').whereNot('x.id', b.id)
      .where('t.start_date', '<=', trip.end_date).where('t.end_date', '>=', trip.start_date).first()
    if (clash) throw conflict('This vehicle is already booked on these dates.')
    await trx('bookings').where({ id: b.id }).update({ status: 'ACCEPTED', accepted_at: now() })
    await history(trip.id, req.user.id, 'BOOKING_ACCEPTED', `${req.user.full_name.split(' ')[0]} accepted the transport request`, null, trx)
    await notify(trip.organiser_id, { type: 'BOOKING_ACCEPTED', title: `Transport accepted for ${trip.title}`, body: 'When every partner has answered, ask the group to pay.', link: `/trips/${trip.code}#booking`, email: true }, trx)
  })
  res.json({ status: 'ACCEPTED' })
})

r.post('/bookings/:id/decline', async (req, res) => {
  const { reason } = parse(z.object({ reason: z.string().max(300).default('') }), req.body)
  await db.transaction(async (trx) => {
    const b = await myBooking(req, trx)
    if (b.status !== 'REQUESTED') throw conflict('This request has already been answered.')
    await trx('bookings').where({ id: b.id }).update({ status: 'DECLINED', cancel_reason: reason })
    const trip = await trx('trips').where({ id: b.trip_id }).first()
    await notify(trip.organiser_id, { type: 'BOOKING_DECLINED', title: `A driver declined ${trip.title}`, body: 'Choose another one from the list.', link: `/trips/${trip.code}#booking`, email: true }, trx)
  })
  res.json({ status: 'DECLINED' })
})

// After the group has started paying, a partner cancelling refunds the group and counts as a strike
r.post('/bookings/:id/cancel', async (req, res) => {
  const { reason } = parse(z.object({ reason: z.string().trim().min(5, 'Tell the group why').max(500) }), req.body)
  await db.transaction(async (trx) => {
    const b = await myBooking(req, trx)
    if (b.status !== 'ACCEPTED') throw conflict('Only accepted bookings can be cancelled.')
    const trip = await trx('trips').where({ id: b.trip_id }).first()
    if (['ONGOING', 'COMPLETED', 'CLOSED'].includes(trip.status)) throw conflict('The trip has started. Contact support.')
    if (trip.status === 'BOOKING') {
      await trx('bookings').where({ id: b.id }).update({ status: 'CANCELLED_BY_PARTNER', cancelled_at: now(), cancel_reason: reason })
      await notify(trip.organiser_id, { type: 'PARTNER_CANCELLED', title: 'A driver withdrew', body: reason, link: `/trips/${trip.code}#booking`, email: true }, trx)
      return
    }
    await partnerCancelsBooking(b, reason, trx)
  })
  res.json({ status: 'CANCELLED_BY_PARTNER' })
})

// ---------- Offers: drivers in the area send a price to Open and Booking trips ----------
r.get('/trips-nearby', async (req, res) => {
  const vehicles = await db('vehicles').where({ owner_id: req.user.id, status: 'APPROVED' })
  if (!vehicles.length) return res.json({ trips: [] })
  const radius = await setting('partners.driver_radius_km')
  const trips = await db('trips').whereIn('status', ['OPEN', 'FULL', 'BOOKING']).where('start_date', '>', colomboDate()).where('hidden', false).orderBy('start_date').limit(200)
  const card = await activeRateCard('VEHICLE')
  const rates = await vehicleRates(card.id)
  const { min, max } = { min: await setting('rates.band_min_pct'), max: await setting('rates.band_max_pct') }
  const out = []
  for (const t of trips) {
    const stops = await db('trip_stops').where({ trip_id: t.id }).orderBy('position')
    if (!stops.length) continue
    const members = await activeMembers(t.id)
    const fits = vehicles.filter((v) => v.seats >= Math.max(members.length, 2) && haversineKm({ lat: Number(stops[0].lat), lng: Number(stops[0].lng) }, { lat: Number(v.base_lat), lng: Number(v.base_lng) }) <= radius)
    if (!fits.length) continue
    const days = tripDays(stops)
    const options = []
    for (const v of fits) {
      const rate = rates.find((x) => x.vehicle_type_id === v.type_id)
      if (!rate) continue
      const back = await returnKm(stops.at(-1), { lat: v.base_lat, lng: v.base_lng })
      const price = suggestedTransportPrice({ km: Number(t.total_km), days, nights: tripNights(stops), flexible: Boolean(t.flexible), returnKm: back, rates: rate })
      const offered = await db('driver_offers').where({ trip_id: t.id, vehicle_id: v.id, status: 'OPEN' }).first()
      options.push({ vehicleId: v.id, vehicle: `${v.make} ${v.model}`, suggested: price.total, band: priceBand(price.total, min, max), offered: offered ? { id: offered.id, price: offered.price, validUntil: offered.valid_until } : null })
    }
    out.push({ code: t.code, title: t.title, status: t.status, startDate: t.start_date, endDate: t.end_date, km: t.total_km, group: members.length, seats: t.seats, flexible: Boolean(t.flexible), route: stops.map((s) => s.name), options })
  }
  res.json({ trips: out })
})

r.post('/offers', requireActive, async (req, res) => {
  const body = parse(z.object({ tripCode: z.string(), vehicleId: z.coerce.number().int(), price: z.coerce.number().positive(), note: z.string().max(500).default('') }), req.body)
  const v = await myVehicle(req, body.vehicleId)
  if (v.status !== 'APPROVED') throw conflict('This vehicle is not approved yet.')
  const trip = await db('trips').where({ code: body.tripCode.toUpperCase() }).first()
  if (!trip || !['OPEN', 'FULL', 'BOOKING'].includes(trip.status)) throw conflict('This trip is not taking offers.')
  const stops = await db('trip_stops').where({ trip_id: trip.id }).orderBy('position')
  const card = await activeRateCard('VEHICLE')
  const rate = (await vehicleRates(card.id)).find((x) => x.vehicle_type_id === v.type_id)
  const back = await returnKm(stops.at(-1), { lat: v.base_lat, lng: v.base_lng })
  const suggested = suggestedTransportPrice({ km: Number(trip.total_km), days: tripDays(stops), nights: tripNights(stops), flexible: Boolean(trip.flexible), returnKm: back, rates: rate })
  const band = priceBand(suggested.total, await setting('rates.band_min_pct'), await setting('rates.band_max_pct'))
  if (body.price < band.min || body.price > band.max) throw bad(`Your price must be between ${fmt(band.min)} and ${fmt(band.max)} for this route.`, { fields: { price: `${band.min}–${band.max}` } })
  const hours = await setting('partners.offer_valid_hours')
  await db('driver_offers').where({ trip_id: trip.id, vehicle_id: v.id, status: 'OPEN' }).update({ status: 'WITHDRAWN' })
  const [id] = await db('driver_offers').insert({
    trip_id: trip.id, vehicle_id: v.id, driver_id: req.user.id, price: round2(body.price), pricing: trip.flexible ? 'DAILY' : 'FIXED', note: body.note,
    valid_until: addHours(now(), hours), rate_card_id: card.id, price_breakdown_json: JSON.stringify({ lines: [...suggested.lines, { label: 'Suggested price', amount: suggested.total, bold: true }, { label: "Driver's offer", amount: round2(body.price), bold: true }] }),
  })
  await notify(trip.organiser_id, { type: 'DRIVER_OFFER', title: `New driver offer for ${trip.title}: ${fmt(body.price)}`, body: `Valid for ${hours} hours.`, link: `/trips/${trip.code}#booking`, email: true }, db)
  res.status(201).json({ id, validUntil: addHours(now(), hours) })
})

r.post('/offers/:id/withdraw', async (req, res) => {
  const o = await db('driver_offers').where({ id: req.params.id, driver_id: req.user.id }).first()
  if (!o || o.status !== 'OPEN') throw conflict('This offer is not open.')
  await db('driver_offers').where({ id: o.id }).update({ status: 'WITHDRAWN' })
  res.json({ ok: true })
})

// ---------- Disputes: the partner replies within 24 hours ----------
r.post('/disputes/:id/respond', upload.array('evidence', 5), async (req, res) => {
  const { response } = parse(z.object({ response: z.string().trim().min(5).max(1000) }), req.body)
  const d = await db('disputes as d').join('bookings as b', 'b.id', 'd.booking_id').where('d.id', req.params.id).where('b.partner_id', req.user.id).select('d.*').first()
  if (!d || d.status !== 'OPEN') throw conflict('This dispute is not waiting for you.')
  const keys = []
  for (const f of req.files ?? []) keys.push((await saveUpload(f, { kind: 'document', folder: `disputes/${d.id}` })).key)
  await db('disputes').where({ id: d.id }).update({ partner_response: response, partner_evidence_keys: JSON.stringify(keys), responded_at: now(), status: 'RESPONDED' })
  await notify(await adminIds(), { type: 'DISPUTE_RESPONSE', title: `Partner replied to ${d.code}`, link: '/admin/disputes' })
  pingAdmins('disputes')
  res.json({ ok: true })
})

// ---------- Bank account and payouts (section 14) ----------
r.get('/bank-accounts', async (req, res) => {
  const rows = await db('bank_accounts').where({ partner_id: req.user.id }).whereNot('status', 'REPLACED').orderBy('id', 'desc')
  res.json({ accounts: rows.map((a) => ({ id: a.id, bank: a.bank, branch: a.branch, account: mask(a.account_last4, 4).padStart(10, '•'), holder: a.holder_name, status: a.status, reason: a.reason, payoutsHoldUntil: a.payouts_hold_until })) })
})

// Needs two-step login and a fresh password + code confirmation; a change pauses payouts for 48 hours
r.post('/bank-accounts', upload.single('proof'), async (req, res) => {
  if (!req.user.totp_enabled) throw forbidden('Turn on two-step login first (Settings → Security).')
  if (!hasStepUp(req)) throw needStepUp()
  const body = parse(z.object({
    bank: z.string().trim().min(3).max(80), branch: z.string().trim().min(2).max(80),
    accountNumber: z.string().trim().regex(/^\d{6,20}$/, 'Account number: digits only'), holderName: z.string().trim().min(3).max(120),
  }), req.body)
  const proof = await saveUpload(req.file, { kind: 'document', folder: `bank/${req.user.id}` })
  const hash = lookupHash(`BANK:${body.bank}:${body.accountNumber}`)
  // The same bank account on two partners is flagged (section 23)
  const other = await db('bank_accounts').where({ account_hash: hash }).whereNot({ partner_id: req.user.id }).whereNot('status', 'REPLACED').first()
  const previous = await db('bank_accounts').where({ partner_id: req.user.id }).whereIn('status', ['PENDING', 'VERIFIED']).first()
  const holdHours = await setting('money.bank_change_hold_hours')
  const id = await db.transaction(async (trx) => {
    await trx('bank_accounts').where({ partner_id: req.user.id }).whereIn('status', ['PENDING', 'VERIFIED', 'REJECTED']).update({ status: 'REPLACED' })
    const [aid] = await trx('bank_accounts').insert({
      partner_id: req.user.id, bank: body.bank, branch: body.branch, account_no_enc: encrypt(body.accountNumber), account_last4: body.accountNumber.slice(-4), account_hash: hash,
      holder_name: body.holderName, proof_key: proof.key, status: 'PENDING', payouts_hold_until: previous ? addHours(now(), holdHours) : null,
    })
    await trx('verifications').insert({
      user_id: req.user.id, type: 'BANK', file_keys: JSON.stringify({ proof: proof.key }), number_enc: encrypt(body.accountNumber),
      details: JSON.stringify({ bankAccountId: aid, bank: body.bank, branch: body.branch, holderName: body.holderName, verifiedName: req.user.full_name, checks: [{ name: 'Holder name matches the verified ID name', ok: body.holderName.toLowerCase() === req.user.full_name.toLowerCase(), note: `ID name: ${req.user.full_name}` }, { name: 'Not used by another partner', ok: !other }] }),
      due_at: addHours(now(), await setting('accounts.verification_hours')),
    })
    return aid
  })
  await sendEmail(req.user.email, 'Your payout bank account was changed', `A bank account ending ${body.accountNumber.slice(-4)} was added to your Yaluwo account.${previous ? ` Payouts are paused for ${holdHours} hours for your safety.` : ''}\n\nIf this wasn't you, contact Yaluwo support straight away.`)
  await notify(await adminIds(), { type: 'BANK_REVIEW', title: `Bank account to check${other ? ' (used by another partner!)' : ''}`, link: '/admin/verifications' })
  pingAdmins('verifications')
  res.status(201).json({ id, status: 'PENDING' })
})

r.get('/payouts', async (req, res) => {
  const rows = await db('payouts as p').leftJoin('trips as t', 't.id', 'p.trip_id').leftJoin('bookings as b', 'b.id', 'p.booking_id').where('p.partner_id', req.user.id)
    .select('p.*', 't.title', 't.code as trip_code', 'b.code as booking_code').orderBy('p.id', 'desc')
  res.json({
    payouts: rows.map((p) => ({ id: p.id, kind: p.kind, trip: p.title, tripCode: p.trip_code, booking: p.booking_code, gross: p.gross, commission: p.commission, amount: p.amount, status: p.status, readyAt: p.ready_at, bankRef: p.bank_ref, paidAt: p.paid_at, failure: p.failure_reason })),
  })
})

export default r
