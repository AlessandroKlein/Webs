import type { FastifyInstance } from 'fastify';
import { audit } from '../../lib/audit';
import { sendMail } from '../mail/service';
import { ensureDefaultSections, getSectionValue, listSections, setSectionValue } from './service';
import { collectPluginMenuItems } from '../../lib/plugin-menu';

export default async function settingsRoutes(fastify: FastifyInstance): Promise<void> {
  ensureDefaultSections();

  // Footer público (datos no sensibles para el pie de página).
  fastify.get('/public/footer', { schema: { tags: ['settings'] } }, async () => {
    const pick = (v: Record<string, unknown>) => ({ ...v });
    const [site, footer, social] = await Promise.all([
      fastify.prisma.setting.findUnique({ where: { key: 'site' } }),
      fastify.prisma.setting.findUnique({ where: { key: 'footer' } }),
      fastify.prisma.setting.findUnique({ where: { key: 'social' } }),
    ]);
    return {
      site: pick((site?.value as Record<string, unknown>) ?? {}),
      footer: pick((footer?.value as Record<string, unknown>) ?? {}),
      social: pick((social?.value as Record<string, unknown>) ?? {}),
    };
  });

  // Sitio público (identidad + logo) para el encabezado del sitio.
  fastify.get('/public/site', { schema: { tags: ['settings'] } }, async () => {
    const [site, branding] = await Promise.all([
      fastify.prisma.setting.findUnique({ where: { key: 'site' } }),
      fastify.prisma.setting.findUnique({ where: { key: 'branding' } }),
    ]);
    const s = (site?.value ?? {}) as Record<string, unknown>;
    const b = (branding?.value ?? {}) as Record<string, unknown>;
    return {
      name: (s.name as string) ?? 'Webs',
      tagline: (s.tagline as string) ?? '',
      logoUrl: (b.logoUrl as string) ?? '',
      logoDarkUrl: (b.logoDarkUrl as string) ?? '',
      faviconUrl: (b.faviconUrl as string) ?? '',
    };
  });

  // Menú principal público (items guardados en la tabla `menu`, clave `main`,
  // más los items de menú nativos declarados por los plugins instalados).
  fastify.get('/public/menu', { schema: { tags: ['settings'] } }, async () => {
    const menu = await fastify.prisma.menu.findUnique({ where: { key: 'main' } });
    const coreItems = (menu?.items as Array<{ label: string; path: string; order?: number }>) ?? [];
    const pluginItems = collectPluginMenuItems('public');
    return { items: [...coreItems, ...pluginItems] };
  });

  // Campos personalizados del perfil de usuario (definidos por el administrador).
  fastify.get('/public/profile-fields', { schema: { tags: ['settings'] } }, async () => {
    const s = await fastify.prisma.setting.findUnique({ where: { key: 'userProfile' } });
    const value = (s?.value ?? {}) as { fields?: Array<{ key: string; label: string; type?: string; options?: string; required?: boolean }> };
    return { fields: (value.fields ?? []).filter((f) => f.key && f.label) };
  });

  fastify.get(
    '/settings',
    {
      schema: { tags: ['settings'] },
      preHandler: [fastify.authenticate, fastify.authorize('setting.read')],
    },
    async () => listSections(fastify),
  );

  fastify.get(
    '/settings/:key',
    {
      schema: {
        tags: ['settings'],
        params: { type: 'object', properties: { key: { type: 'string' } } },
      },
      preHandler: [fastify.authenticate, fastify.authorize('setting.read')],
    },
    async (request) => getSectionValue(fastify, (request.params as { key: string }).key),
  );

  fastify.put(
    '/settings/:key',
    {
      schema: {
        tags: ['settings'],
        params: { type: 'object', properties: { key: { type: 'string' } } },
      },
      preHandler: [fastify.authenticate, fastify.authorize('setting.write')],
    },
    async (request) => {
      const key = (request.params as { key: string }).key;
      const value = request.body;
      const result = await setSectionValue(fastify, key, value, request.user?.sub);
      audit(fastify, request, { actorId: request.user?.sub, action: 'setting.update', resource: 'setting', resourceId: key });
      return result;
    },
  );

  // Test de SMTP: envía un correo de prueba con la configuración guardada.
  fastify.post(
    '/settings/test-smtp',
    {
      schema: {
        tags: ['settings'],
        body: { type: 'object', required: ['to'], properties: { to: { type: 'string', format: 'email' } } },
      },
      preHandler: [fastify.authenticate, fastify.authorize('setting.write')],
    },
    async (request) => {
      const { to } = request.body as { to: string };
      const sent = await sendMail(fastify, {
        to,
        subject: 'Test SMTP — Webs',
        html: '<p>Este es un correo de prueba de Webs. Si lo recibiste, el SMTP está configurado correctamente.</p>',
      });
      if (!sent) return { ok: false, message: 'SMTP no configurado (revisá host/puerto/enabled).' };
      return { ok: true, message: `Correo de prueba enviado a ${to}.` };
    },
  );
}
