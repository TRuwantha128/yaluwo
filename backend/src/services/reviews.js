import { db } from '../db/knex.js'
import { now } from '../lib/time.js'
import { settings } from './settings.js'
import { adminIds, notify } from './notify.js'

// Blind reviews: a rating stays hidden until both sides have rated each other,
// or the review window closes (section 17).
export async function publishReviewsIfBothRated(tripId, trx = db) {
  const hidden = await trx('reviews').where({ trip_id: tripId }).whereNull('visible_at')
  const touched = new Set()
  for (const r of hidden) {
    // The other side of this pair: the subject reviewing the reviewer
    const subjectUser = r.subject_type === 'VEHICLE' ? (await trx('vehicles').where({ id: r.subject_id }).first())?.owner_id : r.subject_id
    const back = await trx('reviews').where({ trip_id: tripId, reviewer_id: subjectUser, subject_id: r.reviewer_id }).whereIn('subject_type', ['USER']).first()
    if (back) {
      await trx('reviews').whereIn('id', [r.id, back.id]).whereNull('visible_at').update({ visible_at: now() })
      touched.add(`${r.subject_type}:${r.subject_id}`)
      touched.add(`USER:${r.reviewer_id}`)
    }
  }
  for (const key of touched) {
    const [type, id] = key.split(':')
    await recomputeRatings(type, Number(id), trx)
  }
}

export async function publishAllForTrip(tripId, trx = db) {
  const rows = await trx('reviews').where({ trip_id: tripId }).whereNull('visible_at')
  await trx('reviews').where({ trip_id: tripId }).whereNull('visible_at').update({ visible_at: now() })
  const seen = new Set(rows.map((r) => `${r.subject_type}:${r.subject_id}`))
  for (const key of seen) {
    const [type, id] = key.split(':')
    await recomputeRatings(type, Number(id), trx)
  }
}

// Average rating, badges (5+ reviews above 4.5) and auto-suspension (5+ reviews below 2.5)
export async function recomputeRatings(type, id, trx = db) {
  const { minReviews, badgeAvg, suspendAvg } = await settings({ minReviews: 'quality.badge_min_reviews', badgeAvg: 'quality.badge_min_avg', suspendAvg: 'quality.suspend_max_avg' })
  const subjectTypes = type === 'VEHICLE' ? ['VEHICLE'] : type === 'DRIVER' ? ['DRIVER'] : ['USER']
  const stats = await trx('reviews').where({ subject_id: id, hidden: false }).whereIn('subject_type', subjectTypes).whereNotNull('visible_at').avg({ avg: 'overall' }).count({ n: '*' }).first()
  const avg = stats.avg == null ? null : Math.round(Number(stats.avg) * 100) / 100
  const n = Number(stats.n)
  if (type === 'VEHICLE') {
    await trx('vehicles').where({ id }).update({ avg_rating: avg, review_count: n })
    return
  }
  const profile = await trx('profiles').where({ user_id: id }).first()
  const badges = new Set(profile?.badges ? (typeof profile.badges === 'string' ? JSON.parse(profile.badges) : profile.badges) : [])
  const badge = type === 'DRIVER' ? 'Trusted Driver' : 'Super Traveller'
  if (n >= minReviews && avg > badgeAvg) badges.add(badge)
  else badges.delete(badge)
  await trx('profiles').where({ user_id: id }).update({ avg_rating: avg, review_count: n, badges: JSON.stringify([...badges]) })
  if (n >= minReviews && avg < suspendAvg) {
    const user = await trx('users').where({ id }).first()
    if (user.status === 'ACTIVE') {
      await trx('users').where({ id }).update({ status: 'SUSPENDED', status_reason: `Average rating ${avg} from ${n} reviews` })
      await notify(id, { type: 'SUSPENDED', title: 'Your account is paused for a review', body: 'Your ratings are below the minimum. The admin will decide within 48 hours.', email: true }, trx)
      await notify(await adminIds(trx), { type: 'AUTO_SUSPENDED', title: `Account auto-suspended (avg ${avg})`, link: `/admin/users/${id}` }, trx)
    }
  }
}
