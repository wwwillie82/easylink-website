import { readFile } from 'node:fs/promises';
import { createPool } from '../src/lib/db/client.mjs';
const dryRun = process.argv.includes('--dry-run');
const sql = await readFile(new URL('../src/lib/db/schema.sql', import.meta.url), 'utf8');
if (dryRun) { console.log(sql); process.exit(0); }
const pool = await createPool();
for (const stmt of sql.split(/;\s*\n/).map((s) => s.trim()).filter(Boolean)) await pool.query(stmt);
const [indexes] = await pool.query("SELECT INDEX_NAME FROM INFORMATION_SCHEMA.STATISTICS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'site_media_assets' AND INDEX_NAME = 'idx_site_media_processing_claim' LIMIT 1");
if (!indexes[0]) await pool.query('CREATE INDEX idx_site_media_processing_claim ON site_media_assets (processing_status, status, processing_started_at, id)');
await pool.end();
console.log('MariaDB schema migration completed.');
