// Creates backend/.env from .env.example with fresh random secrets, and asks for
// your PostgreSQL password.   npm run make-env
// It never overwrites an existing .env.
import fs from 'node:fs'
import crypto from 'node:crypto'
import readline from 'node:readline/promises'

const target = new URL('../.env', import.meta.url)
if (fs.existsSync(target)) {
  console.log('backend/.env already exists. Nothing changed. (Delete it to make a new one.)')
  process.exit(0)
}
let password = ''
if (process.stdin.isTTY) {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout })
  password = (await rl.question('PostgreSQL password for the "postgres" user (the one you use in pgAdmin): ')).trim()
  rl.close()
}
const hex = (n) => crypto.randomBytes(n).toString('hex')
const text = fs
  .readFileSync(new URL('../.env.example', import.meta.url), 'utf8')
  .replace(/^JWT_SECRET=.*$/m, `JWT_SECRET=${hex(32)}`)
  .replace(/^REFRESH_SECRET=.*$/m, `REFRESH_SECRET=${hex(32)}`)
  .replace(/^DATA_KEY=.*$/m, `DATA_KEY=${hex(32)}`)
  .replace(/^FILE_SECRET=.*$/m, `FILE_SECRET=${hex(32)}`)
  .replace(/^DB_PASSWORD=.*$/m, `DB_PASSWORD=${password}`)
fs.writeFileSync(target, text)
console.log('Created backend/.env with new secrets.')
if (!password) console.log('Open backend/.env and put your PostgreSQL password after DB_PASSWORD=')
console.log('Keep DATA_KEY safe: without it, encrypted ID and bank numbers cannot be read.')
