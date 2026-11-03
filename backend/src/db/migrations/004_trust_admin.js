// Trust, communication and admin
const stamps = (t, knex) => {
  t.datetime('created_at').notNullable().defaultTo(knex.fn.now())
  t.datetime('updated_at').notNullable().defaultTo(knex.fn.now())
}

export async function up(knex) {
  await knex.schema.createTable('reviews', (t) => {
    t.bigIncrements('id')
    t.bigInteger('trip_id').unsigned().notNullable().references('trips.id')
    t.bigInteger('booking_id').unsigned().nullable()
    t.bigInteger('reviewer_id').unsigned().notNullable().references('users.id')
    t.enu('subject_type', ['USER', 'DRIVER', 'VEHICLE', 'LISTING', 'GUIDE', 'GROUP']).notNullable()
    t.bigInteger('subject_id').unsigned().notNullable()
    t.json('scores_json').notNullable()
    t.decimal('overall', 3, 2).notNullable()
    t.string('comment', 2000).nullable()
    t.json('photo_keys').nullable()
    t.datetime('visible_at').nullable() // blind until both sides rated or the window closes
    t.boolean('hidden').notNullable().defaultTo(false)
    stamps(t, knex)
    t.unique(['trip_id', 'reviewer_id', 'subject_type', 'subject_id'])
    t.index(['subject_type', 'subject_id'])
  })

  await knex.schema.createTable('reports', (t) => {
    t.bigIncrements('id')
    t.bigInteger('reporter_id').unsigned().notNullable().references('users.id')
    t.enu('target_type', ['USER', 'TRIP', 'VEHICLE', 'REVIEW', 'MESSAGE', 'LISTING']).notNullable()
    t.bigInteger('target_id').unsigned().notNullable()
    t.string('reason', 60).notNullable()
    t.string('details', 1000).nullable()
    t.enu('status', ['OPEN', 'UPHELD', 'DISMISSED']).notNullable().defaultTo('OPEN')
    t.bigInteger('handled_by').unsigned().nullable()
    t.datetime('handled_at').nullable()
    stamps(t, knex)
    t.unique(['reporter_id', 'target_type', 'target_id'])
  })

  await knex.schema.createTable('strikes', (t) => {
    t.bigIncrements('id')
    t.bigInteger('partner_id').unsigned().notNullable().references('users.id')
    t.bigInteger('booking_id').unsigned().nullable()
    t.string('reason', 255).notNullable()
    stamps(t, knex)
  })

  await knex.schema.createTable('thread_participants', (t) => {
    t.bigIncrements('id')
    t.bigInteger('thread_id').unsigned().notNullable().references('chat_threads.id').onDelete('CASCADE')
    t.bigInteger('user_id').unsigned().notNullable().references('users.id')
    t.datetime('last_read_at').nullable()
    t.boolean('active').notNullable().defaultTo(true)
    stamps(t, knex)
    t.unique(['thread_id', 'user_id'])
  })

  await knex.schema.createTable('messages', (t) => {
    t.bigIncrements('id')
    t.bigInteger('thread_id').unsigned().notNullable().references('chat_threads.id').onDelete('CASCADE')
    t.bigInteger('sender_id').unsigned().nullable() // null = system message
    t.enu('kind', ['TEXT', 'PHOTO', 'LOCATION', 'SYSTEM']).notNullable().defaultTo('TEXT')
    t.text('content').notNullable() // as written
    t.text('masked_content').nullable() // what others see before Confirmed
    t.boolean('has_contact').notNullable().defaultTo(false)
    t.json('attachment_keys').nullable()
    t.decimal('lat', 10, 7).nullable()
    t.decimal('lng', 10, 7).nullable()
    t.boolean('reported').notNullable().defaultTo(false)
    stamps(t, knex)
    t.index(['thread_id', 'id'])
  })

  await knex.schema.createTable('notifications', (t) => {
    t.bigIncrements('id')
    t.bigInteger('user_id').unsigned().notNullable().references('users.id').onDelete('CASCADE')
    t.string('type', 60).notNullable()
    t.string('title', 200).notNullable()
    t.string('body', 1000).nullable()
    t.string('link', 255).nullable()
    t.json('payload_json').nullable()
    t.json('channels_sent').nullable()
    t.datetime('read_at').nullable()
    stamps(t, knex)
    t.index(['user_id', 'read_at'])
  })

  await knex.schema.createTable('settings', (t) => {
    t.bigIncrements('id')
    t.string('key', 80).notNullable()
    t.string('group', 30).notNullable()
    t.text('value').notNullable() // JSON
    t.string('unit', 20).nullable()
    t.string('label', 200).notNullable()
    t.decimal('min', 14, 2).nullable()
    t.decimal('max', 14, 2).nullable()
    t.datetime('effective_from').notNullable()
    t.datetime('effective_to').nullable()
    t.integer('version').notNullable()
    t.bigInteger('created_by').unsigned().nullable()
    t.bigInteger('approved_by').unsigned().nullable()
    stamps(t, knex)
    t.unique(['key', 'version'])
    t.index(['key', 'effective_from'])
  })

  await knex.schema.createTable('lookup_values', (t) => {
    t.bigIncrements('id')
    t.string('list', 30).notNullable()
    t.string('code', 40).notNullable()
    t.string('label_en', 120).notNullable()
    t.string('label_si', 120).nullable()
    t.string('label_ta', 120).nullable()
    t.boolean('active').notNullable().defaultTo(true)
    t.integer('sort_order').notNullable().defaultTo(0)
    stamps(t, knex)
    t.unique(['list', 'code'])
  })

  await knex.schema.createTable('content_pages', (t) => {
    t.bigIncrements('id')
    t.string('slug', 60).notNullable()
    t.string('language', 5).notNullable().defaultTo('en')
    t.string('title', 200).notNullable()
    t.text('body').notNullable()
    t.integer('version').notNullable()
    t.boolean('must_accept').notNullable().defaultTo(false)
    t.datetime('published_at').nullable()
    stamps(t, knex)
    t.unique(['slug', 'language', 'version'])
  })

  await knex.schema.createTable('audit_log', (t) => {
    t.bigIncrements('id')
    t.bigInteger('actor_id').unsigned().nullable()
    t.string('action', 80).notNullable()
    t.string('target_type', 40).nullable()
    t.string('target_id', 40).nullable()
    t.decimal('amount', 14, 2).nullable()
    t.string('ip', 64).nullable()
    t.json('details').nullable()
    t.datetime('created_at').notNullable().defaultTo(knex.fn.now())
    t.index(['target_type', 'target_id'])
  })

  // The audit log can only grow: block edits and deletes in the database itself.
  await knex.raw(`CREATE OR REPLACE FUNCTION audit_log_insert_only() RETURNS trigger AS $$
    BEGIN RAISE EXCEPTION 'audit_log is insert-only'; END; $$ LANGUAGE plpgsql`)
  await knex.raw('CREATE TRIGGER audit_log_no_update BEFORE UPDATE OR DELETE ON audit_log FOR EACH ROW EXECUTE FUNCTION audit_log_insert_only()')
}

export async function down(knex) {
  await knex.raw('DROP TRIGGER IF EXISTS audit_log_no_update ON audit_log')
  await knex.raw('DROP FUNCTION IF EXISTS audit_log_insert_only()')
  for (const t of ['audit_log', 'content_pages', 'lookup_values', 'settings', 'notifications', 'messages', 'thread_participants', 'strikes', 'reports', 'reviews']) {
    await knex.schema.dropTableIfExists(t)
  }
}
