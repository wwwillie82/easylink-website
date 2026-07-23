import { createPool, hashPassword } from '../src/lib/db/client.mjs';
import { fullAdminPermissionMatrix, permissionRowsForInsert } from '../src/lib/admin/permissions.mjs';
const email = process.env.SITE_ADMIN_BOOTSTRAP_EMAIL || process.env.SITE_ADMIN_BOOTSTRAP_USER;
const password = process.env.SITE_ADMIN_BOOTSTRAP_PASSWORD;
if (!email || !password || password.length < 12) throw new Error('Set SITE_ADMIN_BOOTSTRAP_EMAIL and a SITE_ADMIN_BOOTSTRAP_PASSWORD with at least 12 characters.');
const pool = await createPool();
const normalizedEmail = email.toLowerCase();
const conn = await pool.getConnection();
try {
  await conn.beginTransaction();
  await conn.execute(`INSERT INTO site_admin_users (email, password_hash, display_name, role, status) VALUES (?, ?, ?, 'admin', 'active') ON DUPLICATE KEY UPDATE password_hash=VALUES(password_hash), status='active', updated_at=CURRENT_TIMESTAMP`, [normalizedEmail, hashPassword(password), email]);
  const [rows] = await conn.query('SELECT id FROM site_admin_users WHERE email=? LIMIT 1 FOR UPDATE', [normalizedEmail]);
  const id = rows[0]?.id;
  if (id) {
    await conn.execute('DELETE FROM site_admin_user_scopes WHERE admin_user_id=?', [id]);
    for (const row of permissionRowsForInsert(fullAdminPermissionMatrix)) await conn.execute('INSERT INTO site_admin_user_scopes (admin_user_id,scope_code,can_save,can_archive,can_delete,can_republish,can_restore) VALUES (?,?,?,?,?,?,?)', [id, row.scope_code, row.can_save, row.can_archive, row.can_delete, row.can_republish, row.can_restore]);
    await conn.execute('UPDATE site_admin_sessions SET revoked_at=CURRENT_TIMESTAMP WHERE admin_user_id=? AND revoked_at IS NULL', [id]);
  }
  await conn.commit();
} catch (error) { await conn.rollback(); throw error; }
finally { conn.release(); await pool.end(); }
console.log(`Admin user initialized: ${normalizedEmail}`);
