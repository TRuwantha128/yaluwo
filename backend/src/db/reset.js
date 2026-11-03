import { db } from './knex.js'

// Drops every table in the database (development and tests only)
export async function dropAll() {
  await db.raw('DROP SCHEMA IF EXISTS public CASCADE')
  await db.raw('CREATE SCHEMA public')
}
