import { db } from '../db/knex.js'
import { env } from '../config/env.js'
import { sendEmail, sendSms } from './messages.js'
import { afterCommit, emitToAdmins, emitToUser } from './realtime.js'

// Every event creates an in-app notification; some also go by email or SMS
// (workflow section 21). Web push and WhatsApp come in phase 2.
export async function notify(userIds, { type, title, body = '', link = null, email = false, sms = false, payload = null }, trx = db) {
  const ids = [...new Set([].concat(userIds).filter(Boolean))]
  if (!ids.length) return
  const channels = ['IN_APP', email && 'EMAIL', sms && 'SMS'].filter(Boolean)
  for (const userId of ids) {
    const [id] = await trx('notifications').insert({
      user_id: userId, type, title, body, link, payload_json: payload ? JSON.stringify(payload) : null, channels_sent: JSON.stringify(channels),
    })
    afterCommit(trx, () => emitToUser(userId, 'notification', { id, type, title, body, link, created_at: new Date().toISOString() }))
  }
  if (email || sms) {
    const users = await trx('users').whereIn('id', ids).select('id', 'email', 'phone')
    for (const u of users) {
      const url = link ? `${env.appUrl}${link}` : env.appUrl
      if (email) await sendEmail(u.email, title, `${body}\n\n${url}\n\nYaluwo`)
      if (sms) await sendSms(u.phone, `Yaluwo: ${title}. ${url}`)
    }
  }
}

// The admin's inbox counts change: tell open admin consoles to refresh
// (a moment later, so a surrounding transaction has committed)
export const pingAdmins = (what) => setTimeout(() => emitToAdmins('inbox', { what, at: Date.now() }), 300)

export async function adminIds(trx = db) {
  const rows = await trx('user_roles').where({ role: 'ADMIN' }).select('user_id')
  return rows.map((r) => r.user_id)
}
