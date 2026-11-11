import http from 'node:http'
import { Server } from 'socket.io'
import { env } from './config/env.js'
import { db } from './db/knex.js'
import { createApp } from './app.js'
import { setIo } from './services/realtime.js'
import { loadUser, verifyShort } from './middleware/auth.js'
import { startScheduler } from './jobs/scheduler.js'

const app = createApp()
const server = http.createServer(app)

// Live chat, notifications and inbox counts
const io = new Server(server, { path: '/api/v1/live', cors: { origin: env.corsOrigins, credentials: true } })
io.use(async (socket, next) => {
  const p = verifyShort(socket.handshake.auth?.token, 'access')
  if (!p) return next(new Error('unauthorized'))
  socket.user = await loadUser(p.sub)
  if (!socket.user || ['BANNED', 'LOCKED'].includes(socket.user.status)) return next(new Error('unauthorized'))
  next()
})
io.on('connection', async (socket) => {
  socket.join(`user:${socket.user.id}`)
  if (socket.user.isAdmin) socket.join('admins')
  const threads = await db('thread_participants').where({ user_id: socket.user.id, active: true }).select('thread_id')
  for (const t of threads) socket.join(`thread:${t.thread_id}`)
  socket.on('join-thread', async (threadId) => {
    const ok = await db('thread_participants').where({ thread_id: threadId, user_id: socket.user.id, active: true }).first()
    if (ok) socket.join(`thread:${threadId}`)
  })
  socket.on('typing', (threadId) => socket.to(`thread:${threadId}`).emit('typing', { threadId, userId: socket.user.id, name: socket.user.full_name.split(' ')[0] }))
})
setIo(io)

await db.migrate.latest()
startScheduler()
server.listen(env.port, () => {
  console.log(`Yaluwo API on ${env.apiUrl}/api/v1  (${env.isProd ? 'live' : 'local'}; payments: ${env.payhere.mode}; distances: ${env.googleServerKey ? 'Google Routes' : 'estimates'})`)
})
