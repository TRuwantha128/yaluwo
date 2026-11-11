import nodemailer from 'nodemailer'
import { env } from '../config/env.js'
import { db } from '../db/knex.js'

// Email and SMS.
// Email goes out through Resend or Brevo (HTTPS, works on hosts that block SMTP ports)
// or an SMTP server. SMS goes through Notify.lk or Text.lk.
// With nothing set up (development, tests, demos) messages are saved to the dev outbox.
// Both functions return true only when the message was handed to a provider.
let transport = null
const mailer = () => {
  if (!env.smtp.host) return null
  transport ??= nodemailer.createTransport({
    host: env.smtp.host,
    port: env.smtp.port,
    secure: env.smtp.port === 465,
    auth: env.smtp.user ? { user: env.smtp.user, pass: env.smtp.password } : undefined,
    connectionTimeout: 10000,
  })
  return transport
}

// "Yaluwo <no-reply@yaluwo.lk>" -> { name, email }
const sender = () => {
  const m = /^\s*"?([^"<]*)"?\s*<([^>]+)>\s*$/.exec(env.smtp.from)
  return m ? { name: m[1].trim() || 'Yaluwo', email: m[2].trim() } : { name: 'Yaluwo', email: env.smtp.from.trim() }
}

async function postJson(url, headers, body) {
  const res = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json', ...headers }, body: JSON.stringify(body), signal: AbortSignal.timeout(12000) })
  if (!res.ok) throw new Error(`${res.status} ${(await res.text()).slice(0, 200)}`)
}

export async function sendEmail(to, subject, text) {
  try {
    if (env.resendKey) {
      await postJson('https://api.resend.com/emails', { Authorization: `Bearer ${env.resendKey}` }, { from: env.smtp.from, to: [to], subject, text })
      return true
    }
    if (env.brevoKey) {
      await postJson('https://api.brevo.com/v3/smtp/email', { 'api-key': env.brevoKey }, { sender: sender(), to: [{ email: to }], subject, textContent: text })
      return true
    }
    const t = mailer()
    if (t) {
      await t.sendMail({ from: env.smtp.from, to, subject, text })
      return true
    }
  } catch (e) {
    console.error(`Email to ${to} failed:`, e.message)
    return false
  }
  await db('dev_outbox').insert({ channel: 'EMAIL', to, subject, body: text })
  if (env.isDev) console.log(`\n[email to ${to}] ${subject}\n${text}\n`)
  return false
}

export async function sendSms(to, text) {
  const number = String(to).replace(/^\+/, '') // gateways want 9471XXXXXXX
  try {
    if (env.canSms && env.smsProvider === 'notifylk') {
      const q = new URLSearchParams({ user_id: env.sms.userId, api_key: env.sms.apiKey, sender_id: env.sms.senderId || 'NotifyDEMO', to: number, message: text })
      const res = await fetch(`https://app.notify.lk/api/v1/send?${q}`, { signal: AbortSignal.timeout(12000) })
      if (!res.ok) throw new Error(`${res.status} ${(await res.text()).slice(0, 200)}`)
      return true
    }
    if (env.canSms && env.smsProvider === 'textlk') {
      await postJson('https://app.text.lk/api/v3/sms/send', { Authorization: `Bearer ${env.sms.apiKey}`, Accept: 'application/json' }, { recipient: number, sender_id: env.sms.senderId, type: 'plain', message: text })
      return true
    }
  } catch (e) {
    console.error(`SMS to ${to} failed:`, e.message)
    return false
  }
  if (env.smsProvider !== 'dev') console.warn(`SMS provider "${env.smsProvider}" is not set up (needs SMS_API_KEY). Message to ${to} saved to the outbox.`)
  await db('dev_outbox').insert({ channel: 'SMS', to, subject: null, body: text })
  if (env.isDev) console.log(`\n[SMS to ${to}] ${text}\n`)
  return false
}
