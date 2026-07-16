import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { createPool } from '../src/lib/db/client.mjs';
import { createAdminRepository } from '../src/lib/admin/repository.mjs';
import { createPublishService } from '../src/lib/admin/publish.mjs';

async function loadEnvFile(filePath, { required = false } = {}) {
  let raw;
  try { raw = await readFile(filePath, 'utf8'); }
  catch (error) {
    if (required) throw new Error(`Required env file is not readable: ${filePath}`);
    return false;
  }
  for (const line of raw.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const match = /^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/.exec(trimmed);
    if (!match || process.env[match[1]] !== undefined) continue;
    let value = match[2].trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) value = value.slice(1, -1);
    process.env[match[1]] = value;
  }
  return true;
}

if (process.env.SITE_ADMIN_ENV_FILE) await loadEnvFile(process.env.SITE_ADMIN_ENV_FILE, { required: true });
for (const file of ['.env.local', '.env']) await loadEnvFile(resolve(process.cwd(), file));

const label = process.argv.slice(2).join(' ') || process.env.SITE_PUBLISH_LABEL || 'Deploy utáni DB publish';
process.env.SITE_CONTENT_SOURCE ||= 'db';
process.env.SITE_PUBLISH_REPO_DIR ||= process.cwd();

const pool = await createPool();
try {
  const repo = createAdminRepository(pool);
  const service = createPublishService({ repo, env: process.env });
  const result = await service.publish({ adminId: null, label });
  if (!result.ok) {
    console.error(`Admin DB publish failed: ${result.error || result.status || 'unknown error'}`);
    process.exitCode = 1;
  } else {
    console.log(`Admin DB publish passed: snapshot ${result.snapshotId}, hash ${result.content_hash}`);
  }
} finally {
  await pool.end();
}
