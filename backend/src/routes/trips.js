import { Router } from 'express'
import { z } from 'zod'
import { db } from '../db/knex.js'
import { parse, upload } from '../middleware/http.js'
import { optionalAuth, requireActive, requireAuth, requireVerified } from '../middleware/auth.js'
import { bad, conflict, forbidden, notFound } from '../lib/errors.js'
import { maskContacts } from '../lib/mask.js'
import { addDays, addHours, colomboDate, colomboMidnight, daysBetween, now } from '../lib/time.js'
import { setting, settings, activeRateCard, vehicleRates } from '../services/settings.js'
import { computeLegs, returnKm } from '../services/routes.js'
import { haversineKm, memberShares, round2, suggestedTransportPrice, commissionOf } from '../services/pricing.js'
import { saveUpload, signedUrl } from '../services/files.js'
import { notify, adminIds, pingAdmins } from '../services/notify.js'
import { addParticipant, createThread, removeParticipant, systemMessage, tripThread } from '../services/chat.js'
import {
  ACTIVE_STATUSES, activeMembers, checkStartDate, history, memberBalance, newCode, newTripCode, notifyMembers, paymentDeadline,
  recalculateShares, setStatus, tripByCode, tripDays, tripNights,
} from '../services/trips.js'
import {
  bankDetails, cancelTrip, createDepositPayment, createSharePayment, fmt, maybeConfirm, memberCancellationTerms, payhereCheckout, refundMember,
} from '../services/money.js'

const r = Router()

const stopSchema = z.object({
  name: z.string().trim().min(2).max(120),
  lat: z.coerce.number().min(5.5).max(10.2, 'Stops must be in Sri Lanka'),
  lng: z.coerce.number().min(79.3).max(82.2, 'Stops must be in Sri Lanka'),
  nights: z.coerce.number().int().min(0).max(30).default(0),
  placeId: z.string().max(255).nullable().optional(),
  placeRef: z.string().max(60).nullable().optional(),
})

const tripSchema = z.object({
  title: z.string().trim().min(3, 'Give your trip a name').max(70),
  description: z.string().max(1000).optional().default(''),
  startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Choose a start date').nullable().optional(),
  seats: z.coerce.number().int(),
  genderRule: z.enum(['MIXED', 'WOMEN', 'MEN']).default('MIXED'),
  flexible: z.boolean().default(false),
  childrenWelcome: z.boolean().default(false),
  tags: z.array(z.string().max(30)).max(8).default([]),
  vehiclePref: z.string().max(40).nullable().optional(),
  stops: z.array(stopSchema).min(1, 'Add at least one stop').max(20),
})

// ---------- Route preview: km, time and price estimates ----------
r.post('/routes/compute', async (req, res) => {
  const body = parse(z.object({ stops: z.array(stopSchema).min(1).max(20), seats: z.coerce.number().int().min(1).max(60).default(4), flexible: z.boolean().default(false) }), req.body)
  const route = await computeLegs(body.stops)
  res.json({ ...route, prices: await priceOptions({ stops: body.stops, km: route.totalKm, seats: body.seats, flexible: body.flexible }), warnings: await drivingWarnings(route.legs, body.stops) })
})

async function drivingWarnings(legs) {
  const { leg, day } = await settings({ leg: 'driving.leg_warn_hours', day: 'driving.day_warn_hours' })
  const out = []
  for (const l of legs) {
    if (l.minutes > day * 60) out.push({ leg: l.position, text: `More than ${day} hours of driving in one day. Please add a stop.` })
    else if (l.minutes > leg * 60) out.push({ leg: l.position, text: `Long day (over ${leg} hours). Add a stop?` })
  }
  return out
}

// Suggested transport price for every vehicle type that fits the group
async function priceOptions({ stops, km, seats, flexible }) {
  const card = await activeRateCard('VEHICLE')
  if (!card) return []
  const rates = await vehicleRates(card.id)
  const days = tripDays(stops)
  const nights = tripNights(stops)
  const feePct = await setting('fees.booking_fee_pct')
  return rates
    .filter((x) => x.active && x.max_passengers >= seats)
    .map((x) => {
      const price = suggestedTransportPrice({ km, days, nights, flexible, rates: x })
      const perPerson = round2(price.total / seats)
      return { type: x.code, name: x.name_en, maxPassengers: x.max_passengers, total: price.total, perPerson, perPersonWithFee: round2(perPerson * (1 + feePct / 100)), lines: price.lines }
    })
}

// ---------- Trip Board ----------
r.get('/trips', optionalAuth, async (req, res) => {
  const q = parse(z.object({
    place: z.string().max(80).optional(), month: z.string().regex(/^\d{4}-\d{2}$/).optional(), tag: z.string().max(30).optional(),
    gender: z.enum(['MIXED', 'WOMEN', 'MEN']).optional(), flexible: z.enum(['1', '0']).optional(), maxPrice: z.coerce.number().optional(),
    sort: z.enum(['soonest', 'newest', 'cheapest']).default('soonest'), women: z.enum(['1']).optional(),
  }), req.query)
  const query = db('trips as t').whereIn('t.status', ['OPEN', 'FULL']).where('t.hidden', false).where('t.start_date', '>=', colomboDate())
  if (q.place) query.where((w) => w.where('t.title', 'ilike', `%${q.place}%`).orWhereExists(db('trip_stops as s').whereRaw('s.trip_id = t.id').where('s.name', 'ilike', `%${q.place}%`)))
  if (q.month) query.whereRaw("to_char(t.start_date, 'YYYY-MM') = ?", [q.month])
  if (q.tag) query.whereRaw('t.tags::jsonb @> ?::jsonb', [JSON.stringify([q.tag])])
  if (q.gender) query.where('t.gender_rule', q.gender)
  if (q.women) query.where('t.gender_rule', 'WOMEN')
  if (q.flexible) query.where('t.flexible', q.flexible === '1')
  if (q.maxPrice) query.where('t.price_estimate', '<=', q.maxPrice)
  query.orderBy(q.sort === 'newest' ? [{ column: 't.published_at', order: 'desc' }] : q.sort === 'cheapest' ? [{ column: 't.price_estimate' }] : [{ column: 't.start_date' }])
  const trips = await query.select('t.*').limit(100)
  const myPrefs = req.user ? await db('preferences').where({ user_id: req.user.id }).first() : null
  res.json({ trips: await Promise.all(trips.map((t) => tripCard(t, { myPrefs, viewer: req.user }))) })
})

const QUIZ_KEYS = ['budget', 'pace', 'food', 'smoking', 'drinking', 'wake_time']
async function matchPercent(myPrefs, organiserId) {
  if (!myPrefs) return null
  const theirs = await db('preferences').where({ user_id: organiserId }).first()
  if (!theirs) return null
  const same = QUIZ_KEYS.filter((k) => myPrefs[k] && myPrefs[k] === theirs[k]).length
  return Math.round((same / QUIZ_KEYS.length) * 100)
}

async function personCard(userId) {
  const u = await db('users').where({ id: userId }).first()
  const p = await db('profiles').where({ user_id: userId }).first()
  return {
    id: u.id,
    firstName: u.full_name.split(' ')[0],
    photo: signedUrl(p?.photo_key, 3600),
    verified: Boolean(u.id_verified_at),
    rating: p?.avg_rating ?? null,
    reviews: p?.review_count ?? 0,
    tripsCompleted: p?.trips_completed ?? 0,
    badges: p?.badges ? (typeof p.badges === 'string' ? JSON.parse(p.badges) : p.badges) : [],
  }
}

async function tripCard(t, { myPrefs = null } = {}) {
  const stops = await db('trip_stops').where({ trip_id: t.id }).orderBy('position')
  const members = await activeMembers(t.id)
  return {
    code: t.code,
    id: t.code,
    title: t.title,
    status: t.status,
    startDate: t.start_date,
    endDate: t.end_date,
    seats: t.seats,
    seatsLeft: Math.max(0, t.seats - members.length),
    genderRule: t.gender_rule,
    womenOnly: t.gender_rule === 'WOMEN',
    flexible: Boolean(t.flexible),
    tags: parseJson(t.tags, []),
    vehicle: t.vehicle_pref,
    price: t.price_estimate,
    createdAt: t.created_at,
    cover: signedUrl(t.cover_key, 3600),
    stops: stops.map((s) => ({ name: s.name, lat: Number(s.lat), lng: Number(s.lng), nights: s.nights, placeId: s.google_place_id, placeRef: s.place_ref })),
    km: t.total_km,
    minutes: t.total_minutes,
    routeSource: t.route_source,
    organiser: await personCard(t.organiser_id),
    members: await Promise.all(members.map(async (m) => ({ ...(await personCard(m.user_id)), memberId: m.id, role: m.role, name: m.full_name.split(' ')[0] }))),
    match: await matchPercent(myPrefs, t.organiser_id),
  }
}
const parseJson = (v, fallback) => (v == null ? fallback : typeof v === 'string' ? JSON.parse(v) : v)

// ---------- One trip ----------
async function viewerRole(trip, user) {
  if (!user) return { role: 'VISITOR' }
  if (user.isAdmin) return { role: 'ADMIN' }
  const m = await db('trip_members').where({ trip_id: trip.id, user_id: user.id }).first()
  if (m?.role === 'ORGANISER') return { role: 'ORGANISER', member: m }
  if (m?.status === 'APPROVED') return { role: 'MEMBER', member: m }
  const partner = await db('bookings').where({ trip_id: trip.id, partner_id: user.id }).whereNotIn('status', ['DECLINED', 'EXPIRED']).first()
  if (partner) return { role: 'PARTNER', member: m, booking: partner }
  return { role: 'VISITOR', member: m }
}

r.get('/trips/:code', optionalAuth, async (req, res) => {
  const trip = await tripByCode(req.params.code)
  const v = await viewerRole(trip, req.user)
  const inside = ['ORGANISER', 'MEMBER', 'ADMIN'].includes(v.role)
  if (!['OPEN', 'FULL', 'BOOKING', 'PAYMENT_DUE', 'CONFIRMED', 'ONGOING', 'COMPLETED', 'CLOSED'].includes(trip.status) && !inside && v.role !== 'PARTNER') throw notFound('This trip')
  if (trip.hidden && !inside) throw notFound('This trip')

  const myPrefs = req.user ? await db('preferences').where({ user_id: req.user.id }).first() : null
  const card = await tripCard(trip, { myPrefs })
  const legs = await db('trip_legs').where({ trip_id: trip.id }).orderBy('position')
  const out = {
    ...card,
    description: trip.description,
    childrenWelcome: Boolean(trip.children_welcome),
    legs: legs.map((l) => ({ km: l.km, minutes: l.minutes, mode: l.mode, source: l.source, mainRoad: l.main_road })),
    paymentDueAt: trip.payment_due_at,
    rejectedReason: inside ? trip.rejected_reason : null,
    cancelReason: trip.cancel_reason,
    needsRebook: Boolean(trip.needs_rebook),
    viewer: { role: v.role, memberStatus: v.member?.status ?? null, requestExpiresAt: v.member?.status === 'REQUESTED' ? v.member.expires_at : null },
  }
  if (v.role === 'PARTNER' && v.booking) out.checkedIn = Boolean(v.booking.partner_checked_in_at)
  if (inside) {
    const thread = await tripThread(trip.id)
    out.threadId = thread?.id ?? null
    out.history = (await db('trip_history').where({ trip_id: trip.id }).orderBy('id', 'desc').limit(50)).map((h) => ({ event: h.event, text: h.text, at: h.created_at }))
    out.bookings = await bookingsFor(trip)
    if (v.member) {
      const bal = await memberBalance(v.member)
      out.myMoney = { share: v.member.share_amount, fee: v.member.fee_amount, ...bal }
      out.myPayments = (await db('payments').where({ member_id: v.member.id }).whereNot('status', 'CANCELLED').orderBy('id', 'desc')).map((p) => ({ id: p.id, orderId: p.order_id, amount: p.amount, channel: p.channel, status: p.status, reference: p.reference }))
      out.checkedIn = Boolean(v.member.checked_in_at)
    }
    if (v.role === 'ORGANISER' || v.role === 'ADMIN') {
      const reqs = await db('trip_members as m').join('users as u', 'u.id', 'm.user_id').where({ 'm.trip_id': trip.id, 'm.status': 'REQUESTED' }).select('m.*')
      out.requests = await Promise.all(reqs.map(async (m) => ({ memberId: m.id, message: m.message, expiresAt: m.expires_at, threadId: m.request_thread_id, person: await personCard(m.user_id), match: await matchPercent(await db('preferences').where({ user_id: m.user_id }).first(), trip.organiser_id) })))
      out.paymentStatus = await Promise.all((await activeMembers(trip.id)).map(async (m) => ({ name: m.full_name.split(' ')[0], ...(await memberBalance(m)) })))
      if (trip.status === 'UNDER_REVIEW' || trip.status === 'DRAFT') {
        const dep = await db('payments').where({ trip_id: trip.id, purpose: 'DEPOSIT' }).whereIn('status', ['PAID', 'UNDER_REVIEW']).first()
        out.deposit = dep ? { status: dep.status, amount: dep.amount } : null
      }
    }
  }
  if (v.role === 'VISITOR' && v.member?.status === 'REQUESTED') out.requestThreadId = v.member.request_thread_id
  res.json({ trip: out })
})

async function bookingsFor(trip) {
  const rows = await db('bookings as b').leftJoin('vehicles as v', 'v.id', 'b.vehicle_id').leftJoin('vehicle_types as vt', 'vt.id', 'v.type_id').leftJoin('users as u', 'u.id', 'b.partner_id')
    .where('b.trip_id', trip.id).select('b.*', 'v.make', 'v.model', 'v.plate', 'v.seats', 'vt.name_en as vehicle_type', 'u.full_name as partner_name', 'u.phone as partner_phone')
    .orderBy('b.id', 'desc')
  const confirmed = ['CONFIRMED', 'ONGOING', 'COMPLETED', 'CLOSED'].includes(trip.status)
  return rows.map((b) => ({
    id: b.id, code: b.code, kind: b.kind, status: b.status, amount: b.amount, expiresAt: b.expires_at,
    vehicle: b.vehicle_id ? { id: b.vehicle_id, name: `${b.make} ${b.model}`, type: b.vehicle_type, seats: b.seats, plate: confirmed ? b.plate : null } : null,
    partner: { id: b.partner_id, firstName: b.partner_name?.split(' ')[0], phone: confirmed ? b.partner_phone : null },
    breakdown: parseJson(b.price_breakdown_json, null),
    cancelReason: b.cancel_reason,
  }))
}

// ---------- Create and edit (Draft) ----------
async function validateTrip(body, user, { submitting }) {
  const { minGroup, maxGroup } = await settings({ minGroup: 'trips.min_group', maxGroup: 'trips.max_group' })
  if (body.seats < minGroup || body.seats > maxGroup) throw bad(`Group size must be ${minGroup} to ${maxGroup} people, including you.`, { fields: { seats: `${minGroup}–${maxGroup}` } })
  if (maskContacts(`${body.title} ${body.description}`).found) throw bad('Please remove phone numbers, emails, links and outside-payment requests from the title and description.', { fields: { description: 'No contact details' } })
  if (body.genderRule !== 'MIXED') {
    const need = body.genderRule === 'WOMEN' ? 'FEMALE' : 'MALE'
    if (user.gender !== need) throw bad(`Only a ${need === 'FEMALE' ? 'woman' : 'man'} can organise a ${body.genderRule === 'WOMEN' ? 'women' : 'men'}-only trip.`)
    if (submitting && !user.gender_verified && !(await db('verifications').where({ user_id: user.id, type: 'NIC', status: 'PENDING' }).first())) throw bad('Single-gender trips need your verified ID first.')
  }
  if (submitting) await checkStartDate(body.startDate)
}

async function saveRoute(trx, tripId, stops, startDate) {
  await trx('trip_stops').where({ trip_id: tripId }).del()
  await trx('trip_legs').where({ trip_id: tripId }).del()
  await trx('trip_stops').insert(stops.map((s, i) => ({ trip_id: tripId, position: i, name: s.name, lat: s.lat, lng: s.lng, nights: s.nights, google_place_id: s.placeId ?? null, place_ref: s.placeRef ?? null })))
  const route = await computeLegs(stops, { departure: startDate ? colomboMidnight(startDate).toISOString() : null })
  if (route.legs.length) await trx('trip_legs').insert(route.legs.map((l) => ({ trip_id: tripId, position: l.position, km: l.km, minutes: l.minutes, source: l.source, main_road: l.mainRoad })))
  return route
}

async function estimatePerPerson(stops, km, seats, flexible, vehiclePref) {
  const options = await priceOptions({ stops, km, seats, flexible })
  const chosen = options.find((o) => o.type === vehiclePref) ?? options[0]
  return chosen ? chosen.perPersonWithFee : null
}

r.post('/trips', requireAuth, requireActive, async (req, res) => {
  const body = parse(tripSchema, req.body)
  await validateTrip(body, req.user, { submitting: false })
  const code = await db.transaction(async (trx) => {
    const tripCode = await newTripCode(trx)
    const days = tripDays(body.stops)
    const [id] = await trx('trips').insert({
      code: tripCode, organiser_id: req.user.id, title: body.title, description: body.description, start_date: body.startDate ?? null,
      end_date: body.startDate ? addDays(body.startDate, days - 1) : null, seats: body.seats, gender_rule: body.genderRule, flexible: body.flexible,
      children_welcome: body.childrenWelcome, tags: JSON.stringify(body.tags), vehicle_pref: body.vehiclePref ?? null, status: 'DRAFT',
    })
    const route = await saveRoute(trx, id, body.stops, body.startDate)
    const estimate = await estimatePerPerson(body.stops, route.totalKm, body.seats, body.flexible, body.vehiclePref)
    await trx('trips').where({ id }).update({ total_km: route.totalKm, total_minutes: route.totalMinutes, route_source: route.source, price_estimate: estimate })
    await trx('trip_members').insert({ trip_id: id, user_id: req.user.id, role: 'ORGANISER', status: 'APPROVED', decided_at: now() })
    await createThread({ type: 'TRIP', refId: id, tripId: id, userIds: [req.user.id] }, trx)
    await history(id, req.user.id, 'CREATED', 'Trip created as a draft', null, trx)
    return tripCode
  })
  res.status(201).json({ code })
})

async function organiserOnly(req, { lock = false, trx = db } = {}) {
  const trip = await tripByCode(req.params.code, trx, { lock })
  if (trip.organiser_id !== req.user.id && !req.user.isAdmin) throw forbidden('Only the organiser can do this.')
  return trip
}

r.put('/trips/:code', requireAuth, requireActive, async (req, res) => {
  const trip = await organiserOnly(req)
  if (trip.status === 'DRAFT') {
    const body = parse(tripSchema, req.body)
    await validateTrip(body, req.user, { submitting: false })
    await db.transaction(async (trx) => {
      const days = tripDays(body.stops)
      const route = await saveRoute(trx, trip.id, body.stops, body.startDate)
      const estimate = await estimatePerPerson(body.stops, route.totalKm, body.seats, body.flexible, body.vehiclePref)
      await trx('trips').where({ id: trip.id }).update({
        title: body.title, description: body.description, start_date: body.startDate ?? null, end_date: body.startDate ? addDays(body.startDate, days - 1) : null,
        seats: body.seats, gender_rule: body.genderRule, flexible: body.flexible, children_welcome: body.childrenWelcome, tags: JSON.stringify(body.tags),
        vehicle_pref: body.vehiclePref ?? null, total_km: route.totalKm, total_minutes: route.totalMinutes, route_source: route.source, price_estimate: estimate, updated_at: now(),
      })
    })
  } else if (['OPEN', 'FULL'].includes(trip.status)) {
    // Once published, only the words can change; route and dates change through the change flow
    const body = parse(z.object({ title: z.string().trim().min(3).max(70), description: z.string().max(1000).default(''), tags: z.array(z.string()).max(8).optional() }), req.body)
    if (maskContacts(`${body.title} ${body.description}`).found) throw bad('Please remove phone numbers, emails and links.')
    await db('trips').where({ id: trip.id }).update({ title: body.title, description: body.description, ...(body.tags && { tags: JSON.stringify(body.tags) }), updated_at: now() })
    await history(trip.id, req.user.id, 'EDITED', 'The organiser edited the description')
  } else {
    throw conflict('This trip can no longer be edited.')
  }
  res.json({ ok: true })
})

r.post('/trips/:code/cover', requireAuth, upload.single('cover'), async (req, res) => {
  const trip = await organiserOnly(req)
  const f = await saveUpload(req.file, { kind: 'image', folder: 'covers' })
  await db('trips').where({ id: trip.id }).update({ cover_key: f.key })
  res.json({ cover: signedUrl(f.key, 3600) })
})

// ---------- Submit: verified organisers go live at once; others go to the admin (section 7) ----------
r.post('/trips/:code/submit', requireAuth, requireActive, async (req, res) => {
  const result = await db.transaction(async (trx) => {
    const trip = await organiserOnly(req, { lock: true, trx })
    if (trip.status !== 'DRAFT') throw conflict('Only a draft can be submitted.')
    const stops = await trx('trip_stops').where({ trip_id: trip.id }).orderBy('position')
    await validateTrip({ seats: trip.seats, title: trip.title, description: trip.description ?? '', genderRule: trip.gender_rule, startDate: trip.start_date }, req.user, { submitting: true })
    if (!stops.length) throw bad('Add at least one stop.')
    if (req.user.id_verified_at) {
      await setStatus(trip, 'OPEN', { actorId: req.user.id, trx, text: 'The trip is live on the Trip Board.', extra: { submitted_at: now(), published_at: now(), rejected_reason: null } })
      return { status: 'OPEN' }
    }
    const nic = await trx('verifications').where({ user_id: req.user.id }).whereIn('type', ['NIC', 'PASSPORT']).whereIn('status', ['PENDING', 'APPROVED']).first()
    const deposit = await trx('payments').where({ trip_id: trip.id, purpose: 'DEPOSIT' }).whereIn('status', ['PAID', 'UNDER_REVIEW']).first()
    const amount = await setting('trips.listing_deposit')
    if (!nic || (!deposit && amount > 0)) {
      return { status: 'DRAFT', needs: { verification: !nic, deposit: !deposit && amount > 0, depositAmount: amount } }
    }
    await setStatus(trip, 'UNDER_REVIEW', { actorId: req.user.id, trx, text: 'Sent to Yaluwo for a check. This takes up to 24 hours.', extra: { submitted_at: now() } })
    await notify(await adminIds(trx), { type: 'TRIP_REVIEW', title: `Trip to review: ${trip.title}`, link: `/admin/trips/${trip.code}` }, trx)
    pingAdmins('trips')
    return { status: 'UNDER_REVIEW' }
  })
  res.json(result)
})

// Listing deposit for an unverified organiser's first trip
r.post('/trips/:code/deposit', requireAuth, requireActive, async (req, res) => {
  const { channel } = parse(z.object({ channel: z.enum(['PAYHERE', 'BANK_TRANSFER']) }), req.body)
  const trip = await organiserOnly(req)
  if (!['DRAFT', 'UNDER_REVIEW'].includes(trip.status)) throw conflict('No deposit is needed now.')
  const payment = await createDepositPayment({ trip, user: req.user, channel })
  res.json(await paymentReply(payment, req.user, `Listing deposit ${trip.code}`))
})

async function paymentReply(payment, user, itemName) {
  if (payment.channel === 'PAYHERE') return { payment: { id: payment.id, orderId: payment.order_id, amount: payment.amount }, checkout: payhereCheckout(payment, user, { itemName }) }
  return { payment: { id: payment.id, orderId: payment.order_id, amount: payment.amount, reference: payment.reference }, bank: await bankDetails(payment) }
}

// ---------- Joining (section 8) ----------
async function overlapsConfirmed(userId, trip, trx = db) {
  return trx('trip_members as m').join('trips as t', 't.id', 'm.trip_id').where('m.user_id', userId).where('m.status', 'APPROVED')
    .whereIn('t.status', ['BOOKING', 'PAYMENT_DUE', 'CONFIRMED', 'ONGOING']).whereNot('t.id', trip.id)
    .where('t.start_date', '<=', trip.end_date).where('t.end_date', '>=', trip.start_date).first()
}

async function blockedBetween(a, b, trx = db) {
  return trx('blocks').where((w) => w.where({ user_id: a, blocked_user_id: b }).orWhere({ user_id: b, blocked_user_id: a })).first()
}

function genderAllowed(trip, user) {
  if (trip.gender_rule === 'MIXED') return true
  return user.gender === (trip.gender_rule === 'WOMEN' ? 'FEMALE' : 'MALE')
}

r.post('/trips/:code/join-requests', requireAuth, requireActive, async (req, res) => {
  const { message } = parse(z.object({ message: z.string().trim().min(5, 'Say a little about yourself').max(500) }), req.body)
  const result = await db.transaction(async (trx) => {
    const trip = await tripByCode(req.params.code, trx, { lock: true })
    const reopened = trip.status === 'PAYMENT_DUE' && trip.seat_open_until && new Date(trip.seat_open_until) > now()
    if (trip.status !== 'OPEN' && !reopened) throw conflict(trip.status === 'FULL' ? 'This trip is full.' : 'This trip is not taking join requests.')
    if (trip.organiser_id === req.user.id) throw conflict('You are the organiser.')
    if (!genderAllowed(trip, req.user)) throw forbidden(`This is a ${trip.gender_rule === 'WOMEN' ? 'women' : 'men'}-only trip.`)
    if (await overlapsConfirmed(req.user.id, trip, trx)) throw conflict('You are already going on another trip on these dates.')
    if (await blockedBetween(req.user.id, trip.organiser_id, trx)) throw forbidden("You can't join this trip.")
    const existing = await trx('trip_members').where({ trip_id: trip.id, user_id: req.user.id }).first()
    if (existing && ['REQUESTED', 'APPROVED'].includes(existing.status)) throw conflict('You have already asked to join.')
    if (existing?.status === 'REMOVED') throw forbidden('You were removed from this trip.')
    const hours = await setting('trips.join_request_hours')
    const threadId = await createThread({ type: 'REQUEST', tripId: trip.id, userIds: [req.user.id, trip.organiser_id] }, trx)
    const row = { trip_id: trip.id, user_id: req.user.id, role: 'MEMBER', status: 'REQUESTED', message, expires_at: addHours(now(), hours), request_thread_id: threadId, decided_at: null }
    let memberId
    if (existing) {
      await trx('trip_members').where({ id: existing.id }).update(row)
      memberId = existing.id
    } else {
      ;[memberId] = await trx('trip_members').insert(row)
    }
    await trx('chat_threads').where({ id: threadId }).update({ ref_id: memberId })
    await systemMessage(threadId, `${req.user.full_name.split(' ')[0]} asked to join: "${maskContacts(message).masked}"`, trx)
    await notify(trip.organiser_id, { type: 'JOIN_REQUEST', title: `${req.user.full_name.split(' ')[0]} wants to join ${trip.title}`, body: `Answer within ${hours} hours.`, link: `/trips/${trip.code}#requests`, email: true }, trx)
    return { memberId, threadId, verifiedNeeded: !req.user.id_verified_at }
  })
  res.status(201).json(result)
})

async function requestFor(req, trx) {
  const trip = await organiserOnly(req, { lock: true, trx })
  const member = await trx('trip_members').where({ id: req.params.memberId, trip_id: trip.id }).forUpdate().first()
  if (!member) throw notFound('This request')
  return { trip, member }
}

r.post('/trips/:code/members/:memberId/approve', requireAuth, requireActive, async (req, res) => {
  const out = await db.transaction(async (trx) => {
    const { trip, member } = await requestFor(req, trx)
    if (member.status !== 'REQUESTED') throw conflict('This request has already been answered.')
    const reopened = trip.status === 'PAYMENT_DUE' && trip.seat_open_until && new Date(trip.seat_open_until) > now()
    if (trip.status !== 'OPEN' && !reopened) throw conflict('The trip is not taking new members now.')
    const user = await trx('users').where({ id: member.user_id }).first()
    if (!user.id_verified_at) throw conflict(`${user.full_name.split(' ')[0]} is still being verified. You can accept them once their ID is approved.`)
    if (!genderAllowed(trip, user) || (trip.gender_rule !== 'MIXED' && !user.gender_verified)) throw forbidden('This person does not match the gender rule (from their verified ID).')
    const count = (await activeMembers(trip.id, trx)).length
    if (count >= trip.seats) throw conflict('The trip is full.')
    await trx('trip_members').where({ id: member.id }).update({ status: 'APPROVED', decided_at: now() })
    const thread = await tripThread(trip.id, trx)
    await addParticipant(thread.id, member.user_id, trx)
    await systemMessage(thread.id, `${user.full_name.split(' ')[0]} joined the trip.`, trx)
    await history(trip.id, req.user.id, 'MEMBER_JOINED', `${user.full_name.split(' ')[0]} joined`, null, trx)
    await notify(member.user_id, { type: 'JOIN_ACCEPTED', title: `You're in: ${trip.title}`, body: 'Say hello in the group chat.', link: `/trips/${trip.code}`, email: true }, trx)
    if (reopened) {
      // A replacement joins while payment is open: shares are split again. Members whose share
      // drops get the difference back (section 15, "Group grows").
      await trx('trips').where({ id: trip.id }).update({ seat_open_until: null })
      await rebalanceShares(trip, trx, { refundDrops: true })
    } else if (count + 1 >= trip.seats) await setStatus(trip, 'FULL', { actorId: req.user.id, trx, text: 'Every seat is taken.' })
    return { status: 'APPROVED' }
  })
  res.json(out)
})

r.post('/trips/:code/members/:memberId/reject', requireAuth, async (req, res) => {
  await db.transaction(async (trx) => {
    const { trip, member } = await requestFor(req, trx)
    if (member.status !== 'REQUESTED') throw conflict('This request has already been answered.')
    await trx('trip_members').where({ id: member.id }).update({ status: 'REJECTED', decided_at: now() })
    await notify(member.user_id, { type: 'JOIN_REJECTED', title: `Your request for ${trip.title} was not accepted`, body: 'There are other trips on the Trip Board.', link: '/trips' }, trx)
  })
  res.json({ status: 'REJECTED' })
})

// The organiser can remove a member before anyone pays; the reason is only for the admin
r.post('/trips/:code/members/:memberId/remove', requireAuth, async (req, res) => {
  const { reason } = parse(z.object({ reason: z.string().trim().min(5, 'Tell the admin why').max(500) }), req.body)
  await db.transaction(async (trx) => {
    const { trip, member } = await requestFor(req, trx)
    if (member.role === 'ORGANISER' || member.status !== 'APPROVED') throw conflict('This person is not a member.')
    if (!['OPEN', 'FULL', 'BOOKING'].includes(trip.status)) throw conflict('Members can only be removed before payment.')
    await trx('trip_members').where({ id: member.id }).update({ status: 'REMOVED', removed_reason: reason, decided_at: now() })
    const thread = await tripThread(trip.id, trx)
    await removeParticipant(thread.id, member.user_id, trx)
    await history(trip.id, req.user.id, 'MEMBER_REMOVED', 'A member was removed by the organiser', null, trx)
    await notify(member.user_id, { type: 'REMOVED', title: `You were removed from ${trip.title}`, link: '/trips' }, trx)
    if (trip.status === 'FULL') await setStatus(trip, 'OPEN', { trx, text: 'A seat is free again.' })
  })
  res.json({ status: 'REMOVED' })
})

// Leaving before payment is free and the seat reopens
r.post('/trips/:code/leave', requireAuth, async (req, res) => {
  await db.transaction(async (trx) => {
    const trip = await tripByCode(req.params.code, trx, { lock: true })
    const member = await trx('trip_members').where({ trip_id: trip.id, user_id: req.user.id }).forUpdate().first()
    if (!member || !['REQUESTED', 'APPROVED'].includes(member.status)) throw conflict('You are not in this trip.')
    if (member.role === 'ORGANISER') throw conflict('The organiser cancels the trip instead of leaving.')
    if (!['OPEN', 'FULL', 'BOOKING', 'UNDER_REVIEW'].includes(trip.status)) throw conflict('Payment has started: use "Cancel my seat" to see the refund rules.')
    await trx('trip_members').where({ id: member.id }).update({ status: 'LEFT', decided_at: now() })
    if (member.status === 'APPROVED') {
      const thread = await tripThread(trip.id, trx)
      await removeParticipant(thread.id, member.user_id, trx)
      await systemMessage(thread.id, `${req.user.full_name.split(' ')[0]} left the trip.`, trx)
      await notify(trip.organiser_id, { type: 'MEMBER_LEFT', title: `${req.user.full_name.split(' ')[0]} left ${trip.title}`, link: `/trips/${trip.code}` }, trx)
      if (trip.status === 'FULL') await setStatus(trip, 'OPEN', { trx, text: 'A seat is free again.' })
    }
  })
  res.json({ status: 'LEFT' })
})

// ---------- Lock the group and book partners (section 12) ----------
r.post('/trips/:code/lock', requireAuth, requireActive, async (req, res) => {
  await db.transaction(async (trx) => {
    const trip = await organiserOnly(req, { lock: true, trx })
    if (!['OPEN', 'FULL'].includes(trip.status)) throw conflict('The group can only be locked while the trip is open or full.')
    const min = await setting('trips.min_group')
    const members = await activeMembers(trip.id, trx)
    if (members.length < min) throw conflict(`You need at least ${min} people (including you) to lock the group.`)
    const pending = await trx('trip_members').where({ trip_id: trip.id, status: 'REQUESTED' })
    for (const p of pending) {
      await trx('trip_members').where({ id: p.id }).update({ status: 'EXPIRED', decided_at: now() })
      await notify(p.user_id, { type: 'JOIN_EXPIRED', title: `${trip.title} is no longer taking requests`, link: '/trips' }, trx)
    }
    await setStatus(trip, 'BOOKING', { actorId: req.user.id, trx, text: `The group is locked with ${members.length} people. The organiser is booking transport now.`, extra: { locked_at: now() } })
    await notifyMembers(trip.id, { type: 'GROUP_LOCKED', title: `${trip.title}: the group is locked`, body: 'Next: the organiser books transport and you pay your share.', link: `/trips/${trip.code}` }, { except: req.user.id, trx })
  })
  res.json({ status: 'BOOKING' })
})

// Vehicles that can take this trip, with the suggested price for exactly this route (section 9)
export async function vehiclesForTrip(trip, trx = db) {
  const stops = await trx('trip_stops').where({ trip_id: trip.id }).orderBy('position')
  const members = await activeMembers(trip.id, trx)
  const group = Math.max(members.length, trip.status === 'OPEN' || trip.status === 'FULL' ? trip.seats : members.length)
  const radius = await setting('partners.driver_radius_km')
  const card = await activeRateCard('VEHICLE', now(), trx)
  const rates = await vehicleRates(card.id, trx)
  const days = tripDays(stops)
  const nights = tripNights(stops)
  const dates = Array.from({ length: days }, (_, i) => addDays(trip.start_date, i))
  const candidates = await trx('vehicles as v').join('users as u', 'u.id', 'v.owner_id').where('v.status', 'APPROVED').where('v.seats', '>=', group).where('u.status', 'ACTIVE').whereNotNull('u.id_verified_at')
    .select('v.*', 'u.full_name')
  const out = []
  for (const v of candidates) {
    if (v.base_lat && haversineKm({ lat: Number(stops[0].lat), lng: Number(stops[0].lng) }, { lat: Number(v.base_lat), lng: Number(v.base_lng) }) > radius) continue
    const busy = await trx('availability').where({ owner_type: 'VEHICLE', owner_id: v.id }).whereIn('date', dates).first()
    if (busy) continue
    const clash = await trx('bookings as b').join('trips as t', 't.id', 'b.trip_id').where('b.vehicle_id', v.id).where('b.status', 'ACCEPTED').whereNot('t.id', trip.id)
      .where('t.start_date', '<=', trip.end_date).where('t.end_date', '>=', trip.start_date).first()
    if (clash) continue
    const licence = await trx('verifications').where({ user_id: v.owner_id, type: 'LICENCE', status: 'APPROVED' }).where('expires_on', '>', colomboDate()).first()
    if (!licence) continue
    if ((v.insurance_expires && v.insurance_expires < trip.end_date) || (v.licence_expires && v.licence_expires < trip.end_date)) continue
    const rate = rates.find((x) => x.vehicle_type_id === v.type_id)
    if (!rate) continue
    const back = await returnKm(stops.at(-1), { lat: v.base_lat, lng: v.base_lng })
    const price = suggestedTransportPrice({ km: Number(trip.total_km), days, nights, flexible: Boolean(trip.flexible), returnKm: back, rates: rate })
    const photo = await trx('vehicle_photos').where({ vehicle_id: v.id }).orderBy('id').first()
    const profile = await trx('profiles').where({ user_id: v.owner_id }).first()
    out.push({
      vehicleId: v.id, name: `${v.make} ${v.model}`, year: v.year, seats: v.seats, ac: Boolean(v.ac), type: rate.name_en, typeCode: rate.code,
      driver: { id: v.owner_id, firstName: v.full_name.split(' ')[0], rating: profile?.avg_rating ?? null, reviews: profile?.review_count ?? 0, photo: signedUrl(profile?.photo_key, 3600) },
      rating: v.avg_rating, reviews: v.review_count, photo: signedUrl(photo?.file_key, 3600), base: v.base_name,
      price: price.total, breakdown: price.lines, rateCardId: card.id, returnKm: back,
    })
  }
  return { vehicles: out.sort((a, b) => a.price - b.price), group, cardId: card.id }
}

r.get('/trips/:code/partners', requireAuth, async (req, res) => {
  const trip = await tripByCode(req.params.code)
  const v = await viewerRole(trip, req.user)
  if (!['ORGANISER', 'MEMBER', 'ADMIN'].includes(v.role)) throw forbidden()
  const { vehicles, group } = await vehiclesForTrip(trip)
  // Average and lowest per vehicle type; with fewer than 3 drivers the suggested price is shown instead
  const minDrivers = await setting('partners.min_drivers_for_average')
  const types = {}
  for (const x of vehicles) (types[x.typeCode] ??= []).push(x.price)
  const summary = Object.entries(types).map(([code, prices]) => ({
    type: code, count: prices.length, lowest: Math.min(...prices), average: prices.length >= minDrivers ? round2(prices.reduce((a, b) => a + b, 0) / prices.length) : null,
  }))
  res.json({ vehicles, summary, group })
})

r.get('/trips/:code/offers', requireAuth, async (req, res) => {
  const trip = await tripByCode(req.params.code)
  const v = await viewerRole(trip, req.user)
  if (!['ORGANISER', 'MEMBER', 'ADMIN'].includes(v.role)) throw forbidden()
  const rows = await db('driver_offers as o').join('vehicles as v', 'v.id', 'o.vehicle_id').join('vehicle_types as vt', 'vt.id', 'v.type_id').join('users as u', 'u.id', 'o.driver_id')
    .where('o.trip_id', trip.id).where('o.status', 'OPEN').where('o.valid_until', '>', now()).select('o.*', 'v.make', 'v.model', 'v.seats', 'vt.name_en as type', 'u.full_name')
  res.json({ offers: rows.map((o) => ({ id: o.id, price: o.price, note: o.note, validUntil: o.valid_until, vehicle: `${o.make} ${o.model}`, type: o.type, seats: o.seats, driver: o.full_name.split(' ')[0], driverId: o.driver_id, vehicleId: o.vehicle_id })) })
})

async function createBooking(trx, { trip, vehicle, amount, breakdown, rateCardId, status, offerId = null }) {
  const commissionPct = await setting('fees.commission_pct')
  const { commission, net } = commissionOf(amount, commissionPct)
  const hours = await setting('partners.reply_hours')
  const code = await newCode('bookings', 'BK', trx)
  const [id] = await trx('bookings').insert({
    code, trip_id: trip.id, partner_id: vehicle.owner_id, kind: 'TRANSPORT', vehicle_id: vehicle.id, offer_id: offerId, amount, commission_rate: commissionPct, commission, partner_net: net,
    rate_card_id: rateCardId, price_breakdown_json: JSON.stringify(breakdown), status, expires_at: status === 'REQUESTED' ? addHours(now(), hours) : null, accepted_at: status === 'ACCEPTED' ? now() : null,
  })
  return { id, code }
}

r.post('/trips/:code/bookings', requireAuth, requireActive, async (req, res) => {
  const { vehicleId } = parse(z.object({ vehicleId: z.coerce.number().int() }), req.body)
  const out = await db.transaction(async (trx) => {
    const trip = await organiserOnly(req, { lock: true, trx })
    if (trip.status !== 'BOOKING') throw conflict('Lock the group first, then book transport.')
    const { vehicles } = await vehiclesForTrip(trip, trx)
    const option = vehicles.find((x) => x.vehicleId === vehicleId)
    if (!option) throw conflict('This vehicle is not available for this trip.')
    const already = await trx('bookings').where({ trip_id: trip.id, vehicle_id: vehicleId }).whereIn('status', ['REQUESTED', 'ACCEPTED']).first()
    if (already) throw conflict('You have already asked this driver.')
    const vehicle = await trx('vehicles').where({ id: vehicleId }).first()
    const b = await createBooking(trx, { trip, vehicle, amount: option.price, breakdown: { lines: option.breakdown, km: trip.total_km, returnKm: option.returnKm }, rateCardId: option.rateCardId, status: 'REQUESTED' })
    const hours = await setting('partners.reply_hours')
    await notify(vehicle.owner_id, { type: 'BOOKING_REQUEST', title: `New request: ${trip.title}`, body: `${trip.start_date} · ${fmt(option.price)}. Accept or decline within ${hours} hours.`, link: '/partner/requests', email: true, sms: true }, trx)
    await history(trip.id, req.user.id, 'BOOKING_REQUESTED', `Transport requested: ${vehicle.make} ${vehicle.model}`, null, trx)
    return b
  })
  res.status(201).json(out)
})

r.post('/offers/:id/accept', requireAuth, requireActive, async (req, res) => {
  const out = await db.transaction(async (trx) => {
    const offer = await trx('driver_offers').where({ id: req.params.id }).forUpdate().first()
    if (!offer || offer.status !== 'OPEN' || new Date(offer.valid_until) < now()) throw conflict('This offer is no longer available.')
    const trip = await trx('trips').where({ id: offer.trip_id }).forUpdate().first()
    if (trip.organiser_id !== req.user.id) throw forbidden('Only the organiser can accept offers.')
    if (trip.status !== 'BOOKING') throw conflict('Lock the group first, then accept an offer.')
    const { vehicles } = await vehiclesForTrip(trip, trx)
    if (!vehicles.some((x) => x.vehicleId === offer.vehicle_id)) throw conflict('This vehicle is no longer available on these dates.')
    const vehicle = await trx('vehicles').where({ id: offer.vehicle_id }).first()
    await trx('driver_offers').where({ id: offer.id }).update({ status: 'ACCEPTED' })
    // A driver's offer counts as their acceptance
    const b = await createBooking(trx, { trip, vehicle, amount: Number(offer.price), breakdown: parseJson(offer.price_breakdown_json, { lines: [] }), rateCardId: offer.rate_card_id, status: 'ACCEPTED', offerId: offer.id })
    await notify(offer.driver_id, { type: 'OFFER_ACCEPTED', title: `Your offer for ${trip.title} was accepted`, body: 'The group pays next. You will see it as confirmed once everyone has paid.', link: '/partner', email: true }, trx)
    await history(trip.id, req.user.id, 'OFFER_ACCEPTED', `Driver offer accepted: ${fmt(offer.price)}`, null, trx)
    return b
  })
  res.json(out)
})

r.post('/bookings/:id/cancel-request', requireAuth, async (req, res) => {
  await db.transaction(async (trx) => {
    const b = await trx('bookings').where({ id: req.params.id }).forUpdate().first()
    if (!b) throw notFound('This booking')
    const trip = await trx('trips').where({ id: b.trip_id }).first()
    if (trip.organiser_id !== req.user.id) throw forbidden()
    if (!(b.status === 'REQUESTED' || (b.status === 'ACCEPTED' && trip.status === 'BOOKING'))) throw conflict('This booking can no longer be withdrawn here.')
    await trx('bookings').where({ id: b.id }).update({ status: 'CANCELLED', cancelled_at: now(), cancel_reason: 'Withdrawn by the organiser before payment' })
    await notify(b.partner_id, { type: 'BOOKING_WITHDRAWN', title: `Request withdrawn: ${trip.title}`, link: '/partner' }, trx)
  })
  res.json({ ok: true })
})

// All bookings accepted: ask everyone to pay (Payment due, 48 hours)
r.post('/trips/:code/request-payment', requireAuth, requireActive, async (req, res) => {
  const out = await db.transaction(async (trx) => {
    const trip = await organiserOnly(req, { lock: true, trx })
    if (trip.status !== 'BOOKING') throw conflict('The trip is not in the booking stage.')
    const bookings = await trx('bookings').where({ trip_id: trip.id })
    if (bookings.some((b) => b.status === 'REQUESTED')) throw conflict('Wait until every partner has answered, or withdraw the open request.')
    const accepted = bookings.filter((b) => b.status === 'ACCEPTED')
    if (!accepted.length) throw conflict('Book at least one partner first.')
    const members = await activeMembers(trip.id, trx)
    const seats = accepted.length ? (await trx('vehicles').whereIn('id', accepted.map((b) => b.vehicle_id))).reduce((s, v) => s + v.seats, 0) : 0
    if (seats < members.length - 0) throw conflict(`The booked vehicles have ${seats} seats for ${members.length} people. Add another vehicle.`)
    const shares = await recalculateShares(trip, trx)
    const due = await paymentDeadline(trip)
    if (due <= now()) throw conflict('It is too close to the start date to collect payments.')
    await setStatus(trip, 'PAYMENT_DUE', { actorId: req.user.id, trx, text: `Everyone pays their share by ${due.toLocaleString('en-GB', { timeZone: 'Asia/Colombo', dateStyle: 'medium', timeStyle: 'short' })}.`, extra: { payment_due_at: due, needs_rebook: false } })
    for (const m of members) {
      const { balance } = await memberBalance({ ...m, share_amount: shares.find((s) => s.memberId === m.id).share, fee_amount: shares.find((s) => s.memberId === m.id).fee }, trx)
      if (balance > 0) await notify(m.user_id, { type: 'PAYMENT_DUE', title: `Pay ${fmt(balance)} for ${trip.title}`, body: `Pay by card, wallet or bank transfer before ${due.toLocaleString('en-GB', { timeZone: 'Asia/Colombo', dateStyle: 'medium', timeStyle: 'short' })}.`, link: `/trips/${trip.code}#pay`, email: true }, trx)
    }
    if (await maybeConfirm({ ...trip, status: 'PAYMENT_DUE' }, trx)) return { status: 'CONFIRMED' }
    return { status: 'PAYMENT_DUE', dueAt: due, shares }
  })
  res.json(out)
})

// ---------- Paying (section 13) ----------
async function memberOf(trip, user, trx = db) {
  const m = await trx('trip_members').where({ trip_id: trip.id, user_id: user.id, status: 'APPROVED' }).first()
  if (!m) throw forbidden('You are not a member of this trip.')
  return m
}

r.post('/trips/:code/payments', requireAuth, requireActive, async (req, res) => {
  const { channel } = parse(z.object({ channel: z.enum(['PAYHERE', 'BANK_TRANSFER']) }), req.body)
  const trip = await tripByCode(req.params.code)
  const member = await memberOf(trip, req.user)
  const payment = await db.transaction((trx) => createSharePayment({ trip, member, user: req.user, channel }, trx))
  res.json(await paymentReply(payment, req.user, `${trip.title} (${trip.code})`))
})

// ---------- Cancelling ----------
r.get('/trips/:code/cancel-seat', requireAuth, async (req, res) => {
  const trip = await tripByCode(req.params.code)
  const member = await memberOf(trip, req.user)
  res.json(await memberCancellationTerms(trip, member))
})

r.post('/trips/:code/cancel-seat', requireAuth, async (req, res) => {
  const { reason } = parse(z.object({ reason: z.string().max(300).default('') }), req.body)
  const out = await db.transaction(async (trx) => {
    const trip = await tripByCode(req.params.code, trx, { lock: true })
    const member = await memberOf(trip, req.user, trx)
    if (member.role === 'ORGANISER') throw conflict('The organiser cancels the whole trip instead.')
    if (!['PAYMENT_DUE', 'CONFIRMED'].includes(trip.status)) throw conflict('Use "Leave trip" instead.')
    const terms = await memberCancellationTerms(trip, member, trx)
    if (terms.refund > 0) await refundMember(member.id, terms.refund, `Seat cancelled ${terms.days} days before the start`, trx)
    await trx('trip_members').where({ id: member.id }).update({ status: 'CANCELLED', decided_at: now() })
    const thread = await tripThread(trip.id, trx)
    await removeParticipant(thread.id, member.user_id, trx)
    await history(trip.id, req.user.id, 'SEAT_CANCELLED', `${req.user.full_name.split(' ')[0]} cancelled their seat`, { reason }, trx)
    // The group shrinks: shares are recalculated and the others pay the difference (section 15)
    const remaining = await activeMembers(trip.id, trx)
    const min = await setting('trips.min_group')
    if (remaining.length < min) {
      await cancelTrip(trip, { by: 'SYSTEM', reason: 'Too few people left in the group' }, trx)
      return { ...terms, tripCancelled: true }
    }
    const kept = terms.paid - terms.refund // what this member's payment still covers
    await recalculateSharesAfterLeave(trip, member, kept, trx)
    return terms
  })
  res.json(out)
})

// When a paid member leaves, what they paid and didn't get back still counts towards the services
async function recalculateSharesAfterLeave(trip, leaver, kept, trx) {
  const bookings = await trx('bookings').where({ trip_id: trip.id }).whereIn('status', ['ACCEPTED'])
  const total = bookings.reduce((s, b) => s + Number(b.amount) - Number(b.discount), 0)
  const feePct = await setting('fees.booking_fee_pct')
  const keptShare = round2(kept / (1 + feePct / 100))
  const remaining = await activeMembers(trip.id, trx)
  const shares = memberShares(Math.max(0, round2(total - keptShare)), remaining.map((m) => m.id), feePct)
  let anyBalance = false
  for (const s of shares) {
    await trx('trip_members').where({ id: s.memberId }).update({ share_amount: s.share, fee_amount: s.fee })
    const m = remaining.find((x) => x.id === s.memberId)
    const { balance } = await memberBalance({ ...m, share_amount: s.share, fee_amount: s.fee }, trx)
    if (balance > 0) {
      anyBalance = true
      await notify(m.user_id, { type: 'SHARE_CHANGED', title: `${trip.title}: your share went up by ${fmt(balance)}`, body: 'A member cancelled. Pay the difference, or the organiser can find a replacement.', link: `/trips/${trip.code}#pay`, email: true }, trx)
    }
  }
  if (anyBalance && trip.status === 'CONFIRMED') {
    const hours = await setting('money.payment_window_hours')
    const latest = colomboMidnight(addDays(trip.start_date, -(await setting('trips.complete_days_before'))))
    const due = new Date(Math.min(addHours(now(), hours).getTime(), latest.getTime()))
    await setStatus(trip, 'PAYMENT_DUE', { trx, text: 'A member cancelled: the shares were recalculated. Each member pays the difference.', extra: { payment_due_at: due } })
  }
}

r.post('/trips/:code/cancel', requireAuth, async (req, res) => {
  const { reason } = parse(z.object({ reason: z.string().trim().min(3, 'Tell the group why').max(500) }), req.body)
  const out = await db.transaction(async (trx) => {
    const trip = await organiserOnly(req, { lock: true, trx })
    if (trip.status === 'DRAFT') {
      await trx('trips').where({ id: trip.id }).update({ status: 'CANCELLED', cancelled_at: now(), cancel_reason: reason, cancelled_by: 'ORGANISER' })
      return { refunded: 0 }
    }
    return cancelTrip(trip, { by: 'ORGANISER', reason, actorId: req.user.id }, trx)
  })
  res.json(out)
})

// Somebody didn't pay in time: reopen the seat for 24 hours, or continue with fewer people
r.post('/trips/:code/unpaid-decision', requireAuth, async (req, res) => {
  const { action } = parse(z.object({ action: z.enum(['REOPEN', 'CONTINUE']) }), req.body)
  const out = await db.transaction(async (trx) => {
    const trip = await organiserOnly(req, { lock: true, trx })
    if (trip.status !== 'PAYMENT_DUE' || !trip.unpaid_decision_due_at) throw conflict('No decision is needed.')
    if (action === 'REOPEN') {
      const hours = await setting('trips.change_confirm_hours')
      const until = addHours(now(), hours)
      await trx('trips').where({ id: trip.id }).update({ unpaid_decision_due_at: null, seat_open_until: until })
      await history(trip.id, req.user.id, 'SEAT_REOPENED', `Seat reopened for ${hours} hours after a member did not pay`, null, trx)
      const thread = await tripThread(trip.id, trx)
      await systemMessage(thread.id, `A seat is open again for ${hours} hours. If nobody joins, the trip continues with the people who paid.`, trx)
      return { status: 'PAYMENT_DUE', seatOpenUntil: until }
    }
    await continueWithFewer(trip, trx)
    return { status: (await trx('trips').where({ id: trip.id }).first()).status }
  })
  res.json(out)
})

// Split the services again among the members now in the group. Members who now owe more get
// a new deadline; with refundDrops, members whose share fell get the difference back.
export async function rebalanceShares(trip, trx, { refundDrops = false } = {}) {
  await recalculateShares(trip, trx)
  const members = await activeMembers(trip.id, trx)
  let owing = false
  for (const m of members) {
    const { balance, credit, due } = await memberBalance(m, trx)
    if (balance > 0) {
      owing = true
      await notify(m.user_id, { type: 'SHARE_CHANGED', title: `${trip.title}: please pay ${fmt(balance)}`, body: 'The group changed, so the shares were split again.', link: `/trips/${trip.code}#pay`, email: true }, trx)
    } else if (refundDrops && credit > due) {
      await refundMember(m.id, round2(credit - due), 'Your share dropped because someone joined', trx)
    }
  }
  if (owing) {
    const hours = await setting('trips.change_confirm_hours')
    const latest = colomboMidnight(addDays(trip.start_date, -(await setting('trips.complete_days_before'))))
    const due = new Date(Math.min(addHours(now(), hours).getTime(), latest.getTime()))
    await trx('trips').where({ id: trip.id }).update({ payment_due_at: due })
  }
  const fresh = await trx('trips').where({ id: trip.id }).first()
  await maybeConfirm(fresh, trx)
}

export async function continueWithFewer(trip, trx) {
  await trx('trips').where({ id: trip.id }).update({ unpaid_decision_due_at: null, seat_open_until: null })
  const min = await setting('trips.min_group')
  if ((await activeMembers(trip.id, trx)).length < min) {
    await cancelTrip(trip, { by: 'SYSTEM', reason: 'Too few people paid to keep the trip going' }, trx)
    return
  }
  await history(trip.id, trip.organiser_id, 'CONTINUE_FEWER', 'Continuing with the members who paid; shares split again', null, trx)
  await rebalanceShares(trip, trx)
}

// ---------- During the trip (section 16) ----------
r.post('/trips/:code/checkin', requireAuth, async (req, res) => {
  const out = await db.transaction(async (trx) => {
    const trip = await tripByCode(req.params.code, trx, { lock: true })
    if (!['CONFIRMED', 'ONGOING'].includes(trip.status) || colomboDate() < trip.start_date) throw conflict('Check-in opens on the start day.')
    const member = await trx('trip_members').where({ trip_id: trip.id, user_id: req.user.id, status: 'APPROVED' }).first()
    const booking = await trx('bookings').where({ trip_id: trip.id, partner_id: req.user.id, status: 'ACCEPTED' }).first()
    if (!member && !booking) throw forbidden()
    if (member) await trx('trip_members').where({ id: member.id }).update({ checked_in_at: now() })
    if (booking) await trx('bookings').where({ id: booking.id }).update({ partner_checked_in_at: now() })
    await history(trip.id, req.user.id, 'CHECKIN', `${req.user.full_name.split(' ')[0]} checked in`, null, trx)
    const { releaseFuelAdvances } = await import('../services/payouts.js')
    await releaseFuelAdvances(trip, trx)
    return { checkedIn: true }
  })
  res.json(out)
})

r.post('/trips/:code/sos', requireAuth, async (req, res) => {
  const body = parse(z.object({ lat: z.coerce.number().optional(), lng: z.coerce.number().optional(), note: z.string().max(300).optional() }), req.body)
  const trip = await tripByCode(req.params.code)
  const member = await db('trip_members').where({ trip_id: trip.id, user_id: req.user.id, status: 'APPROVED' }).first()
  const booking = await db('bookings').where({ trip_id: trip.id, partner_id: req.user.id, status: 'ACCEPTED' }).first()
  if (!member && !booking) throw forbidden()
  const [id] = await db('safety_events').insert({ trip_id: trip.id, user_id: req.user.id, type: 'SOS', lat: body.lat ?? null, lng: body.lng ?? null, note: body.note ?? null })
  const where = body.lat ? ` Location: https://maps.google.com/?q=${body.lat},${body.lng}` : ''
  const name = req.user.full_name.split(' ')[0]
  await notifyMembers(trip.id, { type: 'SOS', title: `SOS from ${name}`, body: `${name} pressed SOS.${where}`, link: `/trips/${trip.code}` }, { except: req.user.id })
  await notify(await adminIds(), { type: 'SOS', title: `SOS: ${name} on ${trip.code}`, body: `${body.note ?? ''}${where}`, link: `/admin/today`, email: true, sms: true })
  const second = await setting('safety.second_phone')
  if (second) {
    const { sendSms } = await import('../services/messages.js')
    await sendSms(second, `Yaluwo SOS: ${name} on ${trip.code}.${where}`)
  }
  const thread = await tripThread(trip.id)
  if (thread) await systemMessage(thread.id, `🚨 ${name} pressed SOS.${where}`)
  pingAdmins('sos')
  res.json({ id, numbers: [{ label: 'Police', number: '119' }, { label: 'Suwa Seriya ambulance', number: '1990' }, { label: 'Tourist police', number: '1912' }] })
})

export default r
