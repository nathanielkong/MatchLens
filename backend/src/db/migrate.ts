import { readFile } from 'node:fs/promises';
import { connect } from './connection.js';
const pool = connect();
const client = await pool.connect();
try {
  await client.query('BEGIN');
  await client.query('SELECT pg_advisory_xact_lock(718041)');
  await client.query('CREATE TABLE IF NOT EXISTS schema_migrations (version integer PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT now())');
  const applied = await client.query('SELECT version FROM schema_migrations WHERE version=1');
  if (!applied.rowCount) {
    await client.query(await readFile(new URL('../../src/db/schema.sql', import.meta.url), 'utf8'));
    await client.query('INSERT INTO schema_migrations(version) VALUES(1)');
  }
  if (!(await client.query('SELECT 1 FROM schema_migrations WHERE version=2')).rowCount) {
    await client.query(await readFile(new URL('../../src/db/002-rich-data.sql', import.meta.url), 'utf8'));
    await client.query('INSERT INTO schema_migrations(version) VALUES(2)');
  }
  if (!(await client.query('SELECT 1 FROM schema_migrations WHERE version=3')).rowCount) {
    await client.query(await readFile(new URL('../../src/db/003-dataset-finalisation.sql', import.meta.url), 'utf8'));
    await client.query('INSERT INTO schema_migrations(version) VALUES(3)');
  }
  if (!(await client.query('SELECT 1 FROM schema_migrations WHERE version=4')).rowCount) {
    await client.query(await readFile(new URL('../../src/db/004-reference-coverage.sql', import.meta.url), 'utf8'));
    await client.query('INSERT INTO schema_migrations(version) VALUES(4)');
  }
  // A separate login prevents replay requests from reading hidden simulation labels.
  const password = process.env.APP_DATABASE_PASSWORD;
  if (!password || !/^[a-f0-9]{48}$/.test(password)) throw new Error('APP_DATABASE_PASSWORD must be a 48-character hexadecimal secret');
  const role = await client.query("SELECT 1 FROM pg_roles WHERE rolname='matchlens_app'");
  if (!role.rowCount) await client.query(`CREATE ROLE matchlens_app LOGIN PASSWORD '${password}'`);
  await client.query('GRANT CONNECT ON DATABASE matchlens TO matchlens_app');
  await client.query('GRANT USAGE ON SCHEMA public TO matchlens_app');
  await client.query('GRANT SELECT ON teams,players,replay_matches,replay_events,replay_lineups,replay_tracking,replay_producer_feed TO matchlens_app');
  await client.query('GRANT EXECUTE ON FUNCTION replay_pressing_sequences(text,integer) TO matchlens_app');
  if (!(await client.query('SELECT 1 FROM schema_migrations WHERE version=5')).rowCount) {
    await client.query(await readFile(new URL('../../src/db/005-ai-runtime.sql', import.meta.url), 'utf8'));
    await client.query('INSERT INTO schema_migrations(version) VALUES(5)');
  }
  if (!(await client.query('SELECT 1 FROM schema_migrations WHERE version=6')).rowCount) {
    await client.query(await readFile(new URL('../../src/db/006-ai-daily-limit-toggle.sql', import.meta.url), 'utf8'));
    await client.query('INSERT INTO schema_migrations(version) VALUES(6)');
  }
  if (!(await client.query('SELECT 1 FROM schema_migrations WHERE version=7')).rowCount) {
    await client.query(await readFile(new URL('../../src/db/007-producer-publication.sql', import.meta.url), 'utf8'));
    await client.query('INSERT INTO schema_migrations(version) VALUES(7)');
  }
  if (!(await client.query('SELECT 1 FROM schema_migrations WHERE version=8')).rowCount) {
    await client.query(await readFile(new URL('../../src/db/008-review-history.sql', import.meta.url), 'utf8'));
    await client.query('INSERT INTO schema_migrations(version) VALUES(8)');
  }
  await client.query('COMMIT');
  console.log('Database schema ready (version 8).');
} catch (error) { await client.query('ROLLBACK'); throw error; }
finally { client.release(); await pool.end(); }
