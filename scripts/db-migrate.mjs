import { readFile } from 'node:fs/promises';
import { createPool } from '../src/lib/db/client.mjs';
const dryRun = process.argv.includes('--dry-run');
const sql = await readFile(new URL('../src/lib/db/schema.sql', import.meta.url), 'utf8');
if (dryRun) { console.log(sql); process.exit(0); }
const pool = await createPool();
for (const stmt of sql.split(/;\s*\n/).map((s) => s.trim()).filter(Boolean)) await pool.query(stmt);
await pool.end();
console.log('MariaDB schema migration completed.');
