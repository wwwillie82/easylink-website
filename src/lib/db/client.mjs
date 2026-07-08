import crypto from 'node:crypto';

export function getDatabaseConfig(env = process.env) {
  if (env.DATABASE_URL) return { uri: env.DATABASE_URL };
  if (!env.DB_HOST || !env.DB_NAME || !env.DB_USER) return null;
  return { host: env.DB_HOST, port: Number(env.DB_PORT || 3306), database: env.DB_NAME, user: env.DB_USER, password: env.DB_PASSWORD || '' };
}

export async function createPool(env = process.env) {
  const config = getDatabaseConfig(env);
  if (!config) throw new Error('Missing MariaDB database configuration. Set DATABASE_URL or DB_HOST/DB_NAME/DB_USER.');
  try {
    const mysql = await import('mysql2/promise');
    return mysql.createPool({ ...(config.uri ? { uri: config.uri } : config), waitForConnections: true, connectionLimit: 5, namedPlaceholders: true });
  } catch (error) {
    throw new Error(`Unable to load mysql2/promise. Install the real upstream mysql2 package before using DB/admin commands. Cause: ${error.message}`);
  }
}

export function hashPassword(password, salt = crypto.randomBytes(16).toString('hex')) {
  const hash = crypto.scryptSync(password, salt, 64).toString('hex');
  return `scrypt:${salt}:${hash}`;
}

export function verifyPassword(password, stored) {
  try {
    const [algo, salt, expected] = String(stored || '').split(':');
    if (algo !== 'scrypt' || !salt || !expected || !/^[a-f0-9]+$/i.test(expected)) return false;
    const actual = crypto.scryptSync(password, salt, 64);
    const expectedBuffer = Buffer.from(expected, 'hex');
    if (expectedBuffer.length !== actual.length) return false;
    return crypto.timingSafeEqual(expectedBuffer, actual);
  } catch {
    return false;
  }
}
