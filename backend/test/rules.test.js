// Section 15 and the deadline rules: cancellations, refunds, non-payment, disputes, settings.
import { test, before, after, beforeEach } from 'node:test'
import assert from 'node:assert/strict'
import { call, createOwner, db, ok, png, resetDb, stepUp } from './helpers.js'
import { addDays, colomboDate, setClock } from '../src/lib/time.js'
import { hashPassword } from '../src/lib/passwords.js'
import { encrypt } from '../src/lib/crypto.js'
import { generateSecret } from '../src/lib/totp.js'
import { runJobs } from '../src/jobs/scheduler.js'
import { clearSettingsCache } from '../src/services/settings.js'

let admin
let n = 0
const PASSWORD = 'Tr@velSL-2026!'
let passwordHash

// A verified traveller (or driver), created directly to keep these tests short
async function person({ gender = 'MALE', verified = true, role = null } = {}) {
  n++
  passwordHash ??= await hashPassword(PASSWORD)
  const [id] = await db('users').insert({ email: `p${n}@test.lk`, phone: `+9471${String(n).padStart(7, '0')}`, full_name: `Person${n} Test`, gender, gender_verified: verified, date_of_birth: '1995-01-01', password_hash: passwordHash, id_verified_at: verified ? new Date() : null })
  await db('user_roles').insert({ user_id: id, role: 'TRAVELLER' })
  if (role) await db('user_roles').insert({ user_id: id, role })
  await db('profiles').insert({ user_id: id })
  const login = ok(await call('post', '/auth/login').send({ identifier: `p${n}@test.lk`, password: PASSWORD }))
  return { id, token: login.accessToken, email: `p${n}@test.lk` }
}

async function driverWithVan() {
  const d = await person({ role: 'DRIVER' })
  const secret = generateSecret()
  await db('users').where({ id: d.id }).update({ totp_secret_enc: encrypt(secret), totp_enabled: true })
  await db('verifications').insert({ user_id: d.id, type: 'LICENCE', status: 'APPROVED', expires_on: addDays(colomboDate(), 800) })
  const type = await db('vehicle_types').where({ code: 'VAN' }).first()
  const [vid] = await db('vehicles').insert({ owner_id: d.id, type_id: type.id, make: 'Toyota', model: 'Hiace', year: 2019, plate: `PX-${1000 + n}`, seats: 9, base_name: 'Colombo', base_lat: 6.9271, base_lng: 79.8612, status: 'APPROVED', insurance_expires: addDays(colomboDate(), 300), licence_expires: addDays(colomboDate(), 300) })
  const [bid] = await db('bank_accounts').insert({ partner_id: d.id, bank: 'BOC', branch: 'Colombo', account_no_enc: encrypt('1234567890'), account_last4: '7890', account_hash: `h${n}`, holder_name: `Person${n} Test`, status: 'VERIFIED' })
  return { ...d, vehicleId: vid, secret, bankId: bid }
}

const STOPS = [
  { name: 'Colombo', lat: 6.9271, lng: 79.8612, nights: 0 },
  { name: 'Kandy', lat: 7.2906, lng: 80.6337, nights: 2 },
  { name: 'Colombo', lat: 6.9271, lng: 79.8612, nights: 0 },
]

// A trip with members, booked with a driver, ready for payment
async function bookedTrip({ members = 3, startIn = 20, gender = 'MIXED' } = {}) {
  const org = await person({ gender: gender === 'WOMEN' ? 'FEMALE' : 'MALE' })
  const { code } = ok(await call('post', '/trips', org.token).send({ title: `Trip ${n}`, startDate: addDays(colomboDate(), startIn), seats: members + 1, genderRule: gender, stops: STOPS }), 201)
  ok(await call('post', `/trips/${code}/submit`, org.token))
  const people = []
  for (let i = 0; i < members; i++) {
    const p = await person()
    ok(await call('post', `/trips/${code}/join-requests`, p.token).send({ message: 'Count me in please' }), 201)
    people.push(p)
  }
  for (const r of ok(await call('get', `/trips/${code}`, org.token)).trip.requests) ok(await call('post', `/trips/${code}/members/${r.memberId}/approve`, org.token))
  ok(await call('post', `/trips/${code}/lock`, org.token))
  const driver = await driverWithVan()
  const b = ok(await call('post', `/trips/${code}/bookings`, org.token).send({ vehicleId: driver.vehicleId }), 201)
  ok(await call('post', `/partner/bookings/${b.id}/accept`, driver.token))
  ok(await call('post', `/trips/${code}/request-payment`, org.token))
  return { code, org, people, driver, bookingId: b.id }
}

async function pay(code, who) {
  const o = ok(await call('post', `/trips/${code}/payments`, who.token).send({ channel: 'PAYHERE' }))
  ok(await call('post', `/payments/${o.payment.orderId}/simulate`, who.token).send({ outcome: 'SUCCESS' }))
  return Number(o.payment.amount)
}
const status = async (code, token) => ok(await call('get', `/trips/${code}`, token)).trip.status
const refundsOf = async (userId) => db('refunds').where({ user_id: userId })

before(async () => {
  await resetDb()
  admin = await createOwner()
})
beforeEach(() => setClock(null))
after(async () => {
  setClock(null)
  await db.destroy()
})

test('unverified organiser: deposit, admin review, rejection returns the deposit', async () => {
  const org = await person({ verified: false })
  const { code } = ok(await call('post', '/trips', org.token).send({ title: 'First trip', startDate: addDays(colomboDate(), 15), seats: 3, stops: STOPS }), 201)
  const first = ok(await call('post', `/trips/${code}/submit`, org.token))
  assert.deepEqual(first.needs, { verification: true, deposit: true, depositAmount: 1000 })
  await db('verifications').insert({ user_id: org.id, type: 'NIC', status: 'PENDING' })
  const dep = ok(await call('post', `/trips/${code}/deposit`, org.token).send({ channel: 'PAYHERE' }))
  assert.equal(Number(dep.payment.amount), 1000)
  ok(await call('post', `/payments/${dep.payment.orderId}/simulate`, org.token).send({ outcome: 'SUCCESS' }))
  assert.equal(ok(await call('post', `/trips/${code}/submit`, org.token)).status, 'UNDER_REVIEW')
  // Not on the Trip Board while under review
  assert.ok(!ok(await call('get', '/trips')).trips.some((t) => t.code === code))
  ok(await call('post', `/admin/trips/${code}/decide`, admin.token).send({ decision: 'REJECT', reason: 'Please add more detail about the plan' }))
  assert.equal(await status(code, org.token), 'DRAFT')
  const refunds = await refundsOf(org.id)
  assert.equal(Number(refunds[0].amount), 1000)
})

test('women-only trips: men cannot join; unverified people can request but not be accepted', async () => {
  const org = await person({ gender: 'FEMALE' })
  const { code } = ok(await call('post', '/trips', org.token).send({ title: 'Women only beach', startDate: addDays(colomboDate(), 15), seats: 4, genderRule: 'WOMEN', stops: STOPS }), 201)
  ok(await call('post', `/trips/${code}/submit`, org.token))
  const man = await person({ gender: 'MALE' })
  assert.equal((await call('post', `/trips/${code}/join-requests`, man.token).send({ message: 'Hello there!' })).status, 403)
  const pending = await person({ gender: 'FEMALE', verified: false })
  ok(await call('post', `/trips/${code}/join-requests`, pending.token).send({ message: 'Hello there!' }), 201)
  const req = ok(await call('get', `/trips/${code}`, org.token)).trip.requests[0]
  assert.equal((await call('post', `/trips/${code}/members/${req.memberId}/approve`, org.token)).status, 409)
})

test('non-payment: member removed at the deadline, organiser continues with fewer, shares split again', async () => {
  const t = await bookedTrip({ members: 3 })
  await pay(t.code, t.org)
  await pay(t.code, t.people[0])
  await pay(t.code, t.people[1])
  // people[2] never pays; the deadline passes
  setClock(() => new Date(Date.now() + 49 * 3600 * 1000))
  await runJobs()
  const trip = await db('trips').where({ code: t.code }).first()
  assert.ok(trip.unpaid_decision_due_at, 'organiser must decide')
  const gone = await db('trip_members').where({ trip_id: trip.id, user_id: t.people[2].id }).first()
  assert.equal(gone.status, 'REMOVED')
  ok(await call('post', `/trips/${t.code}/unpaid-decision`, t.org.token).send({ action: 'CONTINUE' }))
  // Each of the 3 remaining now owes a third of the van instead of a quarter
  const view = ok(await call('get', `/trips/${t.code}`, t.org.token)).trip
  assert.equal(view.status, 'PAYMENT_DUE')
  assert.ok(view.myMoney.balance > 0)
  for (const p of [t.org, t.people[0], t.people[1]]) await pay(t.code, p)
  assert.equal(await status(t.code, t.org.token), 'CONFIRMED')
})

test('member cancels 7+ days before: share back, fee kept, others pay the difference', async () => {
  const t = await bookedTrip({ members: 3 })
  const paid = {}
  for (const p of [t.org, ...t.people]) paid[p.id] = await pay(t.code, p)
  assert.equal(await status(t.code, t.org.token), 'CONFIRMED')
  const terms = ok(await call('get', `/trips/${t.code}/cancel-seat`, t.people[0].token))
  assert.ok(terms.rule.includes('fee is kept'))
  ok(await call('post', `/trips/${t.code}/cancel-seat`, t.people[0].token).send({ reason: 'Work' }))
  const refund = (await refundsOf(t.people[0].id))[0]
  const fee = paid[t.people[0].id] - Number(refund.amount)
  assert.ok(Math.abs(fee - paid[t.people[0].id] * (5 / 105)) < 1, `fee kept ~5% (kept ${fee})`)
  assert.equal(await status(t.code, t.org.token), 'PAYMENT_DUE') // the group shrank
  for (const p of [t.org, t.people[1], t.people[2]]) await pay(t.code, p)
  assert.equal(await status(t.code, t.org.token), 'CONFIRMED')
})

test('member cancels under 3 days before: no refund', async () => {
  const t = await bookedTrip({ members: 2, startIn: 6 })
  for (const p of [t.org, ...t.people]) await pay(t.code, p)
  setClock(() => new Date(Date.now() + 4 * 24 * 3600 * 1000)) // 2 days before the start
  const terms = ok(await call('get', `/trips/${t.code}/cancel-seat`, t.people[0].token))
  assert.equal(terms.refund, 0)
})

test('partner cancels after Confirmed: the group gets that booking back, strike, organiser rebooks', async () => {
  const t = await bookedTrip({ members: 2 })
  const paid = {}
  for (const p of [t.org, ...t.people]) paid[p.id] = await pay(t.code, p)
  ok(await call('post', `/partner/bookings/${t.bookingId}/cancel`, t.driver.token).send({ reason: 'Vehicle broke down' }))
  assert.equal(await status(t.code, t.org.token), 'BOOKING')
  for (const p of [t.org, ...t.people]) {
    const r = await refundsOf(p.id)
    assert.equal(Math.round(Number(r[0].amount)), Math.round(paid[p.id])) // 100% of that booking
  }
  const strikes = await db('strikes').where({ partner_id: t.driver.id })
  assert.equal(strikes.length, 1)
  const payout = await db('payouts').where({ booking_id: t.bookingId }).first()
  assert.equal(payout.status, 'CANCELLED')
})

test('organiser cancels: everything refunded in full', async () => {
  const t = await bookedTrip({ members: 2 })
  const paid = {}
  for (const p of [t.org, ...t.people]) paid[p.id] = await pay(t.code, p)
  ok(await call('post', `/trips/${t.code}/cancel`, t.org.token).send({ reason: 'Family emergency' }))
  assert.equal(await status(t.code, t.org.token), 'CANCELLED')
  for (const p of t.people) assert.equal(Math.round(Number((await refundsOf(p.id))[0].amount)), Math.round(paid[p.id]))
  const booking = await db('bookings').where({ id: t.bookingId }).first()
  assert.equal(booking.status, 'CANCELLED')
})

test('system cancels a trip not paid 3 days before the start', async () => {
  const t = await bookedTrip({ members: 2, startIn: 8 })
  await pay(t.code, t.org)
  setClock(() => new Date(Date.now() + 5.5 * 24 * 3600 * 1000))
  await runJobs()
  assert.equal(await status(t.code, t.org.token), 'CANCELLED')
  assert.equal((await refundsOf(t.org.id)).length, 1)
})

test('dispute: payout frozen, partner replies, admin refunds part, payout shrinks, strike', async () => {
  const t = await bookedTrip({ members: 2 })
  for (const p of [t.org, ...t.people]) await pay(t.code, p)
  const d = ok(await call('post', `/bookings/${t.bookingId}/disputes`, t.people[0].token).field('reason', 'The van had no working A/C for two days'), 201)
  const payout = await db('payouts').where({ booking_id: t.bookingId }).first()
  assert.equal(payout.status, 'FROZEN')
  ok(await call('post', `/partner/disputes/${d.id}/respond`, t.driver.token).field('response', 'The A/C failed and I offered to swap vans'))
  ok(await call('post', `/admin/disputes/${d.id}/decide`, admin.token).send({ decision: 'PARTIAL', refundAmount: 9000, note: 'A/C failed; 15% back to the group' }))
  const after = await db('payouts').where({ booking_id: t.bookingId }).first()
  assert.equal(after.status, 'HELD')
  assert.ok(Number(after.amount) < Number(payout.amount))
  assert.equal((await db('strikes').where({ partner_id: t.driver.id })).length, 1)
})

test('login lockout after 5 wrong passwords', async () => {
  const p = await person()
  for (let i = 0; i < 5; i++) assert.equal((await call('post', '/auth/login').send({ identifier: p.email, password: 'wrong-password-123' })).status, 401)
  assert.equal((await call('post', '/auth/login').send({ identifier: p.email, password: PASSWORD })).status, 429)
})

test('settings: fee changes need a step-up and 30 days notice; rate cards are versioned', async () => {
  const noStep = await call('put', '/admin/settings/fees.booking_fee_pct', admin.token).send({ value: 6 })
  assert.equal(noStep.status, 403)
  const token = await stepUp(admin.token, admin.password, admin.secret)
  const tooSoon = await call('put', '/admin/settings/fees.booking_fee_pct', admin.token).set('X-Step-Up', token).send({ value: 6, effectiveFrom: addDays(colomboDate(), 3) })
  assert.equal(tooSoon.status, 400)
  ok(await call('put', '/admin/settings/fees.booking_fee_pct', admin.token).set('X-Step-Up', token).send({ value: 6, effectiveFrom: addDays(colomboDate(), 31) }))
  clearSettingsCache()
  assert.equal(ok(await call('get', '/config')).settings['fees.booking_fee_pct'], 5) // still 5 today
  setClock(() => new Date(Date.now() + 32 * 24 * 3600 * 1000))
  clearSettingsCache()
  assert.equal(ok(await call('get', '/config')).settings['fees.booking_fee_pct'], 6)
  setClock(null)
  clearSettingsCache()

  const cards = ok(await call('get', '/admin/rate-cards', admin.token)).cards
  const rates = cards[0].rates.map((r) => ({ vehicleTypeId: r.vehicle_type_id, ratePerKm: Number(r.rate_per_km) * 1.1, dayMinimum: r.day_minimum, dailyRate: r.daily_rate, dailyKm: r.daily_km, driverAllowance: r.driver_allowance, emptyReturnPct: r.empty_return_pct }))
  const draft = ok(await call('post', '/admin/rate-cards', admin.token).send({ rates, notes: 'Fuel price up' }), 201)
  const impact = ok(await call('get', `/admin/rate-cards/${draft.id}/impact`, admin.token))
  assert.equal(impact.changes.find((c) => c.type === 'Van').ratePerKm.pct, 10)
  ok(await call('post', `/admin/rate-cards/${draft.id}/approve`, admin.token).set('X-Step-Up', await stepUp(admin.token, admin.password, admin.secret)))
  ok(await call('post', `/admin/rate-cards/${draft.id}/schedule`, admin.token).send({ startDate: addDays(colomboDate(), 8) }))
  setClock(() => new Date(Date.now() + 9 * 24 * 3600 * 1000))
  await runJobs()
  const active = await db('rate_cards').where({ status: 'ACTIVE' })
  assert.equal(active.length, 1)
  assert.equal(active[0].id, draft.id)
})
