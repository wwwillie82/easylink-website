import assert from 'node:assert/strict';
import { parseAdoptHomeGenericArgs } from '../src/lib/content/home-adopt-cli.mjs';
for (const argv of [
  ['--reconcile-extra-ids'], ['--reconcile-extra-ids','abc'], ['--reconcile-extra-ids','1,abc'], ['--reconcile-extra-ids','1,,2'], ['--reconcile-extra-ids','0'], ['--reconcile-extra-ids','-1'], ['--reconcile-extra-ids','1.5'], ['--reconcile-extra-ids','1,1'], ['--reconcile-extra-ids','abc','--apply','--yes'], ['--wat'],
]) assert.throws(()=>parseAdoptHomeGenericArgs(argv));
const reconcileDryRun = parseAdoptHomeGenericArgs(['--reconcile-extra-ids','1,2']);
assert.deepEqual(reconcileDryRun.reconcileIds, [1,2]);
assert.equal(reconcileDryRun.mode, 'reconcile-dry-run');
assert.equal(parseAdoptHomeGenericArgs(['--reconcile-extra-ids','1','--apply','--yes']).mode, 'reconcile-apply');
assert.equal(parseAdoptHomeGenericArgs(['--apply']).mode, 'apply');
console.log('home adopt CLI parser smoke ok');
