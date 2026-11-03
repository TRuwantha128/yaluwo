// Gate 1 (workflow section 27): a complete test trip with an organiser, 3 joiners,
// a driver and the admin, from sign-up to payout, with one bank-slip payment.
import { test, before, after } from 'node:test'
import assert from 'node:assert/strict'
import { app, call, createOwner, db, lastCode, ok, png, register, resetDb, stepUp, verifyNic } from './helpers.js'
import { addDays, colomboDate, setClock } from '../src/lib/time.js'
import { runJobs } from '../src/jobs/scheduler.js'
import { totpAt } from '../src/lib/totp.js'
import { decrypt } from '../src/lib/crypto.js'

// NIC number that matches a birth date and gender (new 12-digit format)
function nicFor(dob, gender, serial) {
  const [y, m, d] = dob.split('-').map(Number)
  const DAYS = [31, 29, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31]
  let day = DAYS.slice(0, m - 1).reduce((a, b) => a + b, 0) + d
  if (gender === 'FEMALE') day += 500
  return `${y}${String(day).padStart(3, '0')}${String(serial).padStart(5, '0')}`
}

let admin, organiser, joiners, driver, driverSecret, tripCode, vehicleId
const real = () => new Date()
let offsetDays = 0
const moveClock = (days) => {
  offsetDays += days
  setClock(() => new Date(real().getTime() + offsetDays * 24 * 3600 * 1000))
}

before(async () => {
  await resetDb()
  admin = await createOwner()
})
after(async () => {
  setClock(null)
  await db.destroy()
})

test('accounts: sign-up with codes, admin cannot be chosen, verification', async () => {
  // Admin or staff can never be picked at sign-up
  const bad = await call('post', '/auth/register').send({ fullName: 'Sneaky', role: 'ADMIN' })
  assert.equal(bad.status, 403)

  organiser = await register({ name: 'Nimali Perera', email: 'nimali@example.lk', phone: '0771111111', gender: 'FEMALE', dob: '1996-04-12' })
  joiners = [
    await register({ name: 'Kasun Silva', email: 'kasun@example.lk', phone: '0772222222', gender: 'MALE', dob: '1994-08-01' }),
    await register({ name: 'Ayesha Fernando', email: 'ayesha@example.lk', phone: '0773333333', gender: 'FEMALE', dob: '1998-01-20' }),
    await register({ name: 'Ravi Kumar', email: 'ravi@example.lk', phone: '0774444444', gender: 'MALE', dob: '1992-11-05' }),
  ]
  driver = await register({ name: 'Sunil Jayasinghe', email: 'sunil@example.lk', phone: '0775555555', gender: 'MALE', dob: '1980-06-15', partnerRole: 'DRIVER' })
  assert.ok(driver.user.roles.includes('DRIVER'))

  // Same answer whether or not the email exists
  const f1 = ok(await call('post', '/auth/password/forgot').send({ identifier: 'nimali@example.lk' }))
  const f2 = ok(await call('post', '/auth/password/forgot').send({ identifier: 'nobody@example.lk' }))
  assert.deepEqual(f1, f2)

  // NIC check reads the birth date and gender from the number
  const people = [organiser, ...joiners, driver]
  const dobs = [['1996-04-12', 'FEMALE'], ['1994-08-01', 'MALE'], ['1998-01-20', 'FEMALE'], ['1992-11-05', 'MALE'], ['1980-06-15', 'MALE']]
  for (const [i, p] of people.entries()) await verifyNic(p, nicFor(dobs[i][0], dobs[i][1], 1000 + i), admin)
  // One NIC, one account
  const dup = await call('post', '/me/verifications', joiners[0].token).field('type', 'NIC').field('number', nicFor('1996-04-12', 'FEMALE', 1000)).attach('front', png(), 'a.png').attach('back', png(), 'b.png').attach('selfie', png(), 'c.png')
  assert.equal(dup.status, 409)
  const me = ok(await call('get', '/me', organiser.token))
  assert.equal(me.user.verified, true)
  assert.equal(me.user.genderVerified, true)
  // Quiz for the match %
  for (const p of people) ok(await call('put', '/me/preferences', p.token).send({ budget: 'MID', pace: 'BALANCED', food: 'ANYTHING', smoking: 'NO', drinking: 'SOMETIMES', wake_time: 'EARLY' }))
})

test('driver: licence, two-step login, vehicle with 6 photos, bank account', async () => {
  const lic = ok(await call('post', '/me/verifications', driver.token).field('type', 'LICENCE').field('number', 'B1234567').field('expiresOn', addDays(colomboDate(), 900)).attach('front', png(), 'f.png').attach('back', png(), 'b.png'), 201)
  ok(await call('post', `/admin/verifications/${lic.id}/decide`, admin.token).send({ decision: 'APPROVE' }))

  const setup = ok(await call('post', '/auth/2fa/setup', driver.token))
  driverSecret = setup.secret
  const enabled = ok(await call('post', '/auth/2fa/enable', driver.token).send({ code: totpAt(driverSecret) }))
  assert.equal(enabled.backupCodes.length, 10)

  const types = ok(await call('get', '/partner/vehicles', driver.token)).types
  const van = types.find((t) => t.code === 'VAN')
  const v = ok(await call('post', '/partner/vehicles', driver.token).send({ typeId: van.id, make: 'Toyota', model: 'KDH Hiace', year: 2018, plate: 'PH-4521', seats: 9, ac: true, fuel: 'DIESEL', gearbox: 'MANUAL', baseName: 'Colombo', baseLat: 6.9271, baseLng: 79.8612, districts: ['colombo'] }), 201)
  vehicleId = v.vehicle.id
  let req = call('post', `/partner/vehicles/${vehicleId}/photos`, driver.token)
  for (const a of ['FRONT', 'BACK', 'LEFT', 'RIGHT', 'FRONT_SEATS', 'BACK_SEATS']) req = req.field('angles', a).attach('photos', png(), `${a}.png`)
  ok(await req)
  ok(await call('post', `/partner/vehicles/${vehicleId}/submit`, driver.token).field('licenceExpires', addDays(colomboDate(), 300)).field('insuranceExpires', addDays(colomboDate(), 300)).field('insuranceCoversPassengers', 'true').attach('revenueLicence', png(), 'rl.png').attach('insurance', png(), 'ins.png'))
  const pending = ok(await call('get', '/admin/verifications', admin.token)).verifications
  const vehicleCheck = pending.find((x) => x.type === 'VEHICLE')
  ok(await call('post', `/admin/verifications/${vehicleCheck.id}/decide`, admin.token).send({ decision: 'APPROVE' }))

  // A bank account needs a fresh password + code confirmation
  const noStep = await call('post', '/partner/bank-accounts', driver.token).field('bank', 'Bank of Ceylon').field('branch', 'Kandy').field('accountNumber', '0081234567').field('holderName', 'Sunil Jayasinghe').attach('proof', png(), 'passbook.png')
  assert.equal(noStep.status, 403)
  const token = await stepUp(driver.token, driver.password, driverSecret)
  ok(await call('post', '/partner/bank-accounts', driver.token).set('X-Step-Up', token).field('bank', 'Bank of Ceylon').field('branch', 'Kandy').field('accountNumber', '0081234567').field('holderName', 'Sunil Jayasinghe').attach('proof', png(), 'passbook.png'), 201)
  const bankCheck = ok(await call('get', '/admin/verifications', admin.token)).verifications.find((x) => x.type === 'BANK')
  const detail = ok(await call('get', `/admin/verifications/${bankCheck.id}`, admin.token))
  assert.equal(detail.verification.details.checks[0].ok, true) // holder name matches the ID name
  ok(await call('post', `/admin/verifications/${bankCheck.id}/decide`, admin.token).send({ decision: 'APPROVE' }))
  const dash = ok(await call('get', '/partner/dashboard', driver.token))
  assert.equal(dash.steps.length, 0, JSON.stringify(dash.steps))
})

test('trip: create, publish, join, lock', async () => {
  const start = addDays(colomboDate(), 20)
  // Section 9 example: Colombo → Kandy → Ella → Colombo
  const stops = [
    { name: 'Colombo', lat: 6.9271, lng: 79.8612, nights: 0 },
    { name: 'Kandy', lat: 7.2906, lng: 80.6337, nights: 1 },
    { name: 'Ella', lat: 6.8667, lng: 81.0466, nights: 1 },
    { name: 'Colombo', lat: 6.9271, lng: 79.8612, nights: 0 },
  ]
  const preview = ok(await call('post', '/routes/compute').send({ stops, seats: 4 }))
  assert.equal(preview.legs.length, 3)
  assert.ok(preview.prices.find((p) => p.type === 'VAN'))

  // Contact details are not allowed in the description
  const sneaky = await call('post', '/trips', organiser.token).send({ title: 'Hill country loop', description: 'WhatsApp me 0771234567', startDate: start, seats: 4, stops })
  assert.equal(sneaky.status, 400)

  const created = ok(await call('post', '/trips', organiser.token).send({ title: 'Hill country loop', description: 'Train to Ella, tea and hikes.', startDate: start, seats: 4, genderRule: 'MIXED', tags: ['Hiking', 'Train ride'], vehiclePref: 'VAN', stops }), 201)
  tripCode = created.code
  assert.match(tripCode, /^YLW-\d{4}-\d{4}$/)
  const submitted = ok(await call('post', `/trips/${tripCode}/submit`, organiser.token))
  assert.equal(submitted.status, 'OPEN') // verified organiser goes live at once

  const board = ok(await call('get', '/trips?place=Ella', joiners[0].token))
  const card = board.trips.find((t) => t.code === tripCode)
  assert.equal(card.match, 100)

  for (const j of joiners) ok(await call('post', `/trips/${tripCode}/join-requests`, j.token).send({ message: 'Hi! I love hiking and trains.' }), 201)
  const view = ok(await call('get', `/trips/${tripCode}`, organiser.token)).trip
  assert.equal(view.requests.length, 3)
  for (const r of view.requests) ok(await call('post', `/trips/${tripCode}/members/${r.memberId}/approve`, organiser.token))
  const full = ok(await call('get', `/trips/${tripCode}`, organiser.token)).trip
  assert.equal(full.status, 'FULL')
  assert.equal(full.seatsLeft, 0)

  ok(await call('post', `/trips/${tripCode}/lock`, organiser.token))
  assert.equal(ok(await call('get', `/trips/${tripCode}`, organiser.token)).trip.status, 'BOOKING')
})

test('chat hides contact details until Confirmed', async () => {
  const trip = ok(await call('get', `/trips/${tripCode}`, joiners[0].token)).trip
  const sent = ok(await call('post', `/threads/${trip.threadId}/messages`, joiners[0].token).field('content', 'Call me on 077 222 2222 when you arrive'), 201)
  assert.equal(sent.contactHidden, true)
  const seen = ok(await call('get', `/threads/${trip.threadId}/messages`, joiners[1].token)).messages.at(-1)
  assert.ok(!seen.content.includes('222 2222'))
  assert.ok(seen.hiddenContact)
})

test('booking: driver offer and request, accept, payment due', async () => {
  const partners = ok(await call('get', `/trips/${tripCode}/partners`, organiser.token))
  const van = partners.vehicles.find((v) => v.vehicleId === vehicleId)
  assert.ok(van, 'the registered van is suggested')
  // Driver sees the trip and sends an offer inside the 70–130% band
  const nearby = ok(await call('get', '/partner/trips-nearby', driver.token)).trips.find((t) => t.code === tripCode)
  const option = nearby.options[0]
  const tooHigh = await call('post', '/partner/offers', driver.token).send({ tripCode, vehicleId, price: option.band.max + 1 })
  assert.equal(tooHigh.status, 400)
  const offer = ok(await call('post', '/partner/offers', driver.token).send({ tripCode, vehicleId, price: Math.round(option.suggested * 0.95), note: 'Experienced on hill roads' }), 201)
  const offers = ok(await call('get', `/trips/${tripCode}/offers`, organiser.token)).offers
  assert.equal(offers.length, 1)
  ok(await call('post', `/offers/${offer.id}/accept`, organiser.token))

  const due = ok(await call('post', `/trips/${tripCode}/request-payment`, organiser.token))
  assert.equal(due.status, 'PAYMENT_DUE')
  const trip = await db('trips').where({ code: tripCode }).first()
  const members = await db('trip_members').where({ trip_id: trip.id, status: 'APPROVED' })
  const booking = await db('bookings').where({ trip_id: trip.id, status: 'ACCEPTED' }).first()
  const total = members.reduce((s, m) => s + Number(m.share_amount), 0)
  assert.equal(Math.round(total * 100), Math.round(Number(booking.amount) * 100)) // shares add up exactly
  assert.equal(Number(members[0].fee_amount), Math.round(Number(members[0].share_amount) * 5) / 100) // 5% booking fee
})

test('paying: PayHere (signature checked) for three, bank slip for one, then Confirmed', async () => {
  // A forged notice is refused
  const order = ok(await call('post', `/trips/${tripCode}/payments`, organiser.token).send({ channel: 'PAYHERE' }))
  assert.ok(order.checkout.fields.hash)
  const forged = await call('post', '/webhooks/payhere').type('form').send({ merchant_id: order.checkout.fields.merchant_id, order_id: order.payment.orderId, payhere_amount: order.checkout.fields.amount, payhere_currency: 'LKR', status_code: '2', md5sig: 'ABC' })
  assert.equal(forged.status, 403)

  for (const p of [organiser, joiners[0], joiners[1]]) {
    const o = ok(await call('post', `/trips/${tripCode}/payments`, p.token).send({ channel: 'PAYHERE' }))
    ok(await call('post', `/payments/${o.payment.orderId}/simulate`, p.token).send({ outcome: 'SUCCESS' }))
    // The same notice twice is safe
    ok(await call('post', `/payments/${o.payment.orderId}/simulate`, p.token).send({ outcome: 'SUCCESS' }))
  }

  // Ravi pays by bank transfer with a slip
  const slipOrder = ok(await call('post', `/trips/${tripCode}/payments`, joiners[2].token).send({ channel: 'BANK_TRANSFER' }))
  assert.match(slipOrder.bank.reference, /-M\d$/)
  const slip = png()
  ok(await call('post', `/payments/${slipOrder.payment.id}/proof`, joiners[2].token).field('amount', slipOrder.payment.amount).field('paidOn', colomboDate()).field('bank', 'Sampath Bank').field('bankRef', 'SMP99887766').attach('slip', slip, 'slip.png'), 201)
  // The same slip image can't be used twice
  const again = await call('post', `/payments/${slipOrder.payment.id}/proof`, joiners[2].token).field('amount', 1).field('paidOn', colomboDate()).field('bank', 'Sampath Bank').attach('slip', slip, 'slip.png')
  assert.equal(again.status, 409)

  // Without money in the bank statement the admin can't approve
  const slips = ok(await call('get', '/admin/slips', admin.token)).slips
  const s = slips[0]
  assert.equal((await call('post', `/admin/slips/${s.id}/approve`, admin.token)).status, 409)
  const csv = `Date,Description,Credit,Reference\n${colomboDate()},CEFT ${slipOrder.bank.reference} R KUMAR,${slipOrder.payment.amount},SMP99887766\n${colomboDate()},Some other deposit,5000,X1\n`
  const imported = ok(await call('post', '/admin/bank-statements', admin.token).attach('statement', Buffer.from(csv), 'statement.csv'))
  assert.equal(imported.matched, 1)
  ok(await call('post', `/admin/slips/${s.id}/approve`, admin.token))

  const trip = ok(await call('get', `/trips/${tripCode}`, organiser.token)).trip
  assert.equal(trip.status, 'CONFIRMED')
  // Phone numbers are visible now
  const msgs = ok(await call('get', `/threads/${trip.threadId}/messages`, joiners[1].token)).messages
  assert.ok(msgs.some((m) => m.content.includes('077 222 2222')))
  const payouts = await db('payouts').where({ trip_id: (await db('trips').where({ code: tripCode }).first()).id })
  assert.equal(payouts.length, 1)
  assert.equal(payouts[0].status, 'HELD')
  // Receipts exist
  const mine = ok(await call('get', '/me/payments', organiser.token)).payments.find((p) => p.status === 'PAID')
  assert.ok(mine.receipt)
  const pdf = await call('get', `/payments/${mine.id}/receipt.pdf`, organiser.token)
  assert.equal(pdf.status, 200)
  assert.equal(pdf.headers['content-type'], 'application/pdf')
})

test('during the trip: Ongoing at midnight, check-in, fuel advance, SOS', async () => {
  moveClock(20)
  await runJobs()
  const trip = ok(await call('get', `/trips/${tripCode}`, organiser.token)).trip
  assert.equal(trip.status, 'ONGOING')
  for (const p of [organiser, ...joiners, driver]) ok(await call('post', `/trips/${tripCode}/checkin`, p.token))
  const advance = await db('payouts').where({ kind: 'FUEL_ADVANCE' }).first()
  assert.ok(advance, 'fuel advance created after day-1 check-in')
  assert.equal(advance.status, 'READY')
  const sos = ok(await call('post', `/trips/${tripCode}/sos`, joiners[1].token).send({ lat: 7.29, lng: 80.63 }))
  assert.equal(sos.numbers[0].number, '119')
  const today = ok(await call('get', '/admin/today', admin.token))
  assert.equal(today.items[0].kind, 'SOS') // SOS is first in the admin's inbox
  ok(await call('post', `/admin/sos/${today.items[0].id}/handled`, admin.token))
})

test('after the trip: Completed, blind reviews, payouts Ready, released and paid, Closed', async () => {
  moveClock(3)
  await runJobs()
  assert.equal(ok(await call('get', `/trips/${tripCode}`, organiser.token)).trip.status, 'COMPLETED')

  const todo = ok(await call('get', `/trips/${tripCode}/reviews/todo`, joiners[0].token))
  assert.ok(todo.items.some((i) => i.subjectType === 'DRIVER'))
  ok(await call('post', `/trips/${tripCode}/reviews`, joiners[0].token).send({ subjectType: 'DRIVER', subjectId: driver.user.id, scores: { safe_driving: 5, punctuality: 5, communication: 4, route_knowledge: 5 }, comment: 'Careful and friendly' }), 201)
  // Blind: hidden until the driver rates back
  let pub = ok(await call('get', `/drivers/${driver.user.id}`))
  assert.equal(pub.reviews.driver.length, 0)
  ok(await call('post', `/trips/${tripCode}/reviews`, driver.token).send({ subjectType: 'USER', subjectId: joiners[0].user.id, scores: { respect: 5, on_time: 5 } }), 201)
  pub = ok(await call('get', `/drivers/${driver.user.id}`))
  assert.equal(pub.reviews.driver.length, 1)

  moveClock(1.1)
  await runJobs()
  const ready = ok(await call('get', '/admin/payouts?status=READY', admin.token)).payouts
  const main = ready.find((p) => p.kind === 'BOOKING')
  assert.ok(main, 'booking payout is Ready 24 hours after the trip')
  const ids = ready.map((p) => p.id)
  const batch = ok(await call('post', '/admin/payouts/release', admin.token).send({ ids }))
  assert.equal(batch.count, ids.length)
  const file = await call('get', `/admin/payout-batches/${batch.batchId}/file`, admin.token)
  assert.match(file.text, /0081234567/) // the full account number is only in the bank file
  ok(await call('post', `/admin/payout-batches/${batch.batchId}/sent`, admin.token).send({ bankRef: 'BOC-CFLEX-778899' }))
  for (const id of ids) ok(await call('post', `/admin/payouts/${id}/paid`, admin.token))
  const earned = ok(await call('get', '/partner/payouts', driver.token)).payouts
  assert.ok(earned.every((p) => p.status === 'PAID'))
  const booking = await db('bookings').where({ id: (await db('payouts').where({ id: ids[0] }).first()).booking_id }).first()
  const totalPaid = earned.reduce((s, p) => s + Number(p.amount), 0)
  assert.equal(Math.round(totalPaid), Math.round(Number(booking.amount) * 0.9)) // partner gets the booking minus 10%

  const revenue = ok(await call('get', '/admin/revenue', admin.token))
  assert.ok(revenue.months[0].bookingFees > 0 && revenue.months[0].commission > 0)

  moveClock(14)
  await runJobs()
  assert.equal(ok(await call('get', `/trips/${tripCode}`, organiser.token)).trip.status, 'CLOSED')
  const audit = ok(await call('get', '/admin/audit-log', admin.token)).entries
  assert.ok(audit.some((e) => e.action === 'PAYOUTS_RELEASED'))
  // The audit log can't be edited
  await assert.rejects(db('audit_log').update({ action: 'X' }))
})
