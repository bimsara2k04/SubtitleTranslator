import pkg from 'pg';
const { Pool } = pkg;
import { drizzle } from 'drizzle-orm/node-postgres';
import * as schema from './schema.js';
import dotenv from 'dotenv';

dotenv.config();

const connectionString = process.env.DATABASE_URL;

if (!connectionString) {
  console.warn('DATABASE_URL environment variable is not defined. Database functionality will fail if initialized.');
}

export const pool = new Pool({
  connectionString,
});

export const db = drizzle(pool, { schema });
export type DbType = typeof db;
export default db;
