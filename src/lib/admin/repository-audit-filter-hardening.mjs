import { createAdminRepository as createBaseAdminRepository } from './repository-users-hardening.mjs';

const allowedLimits = new Set([25, 50, 100, 200]);

function normalizedLimit(value) {
  const requested = Math.min(200, Math.max(1, Number(value || 50)));
  if (allowedLimits.has(requested)) return requested;
  return requested > 100 ? 200 : 50;
}

function nonEmpty(value) {
  if (value === undefined || value === null) return null;
  const text = String(value).trim();
  return text || null;
}

function metadataValue(value) {
  if (typeof value !== 'string') return value;
  try { return JSON.parse(value); } catch { return null; }
}

export function blockPayloadForBaseRepository(payload = {}) {
  if (!Array.isArray(payload?.items)) return payload;
  return { ...payload, items: JSON.stringify(payload.items) };
}

export function createAdminRepository(pool) {
  const repo = createBaseAdminRepository(pool);
  return {
    ...repo,

    async upsertBlock(payload) {
      return repo.upsertBlock(blockPayloadForBaseRepository(payload));
    },

    async listAuditEvents(filters = {}) {
      const page = Math.max(1, Number(filters.page || 1));
      const limit = normalizedLimit(filters.limit);
      const offset = (page - 1) * limit;
      const where = [];
      const params = [];

      const addEqual = (field, value) => {
        const normalized = nonEmpty(value);
        if (normalized === null) return;
        where.push(`${field}=?`);
        params.push(normalized);
      };
      const addContains = (field, value) => {
        const normalized = nonEmpty(value);
        if (normalized === null) return;
        where.push(`INSTR(${field}, ?) > 0`);
        params.push(normalized);
      };

      if (filters.date_from) {
        where.push('created_at>=?');
        params.push(String(filters.date_from).replace('T', ' '));
      }
      if (filters.date_to) {
        where.push('created_at<=?');
        params.push(String(filters.date_to).replace('T', ' '));
      }

      addEqual('result', filters.result);
      addEqual('event_code', filters.event_code);
      addEqual('scope_code', filters.scope_code);
      addEqual('target_type', filters.target_type);
      addContains('target_id', filters.target_id);
      addContains('request_id', filters.request_id);

      const actor = nonEmpty(filters.actor);
      if (actor !== null) {
        where.push('(actor_display_name LIKE ? OR actor_email LIKE ?)');
        params.push(`%${actor}%`, `%${actor}%`);
      }

      const query = nonEmpty(filters.q);
      if (query !== null) {
        where.push('(target_label LIKE ? OR event_code LIKE ?)');
        params.push(`%${query}%`, `%${query}%`);
      }

      const sqlWhere = where.length ? ` WHERE ${where.join(' AND ')}` : '';
      const [[countRow]] = await pool.query(
        `SELECT COUNT(*) AS total FROM site_admin_audit_log${sqlWhere}`,
        params,
      );
      const [rows] = await pool.query(
        `SELECT id,created_at,actor_user_id,actor_display_name,actor_email,event_code,scope_code,action_code,target_type,target_id,target_label,result,request_id,ip_address,user_agent,metadata_json
           FROM site_admin_audit_log${sqlWhere}
          ORDER BY created_at DESC, id DESC
          LIMIT ? OFFSET ?`,
        [...params, limit, offset],
      );
      const total = Number(countRow?.total || 0);
      return {
        data: rows.map((row) => ({ ...row, metadata_json: metadataValue(row.metadata_json) })),
        pagination: {
          page,
          limit,
          total,
          total_pages: Math.max(1, Math.ceil(total / limit)),
        },
      };
    },
  };
}
