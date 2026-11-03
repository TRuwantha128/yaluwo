import { Router } from 'express'
import { z } from 'zod'
import { db } from '../db/knex.js'
import { parse, upload } from '../middleware/http.js'
import { requireAuth } from '../middleware/auth.js'
import { bad, conflict, notFound } from '../lib/errors.js'
import { encrypt, lookupHash, mask } from '../lib/crypto.js'
import { parseNic, ageOn } from '../lib/nic.js'
import { addHours, colomboDate, now } from '../lib/time.js'
import { setting } from '../services/settings.js'
import { saveUpload, signedUrl } from '../services/files.js'
import { notify, adminIds, pingAdmins } from '../services/notify.js'
import { maskContacts } from '../lib/mask.js'
import { publicSelf } from './auth.js'
import { memberBalance } from '../services/trips.js'
import { fmt } from '../services/money.js'

const r = Router()
r.use(requireAuth)

const QUIZ = {
  budget: ['SAVER', 'MID', 'COMFORT'],
  pace: ['SLOW', 'BALANCED', 'PACKED'],
  food: ['ANYTHING', 'VEGETARIAN', 'VEGAN', 'HALAL'],
  smoking: ['NO', 'OUTSIDE_OK', 'YES'],
  drinking: ['NO', 'SOMETIMES', 'YES'],
  wake_time: ['EARLY', 'NORMAL', 'LATE'],
}

r.get('/', async (req, res) => {
  const profile = await db('profiles').where({ user_id: req.user.id }).first()
  const prefs = await db('preferences').where({ user_id: req.user.id }).first()
  const contact = await db('emergency_contacts').where({ user_id: req.user.id }).first()
  const verifications = await db('verifications').where({ user_id: req.user.id }).whereNot('status', 'REPLACED').orderBy('id', 'desc')
  // Pages changed since the person last accepted them
  const latest = await db('content_pages').where({ language: 'en', must_accept: true }).whereNotNull('published_at').select('slug', 'title', 'version').orderBy('version', 'desc')
  const consents = await db('consents').where({ user_id: req.user.id })
  const seen = new Set()
  const mustAccept = []
  for (const p of latest) {
    if (seen.has(p.slug)) continue
    seen.add(p.slug)
    if (!consents.some((c) => c.page === p.slug && c.version >= p.version)) mustAccept.push(p)
  }
  res.json({
    user: publicSelf(req.user),
    profile: {
      photo: signedUrl(profile?.photo_key, 3600),
      bio: profile?.bio ?? '',
      languages: profile?.languages ? (typeof profile.languages === 'string' ? JSON.parse(profile.languages) : profile.languages) : [],
      rating: profile?.avg_rating,
      reviews: profile?.review_count ?? 0,
      tripsCompleted: profile?.trips_completed ?? 0,
      badges: profile?.badges ? (typeof profile.badges === 'string' ? JSON.parse(profile.badges) : profile.badges) : [],
    },
    preferences: prefs ? Object.fromEntries(Object.keys(QUIZ).map((k) => [k, prefs[k]])) : null,
    emergencyContact: contact ? { name: contact.name, phone: contact.phone, relationship: contact.relationship } : null,
    verifications: verifications.map(shapeVerification),
    mustAccept,
  })
})

const shapeVerification = (v) => ({
  id: v.id,
  type: v.type,
  status: v.status,
  reason: v.reason,
  number: v.number_enc ? '••••' : null,
  expiresOn: v.expires_on,
  submittedAt: v.created_at,
  vehicleId: v.vehicle_id,
})

r.put('/', async (req, res) => {
  const body = parse(z.object({ bio: z.string().max(600).optional(), languages: z.array(z.string().max(30)).max(10).optional() }), req.body)
  if (body.bio && maskContacts(body.bio).found) throw bad('Please remove phone numbers, emails and links from your bio.')
  await db('profiles').where({ user_id: req.user.id }).update({ ...(body.bio !== undefined && { bio: body.bio }), ...(body.languages && { languages: JSON.stringify(body.languages) }), updated_at: now() })
  res.json({ ok: true })
})

r.post('/photo', upload.single('photo'), async (req, res) => {
  const f = await saveUpload(req.file, { kind: 'image', folder: 'profile' })
  await db('profiles').where({ user_id: req.user.id }).update({ photo_key: f.key, updated_at: now() })
  res.json({ photo: signedUrl(f.key, 3600) })
})

// The 6-question travel-style quiz that powers the match %
r.put('/preferences', async (req, res) => {
  const shape = Object.fromEntries(Object.entries(QUIZ).map(([k, v]) => [k, z.enum(v)]))
  const body = parse(z.object(shape), req.body)
  await db('preferences').insert({ user_id: req.user.id, ...body }).onConflict('user_id').merge({ ...body, updated_at: now() })
  res.json({ ok: true })
})

r.put('/emergency-contact', async (req, res) => {
  const body = parse(z.object({ name: z.string().trim().min(2).max(120), phone: z.string().trim().min(9).max(20), relationship: z.string().max(40).optional() }), req.body)
  await db('emergency_contacts').where({ user_id: req.user.id }).del()
  await db('emergency_contacts').insert({ user_id: req.user.id, ...body })
  res.json({ ok: true })
})

r.post('/consents', async (req, res) => {
  const body = parse(z.object({ pages: z.array(z.object({ slug: z.string(), version: z.number().int() })) }), req.body)
  for (const p of body.pages) await db('consents').insert({ user_id: req.user.id, page: p.slug, version: p.version, ip: req.ip, accepted_at: now() })
  res.json({ ok: true })
})

// ---------- ID verification (section 3) ----------
// NIC (or passport), a driving licence, or a police clearance. Files: front, back, selfie.
r.post(
  '/verifications',
  upload.fields([{ name: 'front', maxCount: 1 }, { name: 'back', maxCount: 1 }, { name: 'selfie', maxCount: 1 }]),
  async (req, res) => {
    const body = parse(
      z.object({
        type: z.enum(['NIC', 'PASSPORT', 'LICENCE', 'POLICE']),
        number: z.string().trim().min(5).max(30),
        expiresOn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
        licenceClasses: z.string().max(60).optional(),
        country: z.string().max(2).optional(),
      }),
      req.body,
    )
    const files = req.files ?? {}
    const need = { NIC: ['front', 'back', 'selfie'], PASSPORT: ['front', 'selfie'], LICENCE: ['front', 'back'], POLICE: ['front'] }[body.type]
    for (const f of need) if (!files[f]?.[0]) throw bad(`Add the ${f === 'selfie' ? 'live selfie' : `${f} photo`}.`, { fields: { [f]: 'Needed' } })

    const details = { entered: { classes: body.licenceClasses, country: body.country }, checks: [] }
    let number = body.number.toUpperCase().replace(/\s/g, '')
    if (body.type === 'NIC') {
      const nic = parseNic(number)
      if (!nic.valid) throw bad(nic.reason, { fields: { number: 'Check the number' } })
      number = nic.number
      // The birth date and gender are encoded in the NIC: compare with what was entered
      details.checks.push({ name: 'NIC format', ok: true, note: `${nic.format === 'OLD' ? 'Old' : 'New'} card` })
      details.checks.push({ name: 'Birth date matches', ok: nic.birthDate === req.user.date_of_birth, note: `NIC says ${nic.birthDate}, profile says ${req.user.date_of_birth}` })
      details.checks.push({ name: 'Gender matches', ok: nic.gender === req.user.gender, note: `NIC says ${nic.gender.toLowerCase()}` })
      details.nic = { birthDate: nic.birthDate, gender: nic.gender }
      const minAge = await setting('accounts.min_age')
      details.checks.push({ name: `Age ${minAge}+`, ok: ageOn(nic.birthDate, colomboDate()) >= minAge })
    }
    if (body.type === 'LICENCE' && body.expiresOn) {
      details.checks.push({ name: 'Licence not expired', ok: body.expiresOn > colomboDate(), note: `Expires ${body.expiresOn}` })
    }
    // One NIC (or licence, passport) can belong to one account only
    const hash = lookupHash(`${body.type}:${number}`)
    const dup = await db('verifications').where({ number_hash: hash }).whereNot({ user_id: req.user.id }).whereIn('status', ['PENDING', 'APPROVED']).first()
    if (dup) throw conflict('This ID number is already linked to another account. Contact support if this is a mistake.')
    details.checks.push({ name: 'Face match with ID photo', ok: null, note: 'No face-matching service connected yet: compare by eye' })

    const keys = {}
    for (const f of ['front', 'back', 'selfie']) {
      if (files[f]?.[0]) keys[f] = (await saveUpload(files[f][0], { kind: f === 'selfie' ? 'video' : 'document', folder: `id/${req.user.id}` })).key
    }
    const hours = await setting('accounts.verification_hours')
    const id = await db.transaction(async (trx) => {
      await trx('verifications').where({ user_id: req.user.id, type: body.type }).whereIn('status', ['PENDING', 'RESUBMIT', 'REJECTED']).update({ status: 'REPLACED' })
      const [vid] = await trx('verifications').insert({
        user_id: req.user.id, type: body.type, number_enc: encrypt(number), number_hash: hash, file_keys: JSON.stringify(keys),
        details: JSON.stringify(details), expires_on: body.expiresOn ?? null, due_at: addHours(now(), hours),
      })
      return vid
    })
    await notify(await adminIds(), { type: 'VERIFICATION_SUBMITTED', title: `New ${body.type.toLowerCase()} to check`, link: `/admin/verifications/${id}` })
    pingAdmins('verifications')
    res.status(201).json({ id, status: 'PENDING', masked: mask(number), message: `We'll check it within ${hours} hours.` })
  },
)

// ---------- My trips and what to do next ----------
r.get('/trips', async (req, res) => {
  const rows = await db('trip_members as m').join('trips as t', 't.id', 'm.trip_id').where('m.user_id', req.user.id)
    .whereNotIn('m.status', ['REJECTED'])
    .select('t.*', 'm.status as member_status', 'm.role as member_role', 'm.id as member_id', 'm.share_amount', 'm.fee_amount', 'm.expires_at as request_expires_at')
    .orderBy('t.start_date', 'asc')
  const out = []
  for (const t of rows) {
    const stops = await db('trip_stops').where({ trip_id: t.id }).orderBy('position')
    const members = await db('trip_members').where({ trip_id: t.id, status: 'APPROVED' }).count({ n: '*' }).first()
    let next = null
    const isOrganiser = t.member_role === 'ORGANISER'
    if (t.member_status === 'APPROVED') {
      if (t.status === 'DRAFT' && isOrganiser) next = { text: 'Finish and submit your trip', link: `/trips/${t.code}/edit` }
      if (t.status === 'PAYMENT_DUE') {
        const { balance } = await memberBalance({ id: t.member_id, share_amount: t.share_amount, fee_amount: t.fee_amount })
        if (balance > 0) next = { text: `Pay ${fmt(balance)} for ${t.title} by ${new Date(t.payment_due_at).toLocaleString('en-GB', { timeZone: 'Asia/Colombo', dateStyle: 'medium', timeStyle: 'short' })}`, link: `/trips/${t.code}#pay`, urgent: true, dueAt: t.payment_due_at }
      }
      if (isOrganiser && t.status === 'OPEN') {
        const pending = await db('trip_members').where({ trip_id: t.id, status: 'REQUESTED' }).count({ n: '*' }).first()
        if (pending.n > 0) next = { text: `${pending.n} join ${pending.n === 1 ? 'request' : 'requests'} to answer`, link: `/trips/${t.code}#requests`, urgent: true }
      }
      if (isOrganiser && t.status === 'BOOKING') next = { text: 'Book transport, then ask the group to pay', link: `/trips/${t.code}#booking` }
      if (t.status === 'COMPLETED') next = { text: 'Rate your trip companions and driver', link: `/trips/${t.code}#review` }
    }
    if (t.member_status === 'REQUESTED') next = { text: 'Waiting for the organiser to answer your request', link: `/trips/${t.code}` }
    out.push({
      code: t.code, title: t.title, status: t.status, startDate: t.start_date, endDate: t.end_date, seats: t.seats, members: Number(members.n),
      role: t.member_role, memberStatus: t.member_status, route: stops.map((s) => s.name), cover: signedUrl(t.cover_key, 3600), next,
    })
  }
  res.json({ trips: out })
})

r.get('/payments', async (req, res) => {
  const rows = await db('payments as p').leftJoin('trips as t', 't.id', 'p.trip_id').where('p.user_id', req.user.id).whereNot('p.status', 'CANCELLED')
    .select('p.*', 't.title', 't.code').orderBy('p.id', 'desc')
  const refunds = await db('refunds').where({ user_id: req.user.id }).orderBy('id', 'desc')
  const invoices = await db('invoices').where({ party_id: req.user.id, type: 'RECEIPT' })
  res.json({
    payments: rows.map((p) => ({
      id: p.id, orderId: p.order_id, trip: p.title, tripCode: p.code, purpose: p.purpose, channel: p.channel, amount: p.amount, status: p.status,
      paidAt: p.paid_at, refunded: p.refunded_amount, receipt: invoices.find((i) => i.payment_id === p.id)?.number ?? null,
    })),
    refunds: refunds.map((x) => ({ id: x.id, amount: x.amount, reason: x.reason, status: x.status, method: x.method, createdAt: x.created_at, processedAt: x.processed_at })),
  })
})

// ---------- Notifications ----------
r.get('/notifications', async (req, res) => {
  const rows = await db('notifications').where({ user_id: req.user.id }).orderBy('id', 'desc').limit(50)
  const unread = await db('notifications').where({ user_id: req.user.id }).whereNull('read_at').count({ n: '*' }).first()
  res.json({ unread: Number(unread.n), items: rows.map((n) => ({ id: n.id, type: n.type, title: n.title, body: n.body, link: n.link, read: Boolean(n.read_at), createdAt: n.created_at })) })
})

r.post('/notifications/read', async (req, res) => {
  const body = parse(z.object({ ids: z.array(z.number()).optional() }), req.body)
  const q = db('notifications').where({ user_id: req.user.id }).whereNull('read_at')
  if (body.ids?.length) q.whereIn('id', body.ids)
  await q.update({ read_at: now() })
  res.json({ ok: true })
})

// ---------- Blocking ----------
r.post('/blocks/:userId', async (req, res) => {
  const other = await db('users').where({ id: req.params.userId }).first()
  if (!other || other.id === req.user.id) throw notFound('This person')
  await db('blocks').insert({ user_id: req.user.id, blocked_user_id: other.id }).onConflict(['user_id', 'blocked_user_id']).ignore()
  res.json({ blocked: true })
})
r.delete('/blocks/:userId', async (req, res) => {
  await db('blocks').where({ user_id: req.user.id, blocked_user_id: req.params.userId }).del()
  res.json({ blocked: false })
})

export default r
