import { createPool } from '../src/lib/db/client.mjs';
import { createAdminRepository } from '../src/lib/admin/repository-users-hardening.mjs';
import { createAdminServer } from '../src/lib/admin/server-audit-hardening.mjs';

const pool = await createPool();
const repo = createAdminRepository(pool);
const port = Number(process.env.SITE_ADMIN_PORT || 4322);
createAdminServer({ repo, pool }).listen(port, () => console.log(`Site admin runtime listening on ${port}`));
