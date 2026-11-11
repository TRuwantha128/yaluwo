// Route legs can now come from OpenStreetMap road routing (source "OSM"):
// real road distances with no Google key. Google stays first when a key is set.
export async function up(knex) {
  await knex.raw(`ALTER TABLE trip_legs DROP CONSTRAINT IF EXISTS trip_legs_source_check`)
  await knex.raw(`ALTER TABLE trip_legs ADD CONSTRAINT trip_legs_source_check CHECK (source IN ('GOOGLE', 'OSM', 'ESTIMATE', 'TIMETABLE', 'MANUAL'))`)
  await knex.raw(`ALTER TABLE trips DROP CONSTRAINT IF EXISTS trips_route_source_check`)
  await knex.raw(`ALTER TABLE trips ADD CONSTRAINT trips_route_source_check CHECK (route_source IN ('GOOGLE', 'OSM', 'ESTIMATE'))`)
}

export async function down(knex) {
  await knex.raw(`UPDATE trip_legs SET source = 'ESTIMATE' WHERE source = 'OSM'`)
  await knex.raw(`UPDATE trips SET route_source = 'ESTIMATE' WHERE route_source = 'OSM'`)
  await knex.raw(`ALTER TABLE trip_legs DROP CONSTRAINT IF EXISTS trip_legs_source_check`)
  await knex.raw(`ALTER TABLE trip_legs ADD CONSTRAINT trip_legs_source_check CHECK (source IN ('GOOGLE', 'ESTIMATE', 'TIMETABLE', 'MANUAL'))`)
  await knex.raw(`ALTER TABLE trips DROP CONSTRAINT IF EXISTS trips_route_source_check`)
  await knex.raw(`ALTER TABLE trips ADD CONSTRAINT trips_route_source_check CHECK (route_source IN ('GOOGLE', 'ESTIMATE'))`)
}
