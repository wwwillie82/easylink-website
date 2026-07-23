import { spawnSync } from 'node:child_process';

const tests = [
  'tests/public-composition-smoke.mjs',
  'tests/cards-block-renderer-smoke.mjs',
  'tests/integrations-renderer-regression-smoke.mjs',
  'tests/contact-renderer-admin-parity-smoke.mjs',
  'tests/cta-render-regression-smoke.mjs',
  'tests/cta-four-buttons-header-toggle-smoke.mjs',
];

for (const file of tests) {
  const result = spawnSync(process.execPath, [file], {
    cwd: process.cwd(),
    encoding: 'utf8',
    env: process.env,
  });
  if (result.status !== 0) {
    console.error(`COMPOSITION_FAILURE: ${file}`);
    if (result.stdout?.trim()) console.error(`STDOUT:\n${result.stdout.trim()}`);
    if (result.stderr?.trim()) console.error(`STDERR:\n${result.stderr.trim()}`);
    process.exit(result.status || 1);
  }
  console.log(`COMPOSITION_PASS: ${file}`);
}

console.log('Composition diagnostic first half passed.');
