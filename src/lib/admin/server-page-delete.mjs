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

export function isAdminMutation(req, pathname) {
  if (!pathname.startsWith('/api/admin/')) return false;
  if (!['POST', 'PUT', 'PATCH', 'DELETE'].includes(String(req.method || '').toUpperCase())) return false;
  return !['/api/admin/login', '/api/admin/logout'].includes(pathname);
}

export async function withAdminMutationLock(pool, fn) {
  if (!pool?.getConnection) return fn();
  const conn = await pool.getConnection();
  let acquired = false;
  try {
    const [rows] = await conn.query(
      "SELECT GET_LOCK(CONCAT('easylink-site-admin:', DATABASE()), 15) AS acquired",
    );
    acquired = Number(rows?.[0]?.acquired) === 1;
    if (!acquired) {
      const error = new Error('Az admin mentési zár jelenleg foglalt. Próbáld újra.');
      error.code = 'ADMIN_MUTATION_BUSY';
      error.status = 503;
      throw error;
    }
    return await fn();
  } finally {
    if (acquired) {
      try {
        await conn.query("SELECT RELEASE_LOCK(CONCAT('easylink-site-admin:', DATABASE())) AS released");
      } catch {
        // The connection close also releases the advisory lock.
      }
    }
    conn.release();
  }
}

export function createAdminServer({ repo, env = process.env, publishService, pool = null } = {}) {
  if (!repo) throw new Error('createAdminServer requires repo');
  const publisher = publishService || createPublishService({ repo, env });
  const server = createBaseAdminServer({ repo, env, publishService: publisher });
  const [baseRequestHandler] = server.listeners('request');
  if (typeof baseRequestHandler !== 'function') throw new Error('Base admin request handler is missing');
  server.removeAllListeners('request');

  server.on('request', async (req, res) => {
    const url = new URL(req.url, 'http://localhost');
    const pageDeleteMatch = /^\/api\/admin\/pages\/(\d+)$/.exec(url.pathname);

    const execute = async () => {
      if (!pageDeleteMatch || req.method !== 'DELETE') return baseRequestHandler(req, res);

      try {
        const auth = await authorizeAdminRequest({ req, res, repo, env });
        if (!auth.ok) return;
        const user = auth.context.user;
        const data = await repo.deletePage(pageDeleteMatch[1]);
        if (!data) return apiError(res, 404, 'PAGE_NOT_FOUND', 'Az oldal nem található.');

        let publish;
        try {
          publish = await publisher.publish({ adminId: user.id, label: `Oldal törlés: ${data.id}` });
        } catch (error) {
          if (error instanceof PublishInProgressError || error.code === 'PUBLISH_IN_PROGRESS') {
            publish = {
              ok: false,
              status: 'publish_in_progress',
              contentSaved: true,
              liveUnchanged: true,
              error: error.message,
            };
          } else {
            throw error;
          }
        }

        return json(res, 200, {
          ok: true,
          data: {
            id: Number(data.id),
            title: data.title || '',
            route: data.route || '',
            deletedBlockCount: Number(data.deletedBlockCount || 0),
          },
          publish,
        });
      } catch (error) {
        if (error.status === 409) return apiError(res, 409, error.code || 'PAGE_DELETE_CONFLICT', error.message, error.details);
        if (error.status === 400 || error.code === 'VALIDATION_ERROR') return apiError(res, 400, error.code || 'INVALID_PAGE_DELETE', error.message);
        return apiError(res, error.status || 500, error.code || 'PAGE_DELETE_FAILED', error.message || 'Az oldal törlése sikertelen.');
      }
    };

    if (!isAdminMutation(req, url.pathname)) return execute();

    try {
      return await withAdminMutationLock(pool, execute);
    } catch (error) {
      if (res.headersSent) return;
      return apiError(
        res,
        error.status || 500,
        error.code || 'ADMIN_MUTATION_LOCK_FAILED',
        error.message || 'Az admin mentési zár nem foglalható.',
      );
    }
  });

  return server;
}
