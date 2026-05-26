import { Pool, types } from 'pg';
import dotenv from 'dotenv';

dotenv.config();

// Parse NUMERIC/DECIMAL (OID 1700) as JS number instead of string
types.setTypeParser(1700, (val) => parseFloat(val));
// Parse INT8/BIGINT (OID 20) as JS number
types.setTypeParser(20, (val) => parseInt(val, 10));

export const pool = new Pool({
  connectionString: process.env.DATABASE_URL || 'postgresql://estimation_user:estimation_pass@localhost:5432/estimation_db',
  max: 20,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 2000,
});

pool.on('error', (err) => {
  console.error('Unexpected error on idle client', err);
});

export async function query<T = unknown>(text: string, params?: unknown[]): Promise<T[]> {
  const client = await pool.connect();
  try {
    const result = await client.query(text, params);
    return result.rows as T[];
  } finally {
    client.release();
  }
}

export async function queryOne<T = unknown>(text: string, params?: unknown[]): Promise<T | null> {
  const rows = await query<T>(text, params);
  return rows[0] ?? null;
}
