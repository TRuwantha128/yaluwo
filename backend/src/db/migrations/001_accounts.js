// Accounts and access (Build reference: "Accounts and access")
const stamps = (t, knex) => {
  t.datetime('created_at').notNullable().defaultTo(knex.fn.now())
  t.datetime('updated_at').notNullable().defaultTo(knex.fn.now())
}

export async function up(knex) {
  await knex.schema.createTable('users', (t) => {
    t.bigIncrements('id')
    t.string('email', 190).notNullable().unique()
    t.string('phone', 20).notNullable().unique()
    t.string('password_hash', 100).notNullable()
    t.string('full_name', 120).notNullable()
    t.enu('gender', ['MALE', 'FEMALE']).nullable()
    t.boolean('gender_verified').notNullable().defaultTo(false)
    t.date('date_of_birth').nullable()
    t.string('nationality', 2).notNullable().defaultTo('LK')
    t.string('language', 5).notNullable().defaultTo('en')
    t.enu('status', ['ACTIVE', 'SUSPENDED', 'BANNED', 'LOCKED']).notNullable().defaultTo('ACTIVE')
    t.string('status_reason', 255).nullable()
    t.datetime('id_verified_at').nullable()
    t.datetime('email_verified_at').nullable()
    t.datetime('phone_verified_at').nullable()
    t.text('totp_secret_enc').nullable()
    t.boolean('totp_enabled').notNullable().defaultTo(false)
    t.integer('failed_logins').notNullable().defaultTo(0)
    t.datetime('locked_until').nullable()
    t.datetime('last_login_at').nullable()
    t.string('last_login_ip', 64).nullable()
    t.datetime('payouts_hold_until').nullable()
    t.datetime('password_changed_at').nullable()
    stamps(t, knex)
  })

  await knex.schema.createTable('user_roles', (t) => {
    t.bigIncrements('id')
    t.bigInteger('user_id').unsigned().notNullable().references('users.id').onDelete('CASCADE')
    t.enu('role', ['TRAVELLER', 'DRIVER', 'FLEET', 'SUPPLIER', 'GUIDE', 'ACTIVITY', 'ADVERTISER', 'ADMIN', 'STAFF']).notNullable()
    t.unique(['user_id', 'role'])
    stamps(t, knex)
  })

  await knex.schema.createTable('admin_permissions', (t) => {
    t.bigIncrements('id')
    t.bigInteger('user_id').unsigned().notNullable().references('users.id').onDelete('CASCADE')
    t.enu('permission', ['OWNER', 'FINANCE', 'VERIFICATION', 'SUPPORT', 'MARKETING']).notNullable()
    t.unique(['user_id', 'permission'])
    stamps(t, knex)
  })

  await knex.schema.createTable('profiles', (t) => {
    t.bigInteger('user_id').unsigned().primary().references('users.id').onDelete('CASCADE')
    t.string('photo_key', 200).nullable()
    t.text('bio').nullable()
    t.json('languages').nullable()
    t.integer('years_driving').nullable()
    t.integer('reply_minutes').nullable()
    t.decimal('avg_rating', 3, 2).nullable()
    t.integer('review_count').notNullable().defaultTo(0)
    t.json('badges').nullable()
    t.integer('trips_completed').notNullable().defaultTo(0)
    t.string('base_district', 40).nullable()
    stamps(t, knex)
  })

  await knex.schema.createTable('verifications', (t) => {
    t.bigIncrements('id')
    t.bigInteger('user_id').unsigned().notNullable().references('users.id').onDelete('CASCADE')
    t.enu('type', ['NIC', 'PASSPORT', 'LICENCE', 'SLTDA', 'BUSINESS', 'POLICE', 'BANK', 'VEHICLE']).notNullable()
    t.bigInteger('vehicle_id').unsigned().nullable()
    t.text('number_enc').nullable()
    t.string('number_hash', 64).nullable().index()
    t.json('file_keys').nullable()
    t.json('details').nullable() // what the user entered, plus automatic check results
    t.decimal('face_score', 5, 2).nullable()
    t.date('expires_on').nullable()
    t.enu('status', ['PENDING', 'APPROVED', 'REJECTED', 'RESUBMIT', 'EXPIRED', 'REPLACED']).notNullable().defaultTo('PENDING')
    t.bigInteger('reviewed_by').unsigned().nullable()
    t.datetime('reviewed_at').nullable()
    t.string('reason', 500).nullable()
    t.datetime('due_at').nullable()
    stamps(t, knex)
    t.index(['status', 'due_at'])
  })

  await knex.schema.createTable('preferences', (t) => {
    t.bigInteger('user_id').unsigned().primary().references('users.id').onDelete('CASCADE')
    t.string('budget', 20).nullable()
    t.string('pace', 20).nullable()
    t.string('food', 20).nullable()
    t.string('smoking', 20).nullable()
    t.string('drinking', 20).nullable()
    t.string('wake_time', 20).nullable()
    t.string('room_sharing', 20).nullable()
    stamps(t, knex)
  })

  await knex.schema.createTable('emergency_contacts', (t) => {
    t.bigIncrements('id')
    t.bigInteger('user_id').unsigned().notNullable().references('users.id').onDelete('CASCADE')
    t.string('name', 120).notNullable()
    t.string('phone', 20).notNullable()
    t.string('relationship', 40).nullable()
    stamps(t, knex)
  })

  await knex.schema.createTable('refresh_tokens', (t) => {
    t.bigIncrements('id')
    t.bigInteger('user_id').unsigned().notNullable().references('users.id').onDelete('CASCADE')
    t.string('token_hash', 64).notNullable().unique()
    t.string('device', 255).nullable()
    t.string('ip', 64).nullable()
    t.datetime('last_used_at').nullable()
    t.datetime('expires_at').notNullable()
    t.datetime('revoked_at').nullable()
    stamps(t, knex)
  })

  await knex.schema.createTable('otp_codes', (t) => {
    t.bigIncrements('id')
    t.string('target', 190).notNullable().index()
    t.enu('channel', ['EMAIL', 'SMS']).notNullable()
    t.string('purpose', 30).notNullable()
    t.string('code_hash', 64).notNullable()
    t.integer('tries').notNullable().defaultTo(0)
    t.datetime('expires_at').notNullable()
    t.datetime('used_at').nullable()
    stamps(t, knex)
  })

  await knex.schema.createTable('security_tokens', (t) => {
    t.bigIncrements('id')
    t.bigInteger('user_id').unsigned().notNullable().references('users.id').onDelete('CASCADE')
    t.enu('purpose', ['RESET_EMAIL', 'RESET_SMS', 'NOT_ME']).notNullable()
    t.string('token_hash', 64).notNullable().unique()
    t.string('ip', 64).nullable()
    t.datetime('expires_at').notNullable()
    t.datetime('used_at').nullable()
    stamps(t, knex)
  })

  await knex.schema.createTable('password_history', (t) => {
    t.bigIncrements('id')
    t.bigInteger('user_id').unsigned().notNullable().references('users.id').onDelete('CASCADE')
    t.string('password_hash', 100).notNullable()
    stamps(t, knex)
  })

  await knex.schema.createTable('backup_codes', (t) => {
    t.bigIncrements('id')
    t.bigInteger('user_id').unsigned().notNullable().references('users.id').onDelete('CASCADE')
    t.string('code_hash', 64).notNullable()
    t.datetime('used_at').nullable()
    stamps(t, knex)
  })

  await knex.schema.createTable('consents', (t) => {
    t.bigIncrements('id')
    t.bigInteger('user_id').unsigned().notNullable().references('users.id').onDelete('CASCADE')
    t.string('page', 60).notNullable()
    t.integer('version').notNullable()
    t.string('ip', 64).nullable()
    t.datetime('accepted_at').notNullable()
    stamps(t, knex)
  })

  await knex.schema.createTable('blocks', (t) => {
    t.bigIncrements('id')
    t.bigInteger('user_id').unsigned().notNullable().references('users.id').onDelete('CASCADE')
    t.bigInteger('blocked_user_id').unsigned().notNullable().references('users.id').onDelete('CASCADE')
    t.unique(['user_id', 'blocked_user_id'])
    stamps(t, knex)
  })

  // Development only: emails and SMS are written here instead of being sent
  await knex.schema.createTable('dev_outbox', (t) => {
    t.bigIncrements('id')
    t.enu('channel', ['EMAIL', 'SMS']).notNullable()
    t.string('to', 190).notNullable().index()
    t.string('subject', 255).nullable()
    t.text('body').notNullable()
    stamps(t, knex)
  })
}

export async function down(knex) {
  for (const t of ['dev_outbox', 'blocks', 'consents', 'backup_codes', 'password_history', 'security_tokens', 'otp_codes', 'refresh_tokens', 'emergency_contacts', 'preferences', 'verifications', 'profiles', 'admin_permissions', 'user_roles', 'users']) {
    await knex.schema.dropTableIfExists(t)
  }
}
