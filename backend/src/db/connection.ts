import 'dotenv/config';
import pg from 'pg';
export function connect(role: 'admin' | 'app' = 'admin') {
  const connectionString = process.env[role === 'app' ? 'APP_DATABASE_URL' : 'DATABASE_URL'];
  if (!connectionString) throw new Error(`Missing ${role === 'app' ? 'APP_DATABASE_URL' : 'DATABASE_URL'}`);
  return new pg.Pool({ connectionString, max: 5, connectionTimeoutMillis: 10000 });
}
