import { fileURLToPath } from 'node:url';
import { readFile } from 'node:fs/promises';
import { createPool } from '../src/lib/db/client.mjs';

export async function indexExists(pool, table, indexName) {
  const [rows] = await pool.query('SELECT INDEX_NAME FROM INFORMATION_SCHEMA.STATISTICS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND INDEX_NAME = ? LIMIT 1', [table, indexName]);
  return Boolean(rows[0]);
}

export async function columnExists(pool, table, columnName) {
  const [rows] = await pool.query('SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND COLUMN_NAME = ? LIMIT 1', [table, columnName]);
  return Boolean(rows[0]);
}

export async function foreignKeyExists(pool, table, constraintName) {
  const [rows] = await pool.query('SELECT CONSTRAINT_NAME FROM INFORMATION_SCHEMA.TABLE_CONSTRAINTS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND CONSTRAINT_TYPE = ? AND CONSTRAINT_NAME = ? LIMIT 1', [table, 'FOREIGN KEY', constraintName]);
  return Boolean(rows[0]);
}

export async function ensureNavigationTargetSchema(pool) {
  if (!(await columnExists(pool, 'site_navigation_items', 'target_type'))) await pool.query("ALTER TABLE site_navigation_items ADD COLUMN target_type VARCHAR(32) NOT NULL DEFAULT 'legacy'");
  if (!(await columnExists(pool, 'site_navigation_items', 'target_page_id'))) await pool.query('ALTER TABLE site_navigation_items ADD COLUMN target_page_id BIGINT UNSIGNED NULL');
  if (!(await columnExists(pool, 'site_navigation_items', 'title_override'))) await pool.query('ALTER TABLE site_navigation_items ADD COLUMN title_override VARCHAR(255) NULL');
  await pool.query("UPDATE site_navigation_items SET target_type='legacy', target_page_id=NULL, title_override=NULL WHERE target_type IS NULL OR target_type NOT IN ('legacy','page','external')");
  await pool.query("UPDATE site_navigation_items SET target_type='legacy', target_page_id=NULL, title_override=NULL WHERE target_type='page' AND (target_page_id IS NULL OR target_page_id <= 0 OR NOT EXISTS (SELECT 1 FROM site_pages WHERE site_pages.id = site_navigation_items.target_page_id))");
  await pool.query("UPDATE site_navigation_items SET target_page_id=NULL, title_override=NULL WHERE target_type IN ('legacy','external')");
  if (!(await indexExists(pool, 'site_navigation_items', 'idx_site_navigation_items_target_page'))) await pool.query('CREATE INDEX idx_site_navigation_items_target_page ON site_navigation_items (target_page_id)');
  if (!(await foreignKeyExists(pool, 'site_navigation_items', 'fk_site_navigation_items_target_page'))) await pool.query('ALTER TABLE site_navigation_items ADD CONSTRAINT fk_site_navigation_items_target_page FOREIGN KEY (target_page_id) REFERENCES site_pages(id) ON DELETE RESTRICT');
}

export async function ensureMediaIndexes(pool) {
  if (!(await indexExists(pool, 'site_media_assets', 'idx_site_media_processing_claim'))) await pool.query('CREATE INDEX idx_site_media_processing_claim ON site_media_assets (processing_status, status, processing_started_at, id)');
}

export async function migrate({ pool, dryRun = false } = {}) {
  const sql = await readFile(new URL('../src/lib/db/schema.sql', import.meta.url), 'utf8');
  if (dryRun) return sql;
  for (const stmt of sql.split(/;\s*\n/).map((s) => s.trim()).filter(Boolean)) await pool.query(stmt);
  await ensureNavigationTargetSchema(pool);
  await ensureMediaIndexes(pool);
  return 'MariaDB schema migration completed.';
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const dryRun = process.argv.includes('--dry-run');
  if (dryRun) { console.log(await migrate({ dryRun: true })); process.exit(0); }
  const pool = await createPool();
  try { console.log(await migrate({ pool })); }
  finally { await pool.end(); }
}
