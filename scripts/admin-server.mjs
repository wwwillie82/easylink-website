import { createPool } from '../src/lib/db/client.mjs';
import { createAdminRepository } from '../src/lib/admin/repository-navigation-delete.mjs';
import { createAdminServer } from '../src/lib/admin/server-navigation-delete.mjs';

const pool = await createPool();
const repo = createAdminRepository(pool);
const port = Number(process.env.SITE_ADMIN_PORT || 4322);
createAdminServer({ repo }).listen(port, () => console.log(`Site admin runtime listening on ${port}`));
