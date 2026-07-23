import { spawnSync } from 'node:child_process';

const result = spawnSync(process.execPath, ['tests/public-composition-smoke.mjs'], {
  cwd: process.cwd(),
  encoding: 'utf8',
  env: process.env,
});
process.exit(result.status || 0);
