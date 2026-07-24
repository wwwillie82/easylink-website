import { AsyncLocalStorage } from 'node:async_hooks';
import { createAdminServer as createAuditAdminServer } from './server-audit-hardening.mjs';

function positiveId(value) {
  const id = Number(value);
  return Number.isSafeInteger(id) && id > 0 ? id : null;
}

function nonEmpty(value) {
  const text = String(value ?? '').trim();
  return text || null;
}

export function enrichBlockAuditRow(row = {}, payload = null) {
  if (!payload || (row.target_type !== 'block' && !String(row.event_code || '').startsWith('admin_block_'))) return row;

  const blockId = positiveId(payload.id) ?? positiveId(row.target_id);
  const pageId = positiveId(payload.page_id);
  const blockType = nonEmpty(payload.type);
  const targetLabel = nonEmpty(row.target_label) || nonEmpty(payload.title) || blockType;
  const metadata = { ...(row.metadata_json || {}) };

  if (blockId !== null) metadata.blockId = blockId;
  if (pageId !== null) metadata.pageId = pageId;
  if (blockType) metadata.blockType = blockType;

  return {
    ...row,
    target_id: row.target_id ?? blockId,
    target_label: targetLabel,
    metadata_json: metadata,
  };
}

export function createAdminServer({
  repo,
  baseServerFactory = createAuditAdminServer,
  ...options
} = {}) {
  if (!repo) throw new Error('createAdminServer requires repo');

  const requestContext = new AsyncLocalStorage();
  const wrappedRepo = {
    ...repo,
    async upsertBlock(payload) {
      const context = requestContext.getStore();
      if (context) context.blockPayload = payload;
      return repo.upsertBlock.call(repo, payload);
    },
    async insertAuditEvent(row) {
      const context = requestContext.getStore();
      return repo.insertAuditEvent.call(repo, enrichBlockAuditRow(row, context?.blockPayload || null));
    },
  };

  const server = baseServerFactory({ ...options, repo: wrappedRepo });
  const [baseRequestHandler] = server.listeners('request');
  if (typeof baseRequestHandler !== 'function') throw new Error('Base admin request handler is missing');
  server.removeAllListeners('request');
  server.on('request', (req, res) => requestContext.run({ blockPayload: null }, () => baseRequestHandler(req, res)));
  return server;
}
