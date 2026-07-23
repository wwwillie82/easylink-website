const bodyCache = Symbol.for('easylink.admin.bodyCache');
export async function rawBody(req) {
  if (req[bodyCache]?.raw !== undefined) return req[bodyCache].raw;
  const chunks = [];
  for await (const c of req) chunks.push(c);
  const raw = Buffer.concat(chunks).toString('utf8');
  req[bodyCache] = { ...(req[bodyCache] || {}), raw };
  return raw;
}
export async function parsedBody(req) {
  if (req[bodyCache]?.parsed !== undefined) return req[bodyCache].parsed;
  const type = String(req.headers?.['content-type'] || '').toLowerCase();
  const raw = await rawBody(req);
  let parsed = {};
  if (raw) parsed = type.includes('application/x-www-form-urlencoded') ? Object.fromEntries(new URLSearchParams(raw)) : JSON.parse(raw);
  req[bodyCache] = { ...(req[bodyCache] || {}), parsed };
  return parsed;
}
export function isMultipart(req) { return String(req.headers?.['content-type'] || '').toLowerCase().includes('multipart/form-data'); }
