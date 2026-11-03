import nodemailer from 'nodemailer'
import { env } from '../config/env.js'
import { db } from '../db/knex.js'

// Email and SMS. Without an SMTP server or SMS gateway (development and tests),
// messages are saved to the dev outbox, which the admin console shows in development.
let transport = null
const mailer = () => {
  if (!env.smtp.host) return null
  transport ??= nodemailer.createTransport({
    host: env.smtp.host,
    port: env.smtp.port,
    secure: env.smtp.port === 465,
    auth: env.smtp.user ? { user: env.smtp.user, pass: env.smtp.password } : undefined,
  })
  return transport
}

export async function sendEmail(to, subject, text) {
  const t = mailer()
  if (!t) {
    await db('dev_outbox').insert({ channel: 'EMAIL', to, subject, body: text })
    if (env.isDev) console.log(`\n[email to ${to}] ${subject}\n${text}\n`)
    return
  }
  try {
    await t.sendMail({ from: env.smtp.from, to, subject, text })
  } catch (e) {
    console.error('Email failed:', e.message)
  }
}

// A real gateway (Dialog, Mobitel, Notify.lk...) plugs in here
export async function sendSms(to, text) {
  if (env.smsProvider === 'dev') {
    await db('dev_outbox').insert({ channel: 'SMS', to, subject: null, body: text })
    if (env.isDev) console.log(`\n[SMS to ${to}] ${text}\n`)
    return
  }
  console.warn(`SMS provider "${env.smsProvider}" is not set up yet. Message to ${to} not sent.`)
}
