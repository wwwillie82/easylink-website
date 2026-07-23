import { createAdminServer as createBaseAdminServer } from './server-users-hardening.mjs';
import { resolveAdminContextFromRequest } from './auth.mjs';
import { parsedBody, isMultipart } from './request-body.mjs';
import { classifyUserMutation } from './users.mjs';
import { auditChangedFields, hasAuditEvent, writeAuditEvent } from './audit.mjs';

function safeJson(value) {
  if (!value) return null;
  try { return JSON.parse(Buffer.isBuffer(value) ? value.toString('utf8') : String(value)); }
  catch { return null; }
}

function deniedCode(code) {
  return ['SELF_DISABLE_FORBIDDEN', 'LAST_FULL_ADMIN_REQUIRED', 'FORBIDDEN'].includes(String(code || ''));
}

function eventResult(status, errorCode = '') {
  if (Number(status) === 403 || deniedCode(errorCode)) return 'denied';
  return Number(status) >= 400 ? 'failure' : 'success';
}

function effectiveRequirement(method, pathname, payload = {}, before = null) {
  if (pathname.startsWith('/api/admin/users')) {
    if (pathname.endsWith('/revoke-sessions')) return { scope_code: 'users', action_code: 'archive' };
    if (pathname.endsWith('/send-reset-link') || (pathname === '/api/admin/users' && method === 'POST')) return { scope_code: 'users', action_code: 'save' };
    if (['PUT', 'PATCH'].includes(method) && before) {
      const plan = classifyUserMutation(before, payload || {});
      if (plan.needsArchive && !plan.needsSave) return { scope_code: 'users', action_code: 'archive' };
      if (plan.needsSave && !plan.needsArchive) return { scope_code: 'users', action_code: 'save' };
      return { scope_code: 'users', action_code: null };
    }
    return { scope_code: 'users', action_code: null };
  }
  if (/^\/api\/admin\/pages\/\d+$/.test(pathname) && method === 'DELETE') return { scope_code: 'pages', action_code: 'delete' };
  if (/^\/api\/admin\/pages\/\d+\/home$/.test(pathname)) return { scope_code: 'pages', action_code: payload?.status === 'archived' ? 'archive' : 'save' };
  if (pathname === '/api/admin/pages' || /^\/api\/admin\/pages\/\d+$/.test(pathname)) return { scope_code: 'pages', action_code: payload?.status === 'archived' ? 'archive' : 'save' };
  if (pathname === '/api/admin/blocks') return { scope_code: 'pages', action_code: payload?.status === 'archived' ? 'archive' : 'save' };
  if (/^\/api\/admin\/blocks\/\d+$/.test(pathname)) return { scope_code: 'pages', action_code: 'archive' };
  if (pathname === '/api/admin/navigation') return { scope_code: 'menu', action_code: 'save' };
  if (/^\/api\/admin\/navigation\/\d+$/.test(pathname)) return { scope_code: 'menu', action_code: 'delete' };
  if (pathname === '/api/admin/media') return { scope_code: 'media', action_code: 'save' };
  if (/^\/api\/admin\/media\/\d+$/.test(pathname)) return { scope_code: 'media', action_code: method === 'DELETE' || payload?.status === 'archived' ? 'archive' : 'save' };
  if (pathname === '/api/admin/settings') return { scope_code: 'settings', action_code: 'save' };
  if (pathname === '/api/admin/publish') return { scope_code: 'publish', action_code: 'republish' };
  if (/^\/api\/admin\/publish\/rollback\/\d+$/.test(pathname)) return { scope_code: 'publish', action_code: 'restore' };
  return { scope_code: null, action_code: null };
}

export function isAuditRelevantRoute(method, pathname) {
  const verb = String(method || 'GET').toUpperCase();
  if (!['POST', 'PUT', 'PATCH', 'DELETE'].includes(verb)) return false;
  return pathname === '/api/admin/users'
    || /^\/api\/admin\/users\/\d+(?:\/(?:revoke-sessions|send-reset-link))?$/.test(pathname)
    || /^\/api\/admin\/pages(?:\/\d+(?:\/home)?)?$/.test(pathname)
    || pathname === '/api/admin/blocks'
    || /^\/api\/admin\/blocks\/\d+$/.test(pathname)
    || pathname === '/api/admin/navigation'
    || /^\/api\/admin\/navigation\/\d+$/.test(pathname)
    || pathname === '/api/admin/media'
    || /^\/api\/admin\/media\/\d+$/.test(pathname)
    || pathname === '/api/admin/settings'
    || pathname === '/api/admin/publish'
    || /^\/api\/admin\/publish\/rollback\/\d+$/.test(pathname)
    || pathname === '/api/admin/password-reset/request'
    || pathname === '/api/admin/password-reset/confirm';
}

function primaryBusinessEvent(method, pathname, payload = {}, before = null, response = null) {
  if (pathname === '/api/admin/users' && method === 'POST') return 'admin_user_created';
  const userMatch = /^\/api\/admin\/users\/(\d+)(?:\/(revoke-sessions|send-reset-link))?$/.exec(pathname);
  if (userMatch) {
    if (userMatch[2] === 'revoke-sessions') return 'admin_user_sessions_revoked';
    if (userMatch[2] === 'send-reset-link') return 'admin_user_reset_link_requested';
    if (['PUT', 'PATCH'].includes(method)) {
      const after = response?.data || null;
      if (before?.status === 'active' && (after?.status || payload?.status) === 'disabled') return 'admin_user_disabled';
      if (before?.status === 'disabled' && (after?.status || payload?.status) === 'active') return 'admin_user_reactivated';
      return 'admin_user_updated';
    }
  }
  if (pathname === '/api/admin/pages' && method === 'POST') return 'admin_page_created';
  if (/^\/api\/admin\/pages\/\d+$/.test(pathname) && method === 'DELETE') return 'admin_page_deleted';
  if (/^\/api\/admin\/pages\/\d+\/home$/.test(pathname)) return 'admin_page_updated';
  if (/^\/api\/admin\/pages\/\d+$/.test(pathname)) return payload?.status === 'archived' ? 'admin_page_archived' : 'admin_page_updated';
  if (pathname === '/api/admin/blocks') return payload?.id ? (payload?.status === 'archived' ? 'admin_block_archived' : 'admin_block_updated') : 'admin_block_created';
  if (/^\/api\/admin\/blocks\/\d+$/.test(pathname)) return 'admin_block_archived';
  if (pathname === '/api/admin/navigation') return 'admin_navigation_saved';
  if (/^\/api\/admin\/navigation\/\d+$/.test(pathname)) return 'admin_navigation_item_deleted';
  if (pathname === '/api/admin/media' && method === 'POST') return 'admin_media_uploaded';
  if (/^\/api\/admin\/media\/\d+$/.test(pathname)) return method === 'DELETE' || payload?.status === 'archived' ? 'admin_media_archived' : 'admin_media_updated';
  if (pathname === '/api/admin/settings') return 'admin_settings_updated';
  if (pathname === '/api/admin/publish') return response?.publish?.ok === false ? 'admin_publish_failed' : 'admin_publish_completed';
  if (/^\/api\/admin\/publish\/rollback\/\d+$/.test(pathname)) return response?.publish?.ok === false ? 'admin_publish_rollback_failed' : 'admin_publish_rollback_completed';
  if (pathname === '/api/admin/password-reset/request') return 'password_reset_requested';
  if (pathname === '/api/admin/password-reset/confirm') return 'password_reset_completed';
  return null;
}

function targetFor(pathname, response, before = null) {
  const userMatch = /^\/api\/admin\/users\/(\d+)/.exec(pathname);
  if (pathname === '/api/admin/users') {
    const data = response?.data || null;
    return { target_type: 'admin_user', target_id: data?.id || null, target_label: data?.display_name || data?.email || null };
  }
  if (userMatch) {
    const data = response?.data || before || null;
    return { target_type: 'admin_user', target_id: userMatch[1], target_label: data?.display_name || data?.email || null };
  }
  const homeMatch = /^\/api\/admin\/pages\/(\d+)\/home$/.exec(pathname);
  if (homeMatch) return { target_type: 'page', target_id: homeMatch[1], target_label: before?.page?.title || before?.page?.route || 'Főoldal' };
  const pageMatch = /^\/api\/admin\/pages\/(\d+)$/.exec(pathname);
  if (pageMatch) {
    const data = response?.data || before?.page || before || null;
    return { target_type: 'page', target_id: pageMatch[1], target_label: data?.title || data?.route || null };
  }
  const navMatch = /^\/api\/admin\/navigation\/(\d+)$/.exec(pathname);
  if (navMatch) return { target_type: 'navigation_item', target_id: navMatch[1], target_label: response?.data?.title || before?.title || null };
  if (pathname === '/api/admin/navigation') return { target_type: 'navigation', target_id: null, target_label: 'Menü mentés' };
  const blockMatch = /^\/api\/admin\/blocks\/(\d+)$/.exec(pathname);
  if (blockMatch) return { target_type: 'block', target_id: blockMatch[1], target_label: before?.title || before?.type || null };
  if (pathname === '/api/admin/blocks') return { target_type: 'block', target_id: response?.data?.id || null, target_label: response?.data?.title || response?.data?.type || null };
  const mediaMatch = /^\/api\/admin\/media\/(\d+)$/.exec(pathname);
  if (mediaMatch) return { target_type: 'media', target_id: mediaMatch[1], target_label: before?.path || response?.data?.path || null };
  if (pathname === '/api/admin/media') return { target_type: 'media', target_id: response?.data?.id || null, target_label: response?.data?.path || null };
  if (pathname === '/api/admin/settings') return { target_type: 'settings', target_id: null, target_label: 'Alapadatok' };
  const rollbackMatch = /^\/api\/admin\/publish\/rollback\/(\d+)$/.exec(pathname);
  if (rollbackMatch) return { target_type: 'publish_snapshot', target_id: response?.publish?.snapshotId || rollbackMatch[1], target_label: `Visszaállítás: ${rollbackMatch[1]}` };
  if (pathname === '/api/admin/publish') return { target_type: 'publish_snapshot', target_id: response?.publish?.snapshotId || null, target_label: 'Kézi újraélesítés' };
  return { target_type: null, target_id: null, target_label: null };
}

export function auditEventsForCompletedRequest({ method, pathname, status, response, payload = {}, before = null, actor = null } = {}) {
  const errorCode = response?.error?.code || '';
  const result = eventResult(status, errorCode);
  const requirement = effectiveRequirement(method, pathname, payload, before);
  const target = targetFor(pathname, response, before);

  if (Number(status) === 401) return [];

  if (Number(status) === 403) {
    const publicResetRoute = pathname === '/api/admin/password-reset/request' || pathname === '/api/admin/password-reset/confirm';
    return [{
      event_code: publicResetRoute ? 'admin_csrf_rejected' : 'admin_authorization_denied',
      result: 'denied',
      actor,
      ...requirement,
      ...target,
      metadata: { method, pathname, requiredScope: requirement.scope_code, requiredAction: requirement.action_code, effectiveMutation: !publicResetRoute, errorCode },
    }];
  }

  let eventCode = primaryBusinessEvent(method, pathname, payload, before, response);
  if (!eventCode) return [];
  if (pathname === '/api/admin/password-reset/confirm' && Number(status) >= 400) eventCode = 'password_reset_failed';
  if (pathname === '/api/admin/publish' && Number(status) >= 400) eventCode = 'admin_publish_failed';
  if (/^\/api\/admin\/publish\/rollback\//.test(pathname) && Number(status) >= 400) eventCode = 'admin_publish_rollback_failed';

  const metadata = {
    method,
    pathname,
    errorCode: errorCode || null,
  };
  if (/\/home$/.test(pathname)) metadata.homeAggregate = true;
  if (pathname.includes('/users/') && ['PUT', 'PATCH'].includes(method) && response?.data) {
    metadata.changedFields = auditChangedFields(before || {}, response.data, ['email', 'display_name', 'status']);
  }
  const events = [{ event_code: eventCode, result, actor, ...requirement, ...target, metadata }];

  if (pathname === '/api/admin/users' && method === 'POST' && Number(status) < 400) {
    events.push({
      event_code: 'admin_user_reset_link_requested',
      result: response?.reset?.ok === false ? 'failure' : 'success',
      actor,
      scope_code: 'users',
      action_code: 'save',
      ...target,
      metadata: { errorCode: response?.reset?.code || null },
    });
  }

  if (/^\/api\/admin\/users\/\d+$/.test(pathname) && ['PUT', 'PATCH'].includes(method) && Number(status) < 400 && response?.data) {
    const beforePermissions = before?.permissions || {};
    const afterPermissions = response.data.permissions || {};
    if (JSON.stringify(beforePermissions) !== JSON.stringify(afterPermissions)) {
      events.push({
        event_code: 'admin_user_permissions_changed',
        result: 'success',
        actor,
        scope_code: 'users',
        action_code: 'save',
        ...target,
        metadata: { before: beforePermissions, after: afterPermissions },
      });
    }
  }

  if (/\/revoke-sessions$/.test(pathname) && Number(status) < 400) {
    events.push({
      event_code: 'admin_session_revoked',
      result: 'success',
      actor,
      ...target,
      metadata: { revokedCount: response?.data?.revokedCount ?? null },
    });
  }

  if (response?.publish && pathname !== '/api/admin/publish' && !/^\/api\/admin\/publish\/rollback\//.test(pathname)) {
    const publishOk = response.publish.ok !== false;
    events.push({
      event_code: publishOk ? 'admin_publish_completed' : 'admin_publish_failed',
      result: publishOk ? 'success' : 'failure',
      actor,
      scope_code: 'publish',
      action_code: 'republish',
      target_type: 'publish_snapshot',
      target_id: response.publish.snapshotId || null,
      target_label: 'Automatikus élesítés',
      metadata: { status: response.publish.status || null, sourcePathname: pathname, errorCode: response.publish.error ? 'PUBLISH_ERROR' : null },
    });
  }

  return events;
}

async function loadBeforeState(repo, method, pathname) {
  const userMatch = /^\/api\/admin\/users\/(\d+)/.exec(pathname);
  if (userMatch) return repo.getAdminUserWithPermissions?.(Number(userMatch[1])) || null;
  const homeMatch = /^\/api\/admin\/pages\/(\d+)\/home$/.exec(pathname);
  if (homeMatch) return repo.page?.(Number(homeMatch[1])) || null;
  const pageMatch = /^\/api\/admin\/pages\/(\d+)$/.exec(pathname);
  if (pageMatch) return repo.page?.(Number(pageMatch[1])) || null;
  const navMatch = /^\/api\/admin\/navigation\/(\d+)$/.exec(pathname);
  if (navMatch) {
    const rows = await repo.nav?.();
    return Array.isArray(rows) ? rows.find((row) => Number(row.id) === Number(navMatch[1])) || null : null;
  }
  const blockMatch = /^\/api\/admin\/blocks\/(\d+)$/.exec(pathname);
  if (blockMatch) return repo.block?.(Number(blockMatch[1])) || null;
  const mediaMatch = /^\/api\/admin\/media\/(\d+)$/.exec(pathname);
  if (mediaMatch) return repo.getMedia?.(Number(mediaMatch[1])) || null;
  return null;
}

export function createAdminServer({
  repo,
  env = process.env,
  publishService,
  pool = null,
  baseServerFactory = createBaseAdminServer,
  resolveContext = resolveAdminContextFromRequest,
} = {}) {
  if (!repo) throw new Error('createAdminServer requires repo');
  const server = baseServerFactory({ repo, env, publishService, pool });
  const [baseRequestHandler] = server.listeners('request');
  if (typeof baseRequestHandler !== 'function') throw new Error('Base admin request handler is missing');
  server.removeAllListeners('request');

  server.on('request', async (req, res) => {
    const url = new URL(req.url, 'http://localhost');
    const method = String(req.method || 'GET').toUpperCase();
    if (!isAuditRelevantRoute(method, url.pathname)) return baseRequestHandler(req, res);

    let payload = {};
    if (!isMultipart(req)) {
      try { payload = await parsedBody(req); }
      catch { payload = {}; }
    }
    let context = null;
    try { context = await resolveContext(req, repo, env); }
    catch { context = null; }
    let before = null;
    try { before = await loadBeforeState(repo, method, url.pathname); }
    catch { before = null; }

    const originalEnd = res.end.bind(res);
    let finalized = false;
    res.end = function auditAwareEnd(chunk, encoding, callback) {
      if (finalized) return res;
      finalized = true;
      const finish = async () => {
        const response = safeJson(chunk);
        const events = auditEventsForCompletedRequest({
          method,
          pathname: url.pathname,
          status: res.statusCode,
          response,
          payload,
          before,
          actor: context?.user || null,
        });
        for (const event of events) {
          if (hasAuditEvent(req, event.event_code, event.result)) continue;
          try { await writeAuditEvent(repo, req, event); }
          catch (error) {
            console.error('admin audit hardening insert failed', {
              code: error.code,
              message: error.message,
              eventCode: event.event_code,
              result: event.result,
              requestId: req.__easylinkAuditRequestId || null,
            });
          }
        }
      };
      finish().finally(() => originalEnd(chunk, encoding, callback));
      return res;
    };

    return baseRequestHandler(req, res);
  });

  return server;
}
