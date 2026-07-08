import { createPool, hashPassword } from '../src/lib/db/client.mjs';
const email = process.env.SITE_ADMIN_BOOTSTRAP_EMAIL || process.env.SITE_ADMIN_BOOTSTRAP_USER;
const password = process.env.SITE_ADMIN_BOOTSTRAP_PASSWORD;
if (!email || !password || password.length < 12) throw new Error('Set SITE_ADMIN_BOOTSTRAP_EMAIL and a SITE_ADMIN_BOOTSTRAP_PASSWORD with at least 12 characters.');
const pool = await createPool();
await pool.execute(`INSERT INTO site_admin_users (email, password_hash, display_name, role, status) VALUES (?, ?, ?, 'admin', 'active') ON DUPLICATE KEY UPDATE password_hash=VALUES(password_hash), status='active', updated_at=CURRENT_TIMESTAMP`, [email.toLowerCase(), hashPassword(password), email]);
await pool.end();
console.log(`Admin user initialized: ${email.toLowerCase()}`);
