import assert from 'node:assert/strict';
import { createAdminRepository } from '../src/lib/admin/repository.mjs';

function poolWith({ existing }) {
  const calls = [];
  return {
    calls,
    async query(sql, params) {
      calls.push({ kind: 'query', sql, params });
      if (/SELECT \* FROM site_content_blocks WHERE id=\? LIMIT 1/.test(sql)) return [[existing].filter(Boolean), null];
      return [[], null];
    },
    async execute(sql, params) {
      calls.push({ kind: 'execute', sql, params });
      return [{ affectedRows: 1, insertId: 777 }, null];
    },
  };
}

const pageCta = { id: 10, page_id: 1, block_key: 'golden:cta-section', type: 'cta', title: 'Old', body: 'Old body', items: JSON.stringify([{ presentationRole: 'cta-section', ctaMode: 'custom', label: 'Old', url: '/old/' }]), sort_order: 900, status: 'published' };

{
  const pool = poolWith({ existing: pageCta });
  const repo = createAdminRepository(pool);
  await assert.rejects(() => repo.upsertBlock({ id: 10, page_id: 1, type: 'text', title: 'Spoof', body: 'Bad', items: '[]', sort_order: 1, status: 'draft' }), /Page CTA blokk típusa nem módosítható/);
}

{
  const pool = poolWith({ existing: pageCta });
  const repo = createAdminRepository(pool);
  await assert.rejects(() => repo.upsertBlock({ id: 10, page_id: 1, type: 'cta', title: 'Bad', body: 'Bad', items: JSON.stringify([{ presentationRole: 'cta-section', ctaMode: 'invalid', label: 'L', url: '/ok/' }]), sort_order: 900, status: 'published' }), /Ismeretlen CTA mód/);
}

{
  const manual = { id: 20, page_id: 1, block_key: 'manual:inline', type: 'cta', title: 'Manual', body: '', items: JSON.stringify([{ label: 'Manual' }]), sort_order: 20, status: 'published' };
  const pool = poolWith({ existing: manual });
  const repo = createAdminRepository(pool);
  await repo.upsertBlock({ id: 20, page_id: 1, type: 'cta', title: 'Manual', body: '', items: JSON.stringify([{ label: 'Manual' }]), sort_order: 20, status: 'published' });
  const update = pool.calls.find((call) => call.kind === 'execute' && /UPDATE site_content_blocks/.test(call.sql));
  assert.equal(update.params[0], 'cta');
  assert.equal(update.params[1], 'Manual');
  assert.equal(update.params[2], '');
  assert.deepEqual(JSON.parse(update.params[3]), [{ label: 'Manual' }], 'manual inline CTA must not receive ctaMode');
}

{
  const pool = poolWith({ existing: pageCta });
  const repo = createAdminRepository(pool);
  await repo.upsertBlock({ id: 10, page_id: 1, type: 'cta', title: 'Custom', body: 'Custom body', items: JSON.stringify([{ presentationRole: 'cta-section', ctaMode: 'custom', label: 'Primary', url: '/primary/' }]), sort_order: 900, status: 'draft' });
  const update = pool.calls.find((call) => call.kind === 'execute' && /UPDATE site_content_blocks/.test(call.sql));
  assert.equal(update.params[0], 'cta');
  assert.equal(update.params[1], 'Custom');
  assert.equal(update.params[2], 'Custom body');
  assert.notEqual(update.params[1], undefined);
  assert.notEqual(update.params[2], undefined);
  assert.equal(update.params[5], 'published', 'page CTA status is forced to published');
  assert.equal(JSON.parse(update.params[3])[0].ctaMode, 'custom');
}


{
  const pricing = { id: 30, page_id: 1, block_key: '/arak/:cta:2', type: 'cta', title: 'Pricing', body: '', items: JSON.stringify([{ presentationRole: 'pricing-cta', ctaMode: 'custom', label: 'Old', url: '/old/' }]), sort_order: 900, status: 'published' };
  const pool = poolWith({ existing: pricing });
  const repo = createAdminRepository(pool);
  await repo.upsertBlock({ id: 30, page_id: 1, type: 'cta', title: 'Pricing', body: '', items: JSON.stringify([{ ctaMode: 'custom', label: 'Primary', url: '/primary/' }]), sort_order: 900, status: 'draft' });
  const update = pool.calls.find((call) => call.kind === 'execute' && /UPDATE site_content_blocks/.test(call.sql));
  const saved = JSON.parse(update.params[3])[0];
  assert.equal(saved.presentationRole, 'pricing-cta', 'existing pricing CTA role is restored when omitted from payload');
  assert.equal(update.params[5], 'published');
}

{
  const roleOnly = { id: 40, page_id: 1, block_key: 'manual:role-only', type: 'cta', title: 'Role', body: '', items: JSON.stringify([{ presentationRole: 'cta-section', ctaMode: 'global' }]), sort_order: 900, status: 'published' };
  const pool = poolWith({ existing: roleOnly });
  const repo = createAdminRepository(pool);
  await assert.rejects(() => repo.upsertBlock({ id: 40, page_id: 1, type: 'text', title: 'Bad', body: '', items: JSON.stringify([{ ctaMode: 'global' }]), sort_order: 900, status: 'published' }), /Page CTA blokk típusa nem módosítható/);
}

{
  const pricing = { id: 50, page_id: 1, block_key: '/arak/:cta:2', type: 'cta', title: 'Pricing', body: '', items: JSON.stringify([{ presentationRole: 'pricing-cta', ctaMode: 'global' }]), sort_order: 900, status: 'published' };
  const pool = poolWith({ existing: pricing });
  const repo = createAdminRepository(pool);
  await assert.rejects(() => repo.upsertBlock({ id: 50, page_id: 1, type: 'cta', title: 'Bad', body: '', items: JSON.stringify([{ presentationRole: 'pricing-cta', ctaMode: 'invalid' }]), sort_order: 900, status: 'published' }), /Ismeretlen CTA mód/);
}


{
  const manual = { id: 60, page_id: 1, block_key: 'manual:inline', type: 'cta', title: 'Manual', body: '', items: JSON.stringify([{ label: 'Manual' }]), sort_order: 20, status: 'published' };
  const pool = poolWith({ existing: manual });
  const repo = createAdminRepository(pool);
  await assert.rejects(() => repo.upsertBlock({ id: 60, page_id: 1, type: 'cta', title: 'Manual', body: '', items: JSON.stringify([{ presentationRole: 'cta-section', label: 'Manual' }]), sort_order: 20, status: 'published' }), /Manual inline CTA nem alakítható page CTA-vá/);
}

{
  const manual = { id: 61, page_id: 1, block_key: 'manual:inline', type: 'cta', title: 'Manual', body: '', items: JSON.stringify([{ label: 'Manual' }]), sort_order: 20, status: 'published' };
  const pool = poolWith({ existing: manual });
  const repo = createAdminRepository(pool);
  await assert.rejects(() => repo.upsertBlock({ id: 61, page_id: 1, type: 'cta', title: 'Manual', body: '', items: JSON.stringify([{ role: 'pricing-cta', label: 'Manual' }]), sort_order: 20, status: 'published' }), /Manual inline CTA nem alakítható page CTA-vá/);
}

console.log('Repository CTA contract smoke passed');
