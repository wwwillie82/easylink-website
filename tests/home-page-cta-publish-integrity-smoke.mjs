import assert from 'node:assert/strict';
import { validatePublishedHomeBlocksForSnapshot } from '../src/lib/content/home-blocks.mjs';
const page = { id: 1, route: '/', type: 'home', status: 'published', title: 'Home', hero_eyebrow: 'Ey', hero_title: 'Title', hero_description: 'Desc', hero_asset: '/hero.webp' };
const hero = { id: 10, page_id: 1, block_key: 'home:hero-meta', type: 'hero-meta', title: 'Hero', body: '', items: '[]', sort_order: 0, status: 'published' };
const golden = { id: 100, page_id: 1, block_key: 'golden:cta-section', type: 'cta', title: 'Golden', body: '', items: JSON.stringify([{ presentationRole: 'cta-section', ctaMode: 'global' }]), sort_order: 900, status: 'published' };
const pricing = { id: 101, page_id: 1, block_key: 'pricing:cta', type: 'cta', title: 'Pricing', body: '', items: JSON.stringify([{ presentationRole: 'pricing-cta', ctaMode: 'global' }]), sort_order: 901, status: 'published' };
const legacy = { id: 102, page_id: 1, block_key: '/:cta:4', type: 'cta', title: 'Legacy', body: '', items: JSON.stringify([{ ctaMode: 'global' }]), sort_order: 902, status: 'published' };
const inline = { id: 103, page_id: 1, block_key: 'manual:inline-cta', type: 'cta', title: 'Inline', body: '', items: JSON.stringify([{ label: 'Go', url: '/go/' }]), sort_order: 25, status: 'published' };
const manual = { id: 104, page_id: 1, block_key: 'manual:text', type: 'text', title: 'Manual', body: 'Body', items: '[]', sort_order: 26, status: 'published' };
const validate = (blocks) => validatePublishedHomeBlocksForSnapshot({ pages: [page], blocks });
assert.deepEqual(validate([hero, golden]), []);
assert.deepEqual(validate([hero, inline]), []);
assert.deepEqual(validate([hero, golden, manual]), []);
for (const conflictBlocks of [[hero, golden, pricing], [hero, golden, legacy]]) {
  const errors = validate(conflictBlocks);
  assert.equal(errors[0]?.code, 'CTA_INTEGRITY_ERROR');
  assert(errors[0].details.some((row) => row.key === 'golden:cta-section' && row.status === 'published' && row.roles.length));
}
console.log('home page CTA publish integrity smoke ok');
