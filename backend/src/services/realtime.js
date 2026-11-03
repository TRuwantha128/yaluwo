// Live updates over Socket.IO: chat messages, notifications and inbox counts.
// Each user joins the room "user:<id>"; each chat thread is the room "thread:<id>".
let io = null

export const setIo = (instance) => {
  io = instance
}

export function emitToUser(userId, event, data) {
  io?.to(`user:${userId}`).emit(event, data)
}

export function emitToThread(threadId, event, data) {
  io?.to(`thread:${threadId}`).emit(event, data)
}

export function emitToAdmins(event, data) {
  io?.to('admins').emit(event, data)
}

// Inside a database transaction, send only after it commits: otherwise a page
// that reloads on the event could still read the old data
export function afterCommit(trx, fn) {
  if (trx?.isTransaction && trx.executionPromise) trx.executionPromise.then(fn, () => null)
  else fn()
}
