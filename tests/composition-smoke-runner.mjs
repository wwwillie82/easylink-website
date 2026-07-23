import { spawnSync } from 'node:child_process';

const tests = [
  'tests/public-composition-smoke.mjs',
  'tests/cards-block-renderer-smoke.mjs',
  'tests/integrations-renderer-regression-smoke.mjs',
];

for (const file of tests) {
  const result = spawnSync(process.execPath, [file], {
    cwd: process.cwd(),
    encoding: 'utf8',
    env: process.env,
  });
  if (result.status !== 0) process.exit(result.status || 1);
}
