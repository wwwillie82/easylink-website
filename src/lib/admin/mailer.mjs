export function smtpConfig(env = process.env) {
  return { host: env.SMTP_HOST || '', port: Number(env.SMTP_PORT || 587), secure: String(env.SMTP_SECURE || 'false') === 'true', auth: env.SMTP_USER ? { user: env.SMTP_USER, pass: env.SMTP_PASSWORD || '' } : undefined, from: env.SMTP_FROM || '' };
}
export function smtpReady(env = process.env) { const c = smtpConfig(env); return Boolean(c.host && c.from); }
export async function createSmtpMailer(env = process.env) {
  if (!smtpReady(env)) { const e = new Error('SMTP nincs konfigurálva.'); e.code = 'SMTP_NOT_CONFIGURED'; e.status = 503; throw e; }
  const nodemailer = await import('nodemailer');
  const cfg = smtpConfig(env);
  const transport = nodemailer.default.createTransport({ host: cfg.host, port: cfg.port, secure: cfg.secure, auth: cfg.auth });
  return { async sendPasswordReset({ to, displayName, resetUrl, expiresMinutes = 60 }) { await transport.sendMail({ from: cfg.from, to, subject: 'Easylink admin jelszóbeállítás', text: `Kedves ${displayName || 'Felhasználó'}!\n\nJelszóbeállító linket kértél az Easylink admin felülethez.\n\nLink: ${resetUrl}\n\nA link ${expiresMinutes} percig érvényes. Ha nem te kérted, hagyd figyelmen kívül ezt az üzenetet.\n\nJelszót nem küldünk e-mailben.` }); } };
}
