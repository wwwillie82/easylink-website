import { createPool } from '../src/lib/db/client.mjs';
import { createAdminRepository } from '../src/lib/admin/repository.mjs';
import { runMediaWorker } from '../src/lib/admin/video-processing.mjs';

const once = process.argv.includes('--once');
const controller = new AbortController();
for (const signalName of ['SIGTERM', 'SIGINT']) process.once(signalName, () => { console.log(`Media worker received ${signalName}, shutting down...`); controller.abort(); });

const pool = await createPool();
try {
  const repo = createAdminRepository(pool);
  const result = await runMediaWorker({ repo, once, signal: controller.signal, logger: console });
  console.log(`Media worker finished: processed=${result.processed}${result.stopped ? ' stopped=true' : ''}`);
  if (!result.ok) process.exitCode = once ? 1 : 0;
} finally { await pool.end(); }
