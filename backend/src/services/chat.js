import { db } from '../db/knex.js'
import { maskContacts } from '../lib/mask.js'
import { afterCommit, emitToUser } from './realtime.js'
import { signedUrl } from './files.js'

// Chat threads: one group thread per trip, one private thread per join request.
// Contact details stay hidden until the trip is Confirmed (workflow section 8).
export const UNMASKED_STATUSES = ['CONFIRMED', 'ONGOING', 'COMPLETED', 'CLOSED']

export async function createThread({ type, refId = null, tripId = null, userIds = [] }, trx = db) {
  const [id] = await trx('chat_threads').insert({ type, ref_id: refId, trip_id: tripId })
  if (userIds.length) await trx('thread_participants').insert(userIds.map((u) => ({ thread_id: id, user_id: u })))
  return id
}

export async function tripThread(tripId, trx = db) {
  return trx('chat_threads').where({ type: 'TRIP', ref_id: tripId }).first()
}

export async function addParticipant(threadId, userId, trx = db) {
  const row = await trx('thread_participants').where({ thread_id: threadId, user_id: userId }).first()
  if (row) await trx('thread_participants').where({ id: row.id }).update({ active: true })
  else await trx('thread_participants').insert({ thread_id: threadId, user_id: userId })
}

export async function removeParticipant(threadId, userId, trx = db) {
  await trx('thread_participants').where({ thread_id: threadId, user_id: userId }).update({ active: false })
}

export async function systemMessage(threadId, text, trx = db) {
  const [id] = await trx('messages').insert({ thread_id: threadId, sender_id: null, kind: 'SYSTEM', content: text })
  const people = await trx('thread_participants').where({ thread_id: threadId, active: true }).select('user_id')
  afterCommit(trx, () => { for (const p of people) emitToUser(p.user_id, 'message', { id, threadId, kind: 'SYSTEM', content: text, photos: [], createdAt: new Date().toISOString() }) })
  return id
}

export async function postMessage({ threadId, senderId, kind = 'TEXT', content = '', attachmentKeys = null, lat = null, lng = null }, trx = db) {
  const { masked, found } = maskContacts(content)
  const [id] = await trx('messages').insert({
    thread_id: threadId, sender_id: senderId, kind, content, masked_content: found ? masked : null, has_contact: found,
    attachment_keys: attachmentKeys ? JSON.stringify(attachmentKeys) : null, lat, lng,
  })
  await trx('thread_participants').where({ thread_id: threadId, user_id: senderId }).update({ last_read_at: new Date() })
  const row = await trx('messages').where({ id }).first()
  const thread = await trx('chat_threads').where({ id: threadId }).first()
  const unmasked = await threadUnmasked(thread, trx)
  // Each participant gets the version they are allowed to see
  const people = await trx('thread_participants').where({ thread_id: threadId, active: true }).select('user_id')
  const sender = await trx('users').where({ id: senderId }).first()
  afterCommit(trx, () => {
    for (const p of people) emitToUser(p.user_id, 'message', shapeMessage(row, { viewerId: p.user_id, unmasked, senderName: sender?.full_name }))
  })
  return { message: row, masked: found && !unmasked }
}

export async function threadUnmasked(thread, trx = db) {
  if (!thread?.trip_id) return false
  const trip = await trx('trips').where({ id: thread.trip_id }).first()
  return UNMASKED_STATUSES.includes(trip?.status)
}

export function shapeMessage(m, { viewerId, unmasked, senderName = null }) {
  const own = m.sender_id && String(m.sender_id) === String(viewerId)
  const hidden = m.has_contact && !unmasked && !own
  return {
    id: m.id,
    threadId: m.thread_id,
    senderId: m.sender_id,
    senderName: senderName ? senderName.split(' ')[0] : null,
    kind: m.kind,
    content: hidden ? m.masked_content : m.content,
    hiddenContact: hidden,
    ownHasContact: own && m.has_contact && !unmasked, // tell the writer their contact details are hidden from others for now
    photos: (m.attachment_keys ? (typeof m.attachment_keys === 'string' ? JSON.parse(m.attachment_keys) : m.attachment_keys) : []).map((k) => signedUrl(k, 3600)),
    lat: m.lat,
    lng: m.lng,
    createdAt: m.created_at,
  }
}
