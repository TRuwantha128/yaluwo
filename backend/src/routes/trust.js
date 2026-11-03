import { Router } from 'express'
import { z } from 'zod'
import { db } from '../db/knex.js'
import { parse, upload } from '../middleware/http.js'
import { optionalAuth, requireAuth } from '../middleware/auth.js'
import { conflict, forbidden, notFound } from '../lib/errors.js'
import { addHours, now } from '../lib/time.js'
import { setting } from '../services/settings.js'
import { saveUpload, signedUrl } from '../services/files.js'
import { adminIds, notify, pingAdmins } from '../services/notify.js'
import { newCode, tripByCode } from '../services/trips.js'
import { publishReviewsIfBothRated, recomputeRatings } from '../services/reviews.js'

const r = Router()

// ---------- Reviews (section 17): blind, only from people who checked in ----------
const CRITERIA = {
  USER: ['trust', 'punctuality', 'friendliness'],
  DRIVER: ['safe_driving', 'punctuality', 'communication', 'route_knowledge'],
  VEHICLE: ['cleanliness', 'comfort', 'matched_photos', 'ac_condition'],
  GROUP: ['respect', 'on_time'],
}

r.get('/trips/:code/reviews/todo', requireAuth, async (req, res) => {
  const trip = await tripByCode(req.params.code)
  if (!['COMPLETED'].includes(trip.status)) return res.json({ open: false, items: [] })
  const me = await db('trip_members').where({ trip_id: trip.id, user_id: req.user.id, status: 'APPROVED' }).first()
  const myBooking = await db('bookings').where({ trip_id: trip.id, partner_id: req.user.id, status: 'COMPLETED' }).first()
  const items = []
  if (me?.checked_in_at) {
    const others = await db('trip_members as m').join('users as u', 'u.id', 'm.user_id').where({ 'm.trip_id': trip.id, 'm.status': 'APPROVED' }).whereNot('m.user_id', req.user.id).whereNotNull('m.checked_in_at').select('u.id', 'u.full_name')
    for (const o of others) items.push({ subjectType: 'USER', subjectId: o.id, label: o.full_name.split(' ')[0], criteria: CRITERIA.USER })
    const bookings = await db('bookings as b').join('users as u', 'u.id', 'b.partner_id').leftJoin('vehicles as v', 'v.id', 'b.vehicle_id').where({ 'b.trip_id': trip.id, 'b.status': 'COMPLETED' }).select('b.*', 'u.full_name', 'v.make', 'v.model')
    for (const b of bookings) {
      items.push({ subjectType: 'DRIVER', subjectId: b.partner_id, bookingId: b.id, label: `Driver: ${b.full_name.split(' ')[0]}`, criteria: CRITERIA.DRIVER, tip: true })
      if (b.vehicle_id) items.push({ subjectType: 'VEHICLE', subjectId: b.vehicle_id, bookingId: b.id, label: `Vehicle: ${b.make} ${b.model}`, criteria: CRITERIA.VEHICLE })
    }
  }
  if (myBooking) {
    const members = await db('trip_members as m').join('users as u', 'u.id', 'm.user_id').where({ 'm.trip_id': trip.id, 'm.status': 'APPROVED' }).whereNotNull('m.checked_in_at').select('u.id', 'u.full_name')
    for (const m of members) items.push({ subjectType: 'USER', subjectId: m.id, bookingId: myBooking.id, label: m.full_name.split(' ')[0], criteria: CRITERIA.GROUP })
  }
  const done = await db('reviews').where({ trip_id: trip.id, reviewer_id: req.user.id })
  res.json({ open: true, items: items.map((i) => ({ ...i, done: done.some((d) => d.subject_type === i.subjectType && d.subject_id === i.subjectId) })) })
})

r.post('/trips/:code/reviews', requireAuth, upload.array('photos', 5), async (req, res) => {
  const body = parse(z.object({
    subjectType: z.enum(['USER', 'DRIVER', 'VEHICLE']),
    subjectId: z.coerce.number().int(),
    scores: z.union([z.string(), z.record(z.coerce.number())]).transform((v) => (typeof v === 'string' ? JSON.parse(v) : v)),
    comment: z.string().max(2000).optional(),
  }), req.body)
  const trip = await tripByCode(req.params.code)
  if (trip.status !== 'COMPLETED') throw conflict('Reviews open after the trip and stay open for 14 days.')
  const me = await db('trip_members').where({ trip_id: trip.id, user_id: req.user.id, status: 'APPROVED' }).first()
  const myBooking = await db('bookings').where({ trip_id: trip.id, partner_id: req.user.id }).whereIn('status', ['COMPLETED']).first()
  if (!(me?.checked_in_at || myBooking?.partner_checked_in_at)) throw forbidden('Only people who checked in can review.')
  const values = Object.values(body.scores).map(Number)
  if (!values.length || values.some((v) => !(v >= 1 && v <= 5))) throw conflict('Give 1 to 5 stars for each question.')
  const overall = Math.round((values.reduce((a, b) => a + b, 0) / values.length) * 100) / 100
  const keys = []
  for (const f of req.files ?? []) keys.push((await saveUpload(f, { kind: 'image', folder: `reviews/${trip.id}` })).key)
  const booking = body.subjectType !== 'USER' ? await db('bookings').where({ trip_id: trip.id, status: 'COMPLETED' }).where(body.subjectType === 'DRIVER' ? { partner_id: body.subjectId } : { vehicle_id: body.subjectId }).first() : myBooking
  if (body.subjectType !== 'USER' && !booking) throw notFound('This booking')
  const [id] = await db('reviews').insert({
    trip_id: trip.id, booking_id: booking?.id ?? null, reviewer_id: req.user.id, subject_type: myBooking && body.subjectType === 'USER' ? 'USER' : body.subjectType, subject_id: body.subjectId,
    scores_json: JSON.stringify(body.scores), overall, comment: body.comment ?? null, photo_keys: JSON.stringify(keys),
  }).onConflict(['trip_id', 'reviewer_id', 'subject_type', 'subject_id']).merge(['scores_json', 'overall', 'comment', 'updated_at'])
  await publishReviewsIfBothRated(trip.id)
  res.status(201).json({ id, overall })
})

// Public reviews of a person, driver or vehicle (only once visible)
async function reviewsOf(type, id) {
  const rows = await db('reviews as r').join('users as u', 'u.id', 'r.reviewer_id').join('trips as t', 't.id', 'r.trip_id').where({ 'r.subject_type': type, 'r.subject_id': id, 'r.hidden': false })
    .whereNotNull('r.visible_at').where('r.visible_at', '<=', now()).select('r.*', 'u.full_name', 't.start_date').orderBy('r.id', 'desc').limit(50)
  return rows.map((x) => ({ id: x.id, overall: x.overall, scores: typeof x.scores_json === 'string' ? JSON.parse(x.scores_json) : x.scores_json, comment: x.comment, by: x.full_name.split(' ')[0], tag: `Verified trip · ${new Date(x.start_date).toLocaleString('en-GB', { month: 'short', year: 'numeric' })}`, photos: (typeof x.photo_keys === 'string' ? JSON.parse(x.photo_keys) : x.photo_keys ?? []).map((k) => signedUrl(k, 3600)) }))
}

// ---------- Public profiles (section 5) ----------
r.get('/drivers/:id', optionalAuth, async (req, res) => {
  const u = await db('users').where({ id: req.params.id }).first()
  const roles = u ? (await db('user_roles').where({ user_id: u.id }).select('role')).map((x) => x.role) : []
  if (!u || !roles.some((x) => ['DRIVER', 'FLEET'].includes(x))) throw notFound('This driver')
  const p = await db('profiles').where({ user_id: u.id }).first()
  const vehicles = await db('vehicles as v').join('vehicle_types as t', 't.id', 'v.type_id').where({ 'v.owner_id': u.id, 'v.status': 'APPROVED' }).select('v.*', 't.name_en as type')
  const licence = await db('verifications').where({ user_id: u.id, type: 'LICENCE', status: 'APPROVED' }).first()
  const police = await db('verifications').where({ user_id: u.id, type: 'POLICE', status: 'APPROVED' }).first()
  const trips = await db('bookings').where({ partner_id: u.id, status: 'COMPLETED' }).count({ n: '*' }).first()
  res.json({
    driver: {
      id: u.id, name: `${u.full_name.split(' ')[0]} ${u.full_name.split(' ').at(-1)?.[0] ?? ''}.`, photo: signedUrl(p?.photo_key, 3600), bio: p?.bio, languages: p?.languages ? (typeof p.languages === 'string' ? JSON.parse(p.languages) : p.languages) : [],
      verified: Boolean(u.id_verified_at), licenceBadge: Boolean(licence), policeBadge: Boolean(police), badges: p?.badges ? (typeof p.badges === 'string' ? JSON.parse(p.badges) : p.badges) : [],
      rating: p?.avg_rating, reviews: p?.review_count ?? 0, tripsCompleted: Number(trips.n), yearsDriving: p?.years_driving, replyMinutes: p?.reply_minutes,
      vehicles: await Promise.all(vehicles.map(async (v) => ({ id: v.id, name: `${v.make} ${v.model}`, year: v.year, type: v.type, seats: v.seats, ac: Boolean(v.ac), rating: v.avg_rating, reviews: v.review_count, photos: (await db('vehicle_photos').where({ vehicle_id: v.id })).map((x) => ({ angle: x.angle, url: signedUrl(x.file_key, 3600) })) }))),
    },
    reviews: { driver: await reviewsOf('DRIVER', u.id), vehicles: Object.fromEntries(await Promise.all(vehicles.map(async (v) => [v.id, await reviewsOf('VEHICLE', v.id)]))) },
  })
})

r.get('/people/:id', optionalAuth, async (req, res) => {
  const u = await db('users').where({ id: req.params.id }).first()
  if (!u) throw notFound('This person')
  const p = await db('profiles').where({ user_id: u.id }).first()
  res.json({
    person: { id: u.id, firstName: u.full_name.split(' ')[0], photo: signedUrl(p?.photo_key, 3600), bio: p?.bio, verified: Boolean(u.id_verified_at), rating: p?.avg_rating, reviews: p?.review_count ?? 0, tripsCompleted: p?.trips_completed ?? 0, badges: p?.badges ? (typeof p.badges === 'string' ? JSON.parse(p.badges) : p.badges) : [] },
    reviews: await reviewsOf('USER', u.id),
  })
})

// ---------- Disputes (section 15): about a booked service, until 24 h after the trip ----------
r.post('/bookings/:id/disputes', requireAuth, upload.array('evidence', 5), async (req, res) => {
  const { reason } = parse(z.object({ reason: z.string().trim().min(10, 'Explain what went wrong').max(1000) }), req.body)
  const out = await db.transaction(async (trx) => {
    const b = await trx('bookings').where({ id: req.params.id }).forUpdate().first()
    if (!b) throw notFound('This booking')
    const trip = await trx('trips').where({ id: b.trip_id }).first()
    const me = await trx('trip_members').where({ trip_id: trip.id, user_id: req.user.id, status: 'APPROVED' }).first()
    if (!me) throw forbidden()
    if (!['CONFIRMED', 'ONGOING', 'COMPLETED'].includes(trip.status)) throw conflict('Disputes are for booked services on confirmed trips.')
    const windowHours = await setting('quality.dispute_window_hours')
    if (trip.completed_at && addHours(trip.completed_at, windowHours) < now()) throw conflict(`Disputes can be opened until ${windowHours} hours after the trip.`)
    if (await trx('disputes').where({ booking_id: b.id }).whereNot('status', 'DECIDED').first()) throw conflict('There is already an open dispute about this booking.')
    const keys = []
    for (const f of req.files ?? []) keys.push((await saveUpload(f, { kind: 'document', folder: `disputes/b${b.id}` })).key)
    const code = await newCode('disputes', 'DS', trx)
    const [id] = await trx('disputes').insert({
      code, booking_id: b.id, trip_id: trip.id, opened_by: req.user.id, reason, evidence_keys: JSON.stringify(keys),
      partner_due_at: addHours(now(), await setting('quality.dispute_partner_hours')), admin_due_at: addHours(now(), await setting('quality.dispute_admin_hours')),
    })
    // The payout for that booking is frozen until the admin decides
    await trx('payouts').where({ booking_id: b.id }).whereIn('status', ['HELD', 'WAITING_SETTLEMENT', 'READY']).update({ status: 'FROZEN' })
    await notify(b.partner_id, { type: 'DISPUTE', title: `Dispute opened about ${b.code}`, body: 'Reply with your side within 24 hours.', link: '/partner/requests', email: true }, trx)
    await notify(await adminIds(trx), { type: 'DISPUTE', title: `New dispute ${code}`, link: '/admin/disputes' }, trx)
    return { id, code }
  })
  pingAdmins('disputes')
  res.status(201).json(out)
})

// ---------- Reports: any user, trip, vehicle or review ----------
r.post('/reports', requireAuth, async (req, res) => {
  const body = parse(z.object({ targetType: z.enum(['USER', 'TRIP', 'VEHICLE', 'REVIEW']), targetId: z.coerce.number().int().optional(), tripCode: z.string().optional(), reason: z.string().min(2).max(60), details: z.string().max(1000).optional() }), req.body)
  let targetId = body.targetId
  if (body.targetType === 'TRIP') targetId = (await tripByCode(body.tripCode ?? '')).id
  if (!targetId) throw notFound('What you are reporting')
  const inserted = await db('reports').insert({ reporter_id: req.user.id, target_type: body.targetType, target_id: targetId, reason: body.reason, details: body.details ?? null }).onConflict(['reporter_id', 'target_type', 'target_id']).ignore()
  if (body.targetType === 'TRIP' && inserted?.[0]) {
    await db('trips').where({ id: targetId }).increment('report_count', 1)
    const trip = await db('trips').where({ id: targetId }).first()
    // A trip with 3 reports is hidden from the Trip Board until the admin reviews it
    if (trip.report_count >= (await setting('trips.report_hide_count'))) await db('trips').where({ id: trip.id }).update({ hidden: true })
  }
  await notify(await adminIds(), { type: 'REPORT', title: `New report: ${body.targetType.toLowerCase()} · ${body.reason}`, link: '/admin/reports' })
  pingAdmins('reports')
  res.status(201).json({ reported: true })
})

export default r
export { recomputeRatings }
