import { createAdminServer as createBaseAdminServer } from './server-navigation-delete.mjs';
import { createPublishService, PublishInProgressError } from './publish.mjs';
import { authorizeAdminRequest } from './policy.mjs';

function json(res, status, body) {
  res.writeHead(status, { 'content-type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify(body));
}

function apiError(res, status, code, message, details) {
  return json(res, status, { ok: false, error: { code, message, ...(details ? { details } : {}) } });
}


export function createAdminServer({ repo, env = process.env, publishService } = {}) {
  if (!repo) throw new Error('createAdminServer requires repo');
  const publisher = publishService || createPublishService({ repo, env });
  const server = createBaseAdminServer({ repo, env, publishService: publisher });
  const [baseRequestHandler] = server.listeners('request');
  if (typeof baseRequestHandler !== 'function') throw new Error('Base admin request handler is missing');
  server.removeAllListeners('request');
  server.on('request', async (req, res) => {
    const url = new URL(req.url, 'http://localhost');
    const match = /^\/api\/admin\/pages\/(\d+)$/.exec(url.pathname);
    if (!match || req.method !== 'DELETE') return baseRequestHandler(req, res);
    try {
      const auth = await authorizeAdminRequest({ req, res, repo, env });
      if (!auth.ok) return;
      const user = auth.context.user;
      const data = await repo.deletePage(match[1]);
      if (!data) return apiError(res, 404, 'PAGE_NOT_FOUND', 'Az oldal nem található.');
      let publish;
      try {
        publish = await publisher.publish({ adminId: user.id, label: `Oldal törlés: ${data.id}` });
      } catch (error) {
        if (error instanceof PublishInProgressError || error.code === 'PUBLISH_IN_PROGRESS') publish = { ok: false, status: 'publish_in_progress', contentSaved: true, liveUnchanged: true, error: error.message };
        else throw error;
      }
      return json(res, 200, {
        ok: true,
        data: { id: Number(data.id), title: data.title || '', route: data.route || '', deletedBlockCount: Number(data.deletedBlockCount || 0) },
        publish,
      });
    } catch (error) {
      if (error.status === 409) return apiError(res, 409, error.code || 'PAGE_DELETE_CONFLICT', error.message, error.details);
      if (error.status === 400 || error.code === 'VALIDATION_ERROR') return apiError(res, 400, error.code || 'INVALID_PAGE_DELETE', error.message);
      return apiError(res, 500, 'PAGE_DELETE_FAILED', error.message || 'Az oldal törlése sikertelen.');
    }
  });
  return server;
}
