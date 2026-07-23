import { createAdminServer as createBaseAdminServer, withAdminMutationLock } from './server-page-delete.mjs';
import { authorizeAdminRequest } from './policy.mjs';
import { clearAuthCookies } from './auth.mjs';
import { parsedBody } from './request-body.mjs';
import { hasAction } from './permissions.mjs';
import { classifyUserMutation } from './users.mjs';
import { issuePasswordReset } from './password-reset.mjs';

function json(res, status, body, headers = {}) {
  res.writeHead(status, { 'content-type': 'application/json; charset=utf-8', ...headers });
  res.end(JSON.stringify(body));
}

function apiError(res, status, code, message, details) {
  return json(res, status, { ok: false, error: { code, message, ...(details ? { details } : {}) } });
}

function isUsersApi(pathname) {
  return pathname === '/api/admin/users'
    || /^\/api\/admin\/users\/\d+(?:\/(?:revoke-sessions|send-reset-link))?$/.test(pathname);
}

function isMutation(method) {
  return ['POST', 'PUT', 'PATCH', 'DELETE'].includes(String(method || '').toUpperCase());
}

export function createAdminServer({ repo, env = process.env, publishService, pool = null } = {}) {
  if (!repo) throw new Error('createAdminServer requires repo');
  const server = createBaseAdminServer({ repo, env, publishService, pool });
  const [baseRequestHandler] = server.listeners('request');
  if (typeof baseRequestHandler !== 'function') throw new Error('Base admin request handler is missing');
  server.removeAllListeners('request');

  server.on('request', async (req, res) => {
    const url = new URL(req.url, 'http://localhost');
    if (!isUsersApi(url.pathname)) return baseRequestHandler(req, res);

    const execute = async () => {
      try {
        const auth = await authorizeAdminRequest({ req, res, repo, env });
        if (!auth.ok) return;
        const context = auth.context;
        const actor = context.user;

        if (url.pathname === '/api/admin/users') {
          if (req.method === 'GET') {
            const rows = await repo.listAdminUsers();
            return json(res, 200, {
              ok: true,
              data: rows.map((row) => ({ ...row, is_self: Number(row.id) === Number(actor.id) })),
            });
          }

          if (req.method === 'POST') {
            const created = await repo.createAdminUserWithPermissions(await parsedBody(req));
            let reset = { ok: true };
            try {
              await issuePasswordReset(repo, created, {
                env,
                requestedIp: req.socket?.remoteAddress || null,
              });
            } catch (error) {
              reset = {
                ok: false,
                code: error.code || 'SEND_FAILED',
                message: error.message || 'A felhasználó létrejött, de a jelszóbeállító link küldése sikertelen.',
              };
            }
            return json(res, 200, { ok: true, data: { ...created, is_self: false }, reset });
          }
        }

        const match = /^\/api\/admin\/users\/(\d+)(?:\/(revoke-sessions|send-reset-link))?$/.exec(url.pathname);
        if (!match) return apiError(res, 404, 'NOT_FOUND', 'Not found');
        const adminUserId = Number(match[1]);
        const action = match[2] || '';

        if (action === 'revoke-sessions' && req.method === 'POST') {
          const result = await repo.revokeAdminUserSessions(adminUserId);
          const selfRevoked = adminUserId === Number(actor.id);
          return json(
            res,
            200,
            { ok: true, data: { ...result, selfRevoked } },
            selfRevoked ? { 'set-cookie': clearAuthCookies(env) } : {},
          );
        }

        if (action === 'send-reset-link' && req.method === 'POST') {
          const target = await repo.getAdminUserWithPermissions(adminUserId);
          if (!target || target.status !== 'active') {
            return apiError(res, 404, 'USER_NOT_FOUND', 'Aktív felhasználó nem található.');
          }
          await issuePasswordReset(repo, target, {
            env,
            requestedIp: req.socket?.remoteAddress || null,
          });
          return json(res, 200, { ok: true });
        }

        if (!action && req.method === 'GET') {
          const target = await repo.getAdminUserWithPermissions(adminUserId);
          if (!target) return apiError(res, 404, 'USER_NOT_FOUND', 'A felhasználó nem található.');
          return json(res, 200, {
            ok: true,
            data: { ...target, is_self: adminUserId === Number(actor.id) },
          });
        }

        if (!action && ['PUT', 'PATCH'].includes(req.method)) {
          const current = await repo.getAdminUserWithPermissions(adminUserId);
          if (!current) return apiError(res, 404, 'USER_NOT_FOUND', 'A felhasználó nem található.');
          const plan = classifyUserMutation(current, await parsedBody(req));
          if (plan.noOp) return apiError(res, 400, 'INVALID_EMPTY_MUTATION', 'Nincs menthető változás.');
          if (plan.needsSave && !hasAction(context.permissions, 'users', 'save')) {
            return apiError(res, 403, 'FORBIDDEN', 'Nincs jogosultság a felhasználó adatainak vagy jogosultságainak mentéséhez.');
          }
          if (plan.needsArchive && !hasAction(context.permissions, 'users', 'archive')) {
            return apiError(res, 403, 'FORBIDDEN', 'Nincs jogosultság a felhasználó letiltásához.');
          }
          const updated = await repo.updateAdminUserWithPermissions(adminUserId, plan.next, actor.id);
          return json(res, 200, {
            ok: true,
            data: { ...updated, is_self: adminUserId === Number(actor.id) },
          });
        }

        return apiError(res, 405, 'METHOD_NOT_ALLOWED', 'Nem támogatott HTTP metódus.');
      } catch (error) {
        return apiError(
          res,
          error.status || 500,
          error.code || 'ADMIN_USERS_FAILED',
          error.message || 'A felhasználói művelet sikertelen.',
          error.details,
        );
      }
    };

    if (!isMutation(req.method)) return execute();
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
