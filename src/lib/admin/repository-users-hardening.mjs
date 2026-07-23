import { createAdminRepository as createBaseAdminRepository } from './repository-page-delete.mjs';
import { normalizePermissions } from './permissions.mjs';
import {
  classifyUserMutation,
  isFullAdminMatrix,
  publicUser,
  rowsFromMatrix,
  unknownCredentialHash,
  userError,
  validateUserPayload,
} from './users.mjs';

async function permissionMatrix(queryable, adminUserId, { lock = false } = {}) {
  const [rows] = await queryable.query(
    `SELECT admin_user_id,scope_code,can_save,can_archive,can_delete,can_republish,can_restore
       FROM site_admin_user_scopes
      WHERE admin_user_id=?
      ORDER BY scope_code${lock ? ' FOR UPDATE' : ''}`,
    [adminUserId],
  );
  return normalizePermissions(rows);
}

async function publicAdminUser(queryable, adminUserId) {
  const [rows] = await queryable.query(
    'SELECT id,email,display_name,status,created_at,updated_at,last_login_at FROM site_admin_users WHERE id=? LIMIT 1',
    [adminUserId],
  );
  if (!rows[0]) return null;
  return publicUser(rows[0], await permissionMatrix(queryable, adminUserId));
}

async function insertPermissionRows(conn, adminUserId, matrix) {
  for (const row of rowsFromMatrix(matrix)) {
    await conn.execute(
      `INSERT INTO site_admin_user_scopes
        (admin_user_id,scope_code,can_save,can_archive,can_delete,can_republish,can_restore)
       VALUES (?,?,?,?,?,?,?)`,
      [
        adminUserId,
        row.scope_code,
        row.can_save,
        row.can_archive,
        row.can_delete,
        row.can_republish,
        row.can_restore,
      ],
    );
  }
}

async function assertFullAdminRemains(conn) {
  const [users] = await conn.query(
    "SELECT id FROM site_admin_users WHERE status='active' ORDER BY id FOR UPDATE",
  );
  for (const user of users) {
    if (isFullAdminMatrix(await permissionMatrix(conn, user.id, { lock: true }))) return;
  }
  throw userError(
    409,
    'LAST_FULL_ADMIN_REQUIRED',
    'Legalább egy teljes jogosultságú aktív adminnak maradnia kell.',
  );
}

function duplicateEmailError(error) {
  if (error?.code === 'ER_DUP_ENTRY') {
    return userError(409, 'DUPLICATE_EMAIL', 'Ez az e-mail-cím már használatban van.');
  }
  return error;
}

export function createAdminRepository(pool) {
  const repo = createBaseAdminRepository(pool);
  return {
    ...repo,

    async listAdminUsers() {
      const [rows] = await pool.query(
        'SELECT id,email,display_name,status,created_at,updated_at,last_login_at FROM site_admin_users ORDER BY display_name,email,id',
      );
      return rows.map((row) => ({
        id: Number(row.id),
        email: row.email,
        display_name: row.display_name,
        status: row.status,
        created_at: row.created_at,
        updated_at: row.updated_at,
        last_login_at: row.last_login_at,
      }));
    },

    async getAdminUserWithPermissions(id) {
      return publicAdminUser(pool, Number(id));
    },

    async createAdminUserWithPermissions(payload) {
      const data = validateUserPayload(payload, { create: true });
      const conn = await pool.getConnection();
      let insertedId = null;
      try {
        await conn.beginTransaction();
        const [dupe] = await conn.query(
          'SELECT id FROM site_admin_users WHERE email=? LIMIT 1 FOR UPDATE',
          [data.email],
        );
        if (dupe[0]) throw userError(409, 'DUPLICATE_EMAIL', 'Ez az e-mail-cím már használatban van.');
        const [result] = await conn.execute(
          "INSERT INTO site_admin_users (email,password_hash,display_name,role,status) VALUES (?,?,?,'admin','active')",
          [data.email, unknownCredentialHash(), data.display_name],
        );
        insertedId = Number(result.insertId);
        await insertPermissionRows(conn, insertedId, data.permissions);
        await conn.commit();
      } catch (error) {
        await conn.rollback();
        throw duplicateEmailError(error);
      } finally {
        conn.release();
      }
      return publicAdminUser(pool, insertedId);
    },

    async updateAdminUserWithPermissions(id, payload, actorId) {
      const adminUserId = Number(id);
      const conn = await pool.getConnection();
      try {
        await conn.beginTransaction();
        const [rows] = await conn.query(
          'SELECT id,email,display_name,status,created_at,updated_at,last_login_at FROM site_admin_users WHERE id=? LIMIT 1 FOR UPDATE',
          [adminUserId],
        );
        const row = rows[0];
        if (!row) throw userError(404, 'USER_NOT_FOUND', 'A felhasználó nem található.');

        const current = publicUser(row, await permissionMatrix(conn, adminUserId, { lock: true }));
        const plan = classifyUserMutation(current, payload);
        if (plan.noOp) throw userError(400, 'INVALID_EMPTY_MUTATION', 'Nincs menthető változás.');
        if (Number(actorId) === adminUserId && plan.needsArchive) {
          throw userError(409, 'SELF_DISABLE_FORBIDDEN', 'A saját felhasználó nem tiltható le.');
        }

        const [dupe] = await conn.query(
          'SELECT id FROM site_admin_users WHERE email=? AND id<>? LIMIT 1 FOR UPDATE',
          [plan.next.email, adminUserId],
        );
        if (dupe[0]) throw userError(409, 'DUPLICATE_EMAIL', 'Ez az e-mail-cím már használatban van.');

        await conn.execute(
          'UPDATE site_admin_users SET email=?,display_name=?,status=? WHERE id=?',
          [plan.next.email, plan.next.display_name, plan.next.status, adminUserId],
        );
        await conn.execute('DELETE FROM site_admin_user_scopes WHERE admin_user_id=?', [adminUserId]);
        await insertPermissionRows(conn, adminUserId, plan.next.permissions);

        if (plan.next.status === 'disabled') {
          await conn.execute(
            'UPDATE site_admin_sessions SET revoked_at=CURRENT_TIMESTAMP WHERE admin_user_id=? AND revoked_at IS NULL',
            [adminUserId],
          );
        }

        await assertFullAdminRemains(conn);
        await conn.commit();
      } catch (error) {
        await conn.rollback();
        throw duplicateEmailError(error);
      } finally {
        conn.release();
      }
      return publicAdminUser(pool, adminUserId);
    },

    async revokeAdminUserSessions(id) {
      const adminUserId = Number(id);
      const conn = await pool.getConnection();
      try {
        await conn.beginTransaction();
        const [users] = await conn.query(
          'SELECT id FROM site_admin_users WHERE id=? LIMIT 1 FOR UPDATE',
          [adminUserId],
        );
        if (!users[0]) throw userError(404, 'USER_NOT_FOUND', 'A felhasználó nem található.');
        const [result] = await conn.execute(
          'UPDATE site_admin_sessions SET revoked_at=CURRENT_TIMESTAMP WHERE admin_user_id=? AND revoked_at IS NULL',
          [adminUserId],
        );
        await conn.commit();
        return { revokedCount: Number(result.affectedRows || 0) };
      } catch (error) {
        await conn.rollback();
        throw error;
      } finally {
        conn.release();
      }
    },

    async reserveAdminPasswordResetToken(adminUserId, hash, { requestedIp = null } = {}) {
      const conn = await pool.getConnection();
      try {
        await conn.beginTransaction();
        const [users] = await conn.query(
          'SELECT id,status FROM site_admin_users WHERE id=? LIMIT 1 FOR UPDATE',
          [adminUserId],
        );
        if (!users[0] || users[0].status !== 'active') {
          throw userError(404, 'USER_NOT_FOUND', 'Aktív felhasználó nem található.');
        }
        const [recent] = await conn.query(
          `SELECT id FROM site_admin_password_reset_tokens
            WHERE admin_user_id=? AND used_at IS NULL
              AND created_at > CURRENT_TIMESTAMP - INTERVAL 5 MINUTE
            ORDER BY id DESC LIMIT 1 FOR UPDATE`,
          [adminUserId],
        );
        if (recent[0]) {
          throw userError(
            429,
            'PASSWORD_RESET_THROTTLED',
            'Ehhez a felhasználóhoz 5 percenként küldhető új link.',
          );
        }
        await conn.execute(
          `INSERT INTO site_admin_password_reset_tokens
            (admin_user_id,token_hash,expires_at,requested_ip)
           VALUES (?,?,CURRENT_TIMESTAMP + INTERVAL 60 MINUTE,?)`,
          [adminUserId, hash, requestedIp],
        );
        await conn.commit();
      } catch (error) {
        await conn.rollback();
        throw error;
      } finally {
        conn.release();
      }
    },

    async activateAdminPasswordResetToken(adminUserId, hash) {
      const conn = await pool.getConnection();
      try {
        await conn.beginTransaction();
        const [tokens] = await conn.query(
          `SELECT id FROM site_admin_password_reset_tokens
            WHERE admin_user_id=? AND token_hash=? AND used_at IS NULL
            LIMIT 1 FOR UPDATE`,
          [adminUserId, hash],
        );
        if (!tokens[0]) throw userError(400, 'INVALID_RESET_TOKEN', 'A jelszóbeállító token nem aktiválható.');
        await conn.execute(
          `UPDATE site_admin_password_reset_tokens
              SET used_at=CURRENT_TIMESTAMP
            WHERE admin_user_id=? AND token_hash<>? AND used_at IS NULL`,
          [adminUserId, hash],
        );
        await conn.commit();
      } catch (error) {
        await conn.rollback();
        throw error;
      } finally {
        conn.release();
      }
    },

    async cancelAdminPasswordResetToken(adminUserId, hash) {
      await pool.execute(
        'DELETE FROM site_admin_password_reset_tokens WHERE admin_user_id=? AND token_hash=? AND used_at IS NULL',
        [adminUserId, hash],
      );
    },

    async createAdminPasswordResetToken(adminUserId, hash, options = {}) {
      await this.reserveAdminPasswordResetToken(adminUserId, hash, options);
      await this.activateAdminPasswordResetToken(adminUserId, hash);
    },

    async consumeAdminPasswordResetToken(hash, passwordHash) {
      const conn = await pool.getConnection();
      try {
        await conn.beginTransaction();
        const [rows] = await conn.query(
          `SELECT t.id,t.admin_user_id,t.used_at,
                  (t.expires_at > CURRENT_TIMESTAMP) AS is_valid_time,
                  u.status AS user_status
             FROM site_admin_password_reset_tokens t
             JOIN site_admin_users u ON u.id=t.admin_user_id
            WHERE t.token_hash=?
            LIMIT 1 FOR UPDATE`,
          [hash],
        );
        const token = rows[0];
        if (!token || token.used_at || Number(token.is_valid_time) !== 1 || token.user_status !== 'active') {
          throw userError(400, 'INVALID_RESET_TOKEN', 'A jelszóbeállító link érvénytelen vagy lejárt.');
        }
        await conn.execute(
          'UPDATE site_admin_users SET password_hash=? WHERE id=?',
          [passwordHash, token.admin_user_id],
        );
        await conn.execute(
          'UPDATE site_admin_password_reset_tokens SET used_at=CURRENT_TIMESTAMP WHERE admin_user_id=? AND used_at IS NULL',
          [token.admin_user_id],
        );
        await conn.execute(
          'UPDATE site_admin_sessions SET revoked_at=CURRENT_TIMESTAMP WHERE admin_user_id=? AND revoked_at IS NULL',
          [token.admin_user_id],
        );
        await conn.commit();
      } catch (error) {
        await conn.rollback();
        throw error;
      } finally {
        conn.release();
      }
    },
  };
}
