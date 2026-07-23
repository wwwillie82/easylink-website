export function smtpConfig(env = process.env) {
  return {
    host: String(env.SMTP_HOST || '').trim(),
    port: Number(env.SMTP_PORT || 587),
    secure: String(env.SMTP_SECURE || 'false').toLowerCase() === 'true',
    auth: env.SMTP_USER
      ? { user: String(env.SMTP_USER), pass: String(env.SMTP_PASSWORD || '') }
      : undefined,
    from: String(env.SMTP_FROM || '').trim(),
  };
}

export function smtpReady(env = process.env) {
  const config = smtpConfig(env);
  return Boolean(config.host && config.from && Number.isInteger(config.port) && config.port > 0);
}

function smtpError(code, message, cause) {
  const error = new Error(message, cause ? { cause } : undefined);
  error.code = code;
  error.status = 503;
  return error;
}

export async function createSmtpMailer(env = process.env) {
  if (!smtpReady(env)) {
    throw smtpError('SMTP_NOT_CONFIGURED', 'SMTP nincs konfigurálva.');
  }

  const nodemailer = await import('nodemailer');
  const config = smtpConfig(env);
  const transport = nodemailer.default.createTransport({
    host: config.host,
    port: config.port,
    secure: config.secure,
    auth: config.auth,
  });

  return {
    async sendPasswordReset({ to, displayName, resetUrl, expiresMinutes = 60 }) {
      try {
        await transport.sendMail({
          from: config.from,
          to,
          subject: 'Easylink admin jelszóbeállítás',
          text: `Kedves ${displayName || 'Felhasználó'}!\n\nJelszóbeállító linket kértél az Easylink admin felülethez.\n\nLink: ${resetUrl}\n\nA link ${expiresMinutes} percig érvényes. Ha nem te kérted, hagyd figyelmen kívül ezt az üzenetet.\n\nJelszót nem küldünk e-mailben.`,
        });
      } catch (cause) {
        throw smtpError('SEND_FAILED', 'A jelszóbeállító e-mail küldése sikertelen.', cause);
      }
    },
  };
}
