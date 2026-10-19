import type { FastifyInstance } from 'fastify';

/**
 * Plantillas de correo por defecto (verificación, reset y bienvenida). Se
 * crean de forma idempotente al arrancar si no existen.
 */
const DEFAULT_TEMPLATES = [
  {
    key: 'verify-email',
    name: 'Verificación de correo',
    subject: 'Verificá tu correo — {{ site.name }}',
    body: '<p>Hola {{ user.name }},</p><p>Verificá tu correo con este enlace:</p><p><a href="{{ link }}">Verificar correo</a></p>',
    variables: ['user.name', 'site.name', 'link'],
  },
  {
    key: 'reset-password',
    name: 'Restablecer contraseña',
    subject: 'Restablecé tu contraseña — {{ site.name }}',
    body: '<p>Hola {{ user.name }},</p><p>Restablecé tu contraseña con este enlace:</p><p><a href="{{ link }}">Restablecer contraseña</a></p>',
    variables: ['user.name', 'site.name', 'link'],
  },
  {
    key: 'welcome',
    name: 'Bienvenida',
    subject: '¡Bienvenido a {{ site.name }}!',
    body: '<p>Hola {{ user.name }},</p><p>¡Gracias por registrarte en {{ site.name }}!</p>',
    variables: ['user.name', 'site.name'],
  },
];

/**
 * Siembra las plantillas de correo por defecto mediante `upsert` por clave, de
 * forma idempotente. Si no hay base de datos disponible, la operación se omite
 * silenciosamente para no romper el arranque.
 */
export async function seedDefaultEmailTemplates(fastify: FastifyInstance): Promise<void> {
  try {
    for (const t of DEFAULT_TEMPLATES) {
      await fastify.prisma.emailTemplate.upsert({
        where: { key: t.key },
        update: {},
        create: {
          key: t.key,
          name: t.name,
          subject: t.subject,
          body: t.body,
          bodyMode: 'wysiwyg',
          variables: t.variables,
        },
      });
    }
  } catch {
    /* sin base de datos no se siembran plantillas */
  }
}
