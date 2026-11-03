// One-time owner admin setup (workflow section 4).
//   npm run setup-admin
// Asks for the owner's email, phone, name and a password of at least 14 characters,
// turns on two-step login and prints 10 backup codes. It refuses to run again once
// an owner exists. Recovery when everything is lost: npm run setup-admin -- --recover
import readline from 'node:readline/promises'
import { stdin, stdout } from 'node:process'
import qrcode from 'qrcode-terminal'
import { db } from '../src/db/knex.js'
import { encrypt } from '../src/lib/crypto.js'
import { generateSecret, otpauthUrl, verifyTotp } from '../src/lib/totp.js'
import { hashPassword, validatePassword } from '../src/lib/passwords.js'
import { setting } from '../src/services/settings.js'
import { audit } from '../src/services/audit.js'
import { createBackupCodes } from '../src/routes/auth.js'

const rl = readline.createInterface({ input: stdin, output: stdout })
const ask = async (q) => (await rl.question(q)).trim()

async function askPassword(min, email, name) {
  for (;;) {
    const p1 = await ask(`Password (at least ${min} characters, shown as you type, clear your terminal after): `)
    try {
      validatePassword(p1, { min, email, name })
    } catch (e) {
      console.log(`  ${e.message}`)
      continue
    }
    const p2 = await ask('Type it again: ')
    if (p1 === p2) return p1
    console.log('  They do not match.')
  }
}

async function confirmAuthenticator(secret, email) {
  const url = otpauthUrl(secret, email)
  console.log('\nScan this with Google Authenticator, Microsoft Authenticator or Authy:\n')
  qrcode.generate(url, { small: true })
  console.log(`Or type this key: ${secret}\n`)
  for (;;) {
    const code = await ask('Enter the 6-digit code the app shows: ')
    if (verifyTotp(secret, code)) return
    console.log('  Not right. Check the time on your phone and try again.')
  }
}

try {
  await db.migrate.latest()
  const recover = process.argv.includes('--recover')
  const owner = await db('admin_permissions').where({ permission: 'OWNER' }).first()

  if (recover) {
    if (!owner) throw new Error('There is no owner yet. Run without --recover.')
    const user = await db('users').where({ id: owner.user_id }).first()
    console.log(`Recovering the owner account ${user.email}. This is recorded in the audit log.`)
    const min = await setting('accounts.admin_password_min')
    const password = await askPassword(min, user.email, user.full_name)
    const secret = generateSecret()
    await confirmAuthenticator(secret, user.email)
    await db('users').where({ id: user.id }).update({ password_hash: await hashPassword(password), totp_secret_enc: encrypt(secret), totp_enabled: true, status: 'ACTIVE', failed_logins: 0, locked_until: null })
    await db('refresh_tokens').where({ user_id: user.id }).update({ revoked_at: new Date() })
    const codes = await createBackupCodes(user.id)
    await audit({ actorId: user.id, action: 'OWNER_RECOVERED_BY_SERVER_COMMAND' })
    console.log('\nNew backup codes (print them and keep them offline):\n' + codes.join('   '))
  } else {
    if (owner) throw new Error('An owner admin already exists. This command only runs once. Use --recover if the owner has lost access.')
    console.log('Create the Yaluwo owner admin. This runs once.\n')
    const email = (await ask('Email: ')).toLowerCase()
    let phone = (await ask('Mobile (07X XXX XXXX): ')).replace(/[\s-]/g, '')
    if (/^0\d{9}$/.test(phone)) phone = `+94${phone.slice(1)}`
    const name = await ask('Full name: ')
    if (!email.includes('@') || !/^\+\d{9,15}$/.test(phone) || name.length < 3) throw new Error('Check the email, mobile and name.')
    const min = await setting('accounts.admin_password_min')
    const password = await askPassword(min, email, name)
    const secret = generateSecret()
    await confirmAuthenticator(secret, email)
    const codes = await db.transaction(async (trx) => {
      const hash = await hashPassword(password)
      const [id] = await trx('users').insert({
        email, phone, full_name: name, password_hash: hash, totp_secret_enc: encrypt(secret), totp_enabled: true,
        email_verified_at: new Date(), phone_verified_at: new Date(), password_changed_at: new Date(),
      })
      await trx('user_roles').insert({ user_id: id, role: 'ADMIN' })
      await trx('admin_permissions').insert({ user_id: id, permission: 'OWNER' })
      await trx('profiles').insert({ user_id: id })
      await trx('password_history').insert({ user_id: id, password_hash: hash })
      await audit({ actorId: id, action: 'OWNER_CREATED' }, trx)
      return createBackupCodes(id, trx)
    })
    console.log('\nOwner admin created. Log in at /admin/login (it is not linked anywhere on the site).')
    console.log('\nBackup codes. Print them and keep them offline; each works once:\n' + codes.join('   '))
  }
} catch (e) {
  console.error(`\n${e.message}`)
  process.exitCode = 1
} finally {
  rl.close()
  await db.destroy()
}
