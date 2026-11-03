import { Router } from 'express'
import { z } from 'zod'
import { db } from '../db/knex.js'
import { parse, upload, limiter } from '../middleware/http.js'
import { requireAuth, requireActive } from '../middleware/auth.js'
import { bad, forbidden, notFound } from '../lib/errors.js'
import { now } from '../lib/time.js'
import { postMessage, shapeMessage, threadUnmasked } from '../services/chat.js'
import { saveUpload } from '../services/files.js'
import { adminIds, notify, pingAdmins } from '../services/notify.js'

const r = Router()
r.use(requireAuth)

async function participant(threadId, userId) {
  const p = await db('thread_participants').where({ thread_id: threadId, user_id: userId }).first()
  if (!p || !p.active) throw forbidden('You are not in this chat.')
  return p
}

async function threadTitle(t, userId) {
  if (t.trip_id) {
    const trip = await db('trips').where({ id: t.trip_id }).first()
    if (t.type === 'TRIP') return { title: trip.title, subtitle: 'Group chat', link: `/trips/${trip.code}`, tripCode: trip.code }
    const others = await db('thread_participants as p').join('users as u', 'u.id', 'p.user_id').where('p.thread_id', t.id).whereNot('p.user_id', userId).select('u.full_name')
    return { title: others.map((o) => o.full_name.split(' ')[0]).join(', ') || 'Request', subtitle: `Join request · ${trip.title}`, link: `/trips/${trip.code}`, tripCode: trip.code }
  }
  return { title: t.type === 'SUPPORT' ? 'Yaluwo support' : 'Chat', subtitle: '' }
}

r.get('/threads', async (req, res) => {
  const rows = await db('thread_participants as p').join('chat_threads as t', 't.id', 'p.thread_id').where({ 'p.user_id': req.user.id, 'p.active': true }).select('t.*', 'p.last_read_at')
  const out = []
  for (const t of rows) {
    const last = await db('messages').where({ thread_id: t.id }).orderBy('id', 'desc').first()
    const unread = await db('messages').where({ thread_id: t.id }).whereNot({ sender_id: req.user.id }).where('created_at', '>', t.last_read_at ?? new Date(0)).count({ n: '*' }).first()
    const unmasked = await threadUnmasked(t)
    out.push({ id: t.id, type: t.type, ...(await threadTitle(t, req.user.id)), unread: Number(unread.n), last: last ? shapeMessage(last, { viewerId: req.user.id, unmasked }) : null })
  }
  out.sort((a, b) => new Date(b.last?.createdAt ?? 0) - new Date(a.last?.createdAt ?? 0))
  res.json({ threads: out, unread: out.reduce((s, t) => s + t.unread, 0) })
})

r.get('/threads/:id/messages', async (req, res) => {
  await participant(req.params.id, req.user.id)
  const thread = await db('chat_threads').where({ id: req.params.id }).first()
  const before = Number(req.query.before) || null
  const q = db('messages as m').leftJoin('users as u', 'u.id', 'm.sender_id').where('m.thread_id', thread.id).select('m.*', 'u.full_name').orderBy('m.id', 'desc').limit(60)
  if (before) q.where('m.id', '<', before)
  const rows = (await q).reverse()
  const unmasked = await threadUnmasked(thread)
  await db('thread_participants').where({ thread_id: thread.id, user_id: req.user.id }).update({ last_read_at: now() })
  const people = await db('thread_participants as p').join('users as u', 'u.id', 'p.user_id').where({ 'p.thread_id': thread.id, 'p.active': true }).select('u.id', 'u.full_name', 'u.phone')
  res.json({
    thread: { id: thread.id, type: thread.type, unmasked, ...(await threadTitle(thread, req.user.id)) },
    people: people.map((p) => ({ id: p.id, firstName: p.full_name.split(' ')[0], phone: unmasked ? p.phone : null })),
    messages: rows.map((m) => shapeMessage(m, { viewerId: req.user.id, unmasked, senderName: m.full_name })),
  })
})

r.post('/threads/:id/messages', requireActive, limiter(120, 5), upload.array('photos', 4), async (req, res) => {
  await participant(req.params.id, req.user.id)
  const body = parse(z.object({ content: z.string().max(2000).optional().default(''), lat: z.coerce.number().optional(), lng: z.coerce.number().optional() }), req.body)
  const photos = req.files ?? []
  if (!body.content.trim() && !photos.length && body.lat == null) throw bad('Write a message.')
  const keys = []
  for (const f of photos) keys.push((await saveUpload(f, { kind: 'image', folder: `chat/${req.params.id}` })).key)
  const kind = body.lat != null ? 'LOCATION' : photos.length ? 'PHOTO' : 'TEXT'
  const { message, masked } = await postMessage({ threadId: Number(req.params.id), senderId: req.user.id, kind, content: body.content.trim() || (kind === 'LOCATION' ? 'Shared a location' : ''), attachmentKeys: keys.length ? keys : null, lat: body.lat ?? null, lng: body.lng ?? null })
  res.status(201).json({ message: shapeMessage(message, { viewerId: req.user.id, unmasked: !masked, senderName: req.user.full_name }), contactHidden: masked })
})

// Reported messages are the only ones the admin reads (section 8)
r.post('/messages/:id/report', async (req, res) => {
  const { reason } = parse(z.object({ reason: z.string().min(2).max(60), details: z.string().max(500).optional() }), req.body)
  const m = await db('messages').where({ id: req.params.id }).first()
  if (!m) throw notFound('This message')
  await participant(m.thread_id, req.user.id)
  await db('messages').where({ id: m.id }).update({ reported: true })
  await db('reports').insert({ reporter_id: req.user.id, target_type: 'MESSAGE', target_id: m.id, reason, details: req.body.details ?? null }).onConflict(['reporter_id', 'target_type', 'target_id']).ignore()
  await notify(await adminIds(), { type: 'REPORT', title: 'A chat message was reported', link: '/admin/reports' })
  pingAdmins('reports')
  res.json({ reported: true })
})

export default r
