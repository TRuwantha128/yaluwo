// npm run migrate            -> bring the database up to date
// npm run migrate -- --reset -> drop everything and start again (development only)
import { db } from '../src/db/knex.js'
import { env } from '../src/config/env.js'

const reset = process.argv.includes('--reset')
try {
  if (reset) {
    if (env.isProd) throw new Error('--reset is not allowed in production')
    const { dropAll } = await import('../src/db/reset.js')
    await dropAll()
    console.log('Database cleared')
  }
  const [batch, files] = await db.migrate.latest()
  console.log(files.length ? `Migrations done (batch ${batch}): ${files.join(', ')}` : 'Database already up to date')
} catch (e) {
  console.error(e.message)
  process.exitCode = 1
} finally {
  await db.destroy()
}
