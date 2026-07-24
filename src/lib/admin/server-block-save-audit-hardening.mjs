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

function normalizePageContext(value = null) {
  const page = value?.page || value || null;
  const id = positiveId(page?.id);
  if (!id) return null;
  return {
    id,
    title: nonEmpty(page?.title),
    route: nonEmpty(page?.route),
  };
}

export function enrichBlockAuditRow(row = {}, payload = null, pageContext = null) {
  if (!payload || (row.target_type !== 'block' && !String(row.event_code || '').startsWith('admin_block_'))) return row;

  const blockId = positiveId(payload.id) ?? positiveId(row.target_id);
  const pageId = positiveId(payload.page_id) ?? positiveId(pageContext?.id);
  const blockType = nonEmpty(payload.type);
  const targetLabel = nonEmpty(row.target_label) || nonEmpty(payload.title) || blockType;
  const metadata = { ...(row.metadata_json || {}) };

  if (blockId !== null) metadata.blockId = blockId;
  if (pageId !== null) metadata.pageId = pageId;
  if (blockType) metadata.blockType = blockType;
  if (pageContext?.title) metadata.pageTitle = pageContext.title;
  if (pageContext?.route) metadata.pageRoute = pageContext.route;

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
      const payload = context?.blockPayload || null;
      let pageContext = context?.pageContext || null;
      const pageId = positiveId(payload?.page_id);
      if (!pageContext && pageId && typeof repo.page === 'function') {
        try {
          pageContext = normalizePageContext(await repo.page.call(repo, pageId));
          if (context) context.pageContext = pageContext;
        } catch {
          pageContext = null;
        }
      }
      return repo.insertAuditEvent.call(repo, enrichBlockAuditRow(row, payload, pageContext));
    },
  };

  const server = baseServerFactory({ ...options, repo: wrappedRepo });
  const [baseRequestHandler] = server.listeners('request');
  if (typeof baseRequestHandler !== 'function') throw new Error('Base admin request handler is missing');
  server.removeAllListeners('request');
  server.on('request', (req, res) => requestContext.run({ blockPayload: null, pageContext: null }, () => baseRequestHandler(req, res)));
  return server;
}
