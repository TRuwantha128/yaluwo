import knexLib from 'knex'
import pg from 'pg'
import { fileURLToPath } from 'node:url'
import { env } from '../config/env.js'

// PostgreSQL returns some types as text by default. Read them the way the code expects:
pg.types.setTypeParser(1700, (v) => (v === null ? null : parseFloat(v))) // NUMERIC (money, km) -> number
pg.types.setTypeParser(20, (v) => (v === null ? null : parseInt(v, 10))) // BIGINT (ids, counts) -> number
pg.types.setTypeParser(1082, (v) => v) // DATE stays plain 'YYYY-MM-DD' (trip dates, no time zone shift)

export const knexConfig = {
  client: 'pg',
  connection: { ...env.db },
  pool: {
    min: 0,
    max: 10,
    // Every TIMESTAMPTZ is shown and compared in UTC; Sri Lanka time is worked out in code (lib/time.js)
    afterCreate: (conn, done) => conn.query("SET TIME ZONE 'UTC'", (err) => done(err, conn)),
  },
  migrations: { directory: fileURLToPath(new URL('./migrations', import.meta.url)), loadExtensions: ['.js'] },
  // An insert gives back the new ids, like `const [id] = await db('trips').insert(...)`
  postProcessResponse: (result, ctx) => (ctx?.insertIds && Array.isArray(result) ? result.map((r) => (r && typeof r === 'object' && 'id' in r ? r.id : r)) : result),
}

export const db = knexLib(knexConfig)

// Every insert returns the new rows (RETURNING *), turned into ids above
const builder = Object.getPrototypeOf(db.queryBuilder())
const insert = builder.insert
builder.insert = function (values, returning, options) {
  if (returning !== undefined) return insert.call(this, values, returning, options)
  return insert.call(this, values, '*', options).queryContext({ insertIds: true })
}

// Run fn inside a transaction, or reuse the one passed in
export const tx = (fn, trx) => (trx ? fn(trx) : db.transaction(fn))
