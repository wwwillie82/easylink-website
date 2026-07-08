import { createPool } from '../src/lib/db/client.mjs';
const pool = await createPool();
const [rows] = await pool.query('SELECT 1 AS ok');
await pool.end();
console.log(`DB check passed: ${rows[0].ok}`);
