import nodemailer, { type Transporter } from 'nodemailer';
import type { FastifyInstance } from 'fastify';

/**
 * Envío de correo vía SMTP. La configuración se lee de la sección de ajustes
 * `smtp` (configurada en el asistente de instalación o desde la UI).
 */

export interface SmtpSettings {
  enabled?: boolean;
  host?: string;
  port?: number;
  user?: string;
  password?: string;
  from?: string;
  secure?: boolean;
}

export async function getSmtpSettings(fastify: FastifyInstance): Promise<SmtpSettings> {
  const setting = await fastify.prisma.setting.findUnique({ where: { key: 'smtp' } });
  return (setting?.value as SmtpSettings | undefined) ?? {};
}

export function createTransport(settings: SmtpSettings): Transporter | null {
  if (!settings.enabled || !settings.host) return null;
  return nodemailer.createTransport({
    host: settings.host,
    port: settings.port ?? 587,
    secure: settings.secure ?? false,
    auth: settings.user ? { user: settings.user, pass: settings.password } : undefined,
  });
}

export async function sendMail(
  fastify: FastifyInstance,
  input: { to: string; subject: string; html: string },
): Promise<boolean> {
  const settings = await getSmtpSettings(fastify);
  const transport = createTransport(settings);
  if (!transport) return false; // SMTP no configurado → no se envía.

  const from = settings.from ?? 'Webs <no-reply@localhost>';
  await transport.sendMail({ from, to: input.to, subject: input.subject, html: input.html });
  return true;
}

export function verificationEmailHtml(siteName: string, link: string): string {
  return `
    <div style="font-family: sans-serif; max-width: 560px; margin: auto">
      <h2>${siteName}</h2>
      <p>Verificá tu correo electrónico para activar tu cuenta.</p>
      <p><a href="${link}" style="display:inline-block;padding:10px 18px;background:#4f46e5;color:#fff;border-radius:6px;text-decoration:none">Verificar correo</a></p>
      <p style="color:#888">Si no solicitaste esta cuenta, ignorá este mensaje.</p>
    </div>`;
}

export function resetEmailHtml(siteName: string, link: string): string {
  return `
    <div style="font-family: sans-serif; max-width: 560px; margin: auto">
      <h2>${siteName}</h2>
      <p>Recibimos una solicitud para restablecer tu contraseña.</p>
      <p><a href="${link}" style="display:inline-block;padding:10px 18px;background:#4f46e5;color:#fff;border-radius:6px;text-decoration:none">Restablecer contraseña</a></p>
      <p style="color:#888">Si no lo pediste, podés ignorar este mensaje. El enlace expira en 1 hora.</p>
    </div>`;
}
