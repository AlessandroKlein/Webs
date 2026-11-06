import type { FastifyInstance } from 'fastify';
import { NotFoundError } from '@webs/core';
import { audit } from '../../lib/audit';
import { sendMail } from '../mail/service';
import { ensureDefaultSections, getSectionValue, listSections, setSectionValue } from './service';
import { collectPluginMenuItems } from '../../lib/plugin-menu';
import { isLicensed } from '../../lib/feature-gating';
import {
  LEGAL_DOCUMENTS,
  buildLegalContext,
  normalizeLegalLang,
  substituteLegalPlaceholders,
} from './legal-templates';

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
    const [menu, enabled] = await Promise.all([
      fastify.prisma.menu.findUnique({ where: { key: 'main' } }),
      fastify.prisma.pluginInstallation.findMany({ where: { enabled: true }, select: { pluginId: true } }),
    ]);
    const coreItems = ((menu?.items as Array<{ label: string; path: string; order?: number }>) ?? []).map((item) => ({
      ...item,
      feature: 'core',
    }));
    // El sitio público no tiene LicenseProvider: filtramos los items premium no
    // licenciados (ADR-0019) y los de plugins desactivados. Los `core` siempre van.
    const active = new Set(enabled.map((installation) => installation.pluginId));
    const pluginItems = collectPluginMenuItems('public', active).filter((item) => isLicensed(fastify, item.feature));
    return { items: [...coreItems, ...pluginItems] };
  });

  // Campos personalizados del perfil de usuario (definidos por el administrador).
  fastify.get('/public/profile-fields', { schema: { tags: ['settings'] } }, async () => {
    const s = await fastify.prisma.setting.findUnique({ where: { key: 'userProfile' } });
    const value = (s?.value ?? {}) as { fields?: Array<{ key: string; label: string; type?: string; options?: string; required?: boolean }> };
    return { fields: (value.fields ?? []).filter((f) => f.key && f.label) };
  });

  // Contenido legal público por slug (`terms` | `privacy` | `cookies` | `disclaimer`).
  // Se resuelve desde la sección de ajustes `legal` (idioma principal) o
  // `legalTranslations` (EN/PT), y se autocompletan los placeholders
  // ([NOMBRE_EMPRESA], [URL], [EMAIL_CONTACTO], …) con los datos de instalación.
  fastify.get(
    '/public/legal/:slug',
    {
      schema: {
        tags: ['settings'],
        params: { type: 'object', properties: { slug: { type: 'string' } } },
        querystring: { type: 'object', properties: { lang: { type: 'string' } } },
      },
    },
    async (request) => {
      const slug = (request.params as { slug: string }).slug;
      const document = (LEGAL_DOCUMENTS as Record<string, { field: string; title: string } | undefined>)[slug];
      if (!document) throw new NotFoundError('Documento legal');

      const [legal, translations, company, site, contact, footer, seo, localization] = await Promise.all([
        getSectionValue(fastify, 'legal'),
        getSectionValue(fastify, 'legalTranslations'),
        getSectionValue(fastify, 'legalCompany'),
        getSectionValue(fastify, 'site'),
        getSectionValue(fastify, 'contact'),
        getSectionValue(fastify, 'footer'),
        getSectionValue(fastify, 'seo'),
        getSectionValue(fastify, 'localization'),
      ]);

      const legalValue = (legal.value ?? {}) as Record<string, unknown>;
      const transValue = (translations.value ?? {}) as Record<string, unknown>;
      const primary = (legalValue[document.field] as string) ?? '';

      const requested = (request.query as { lang?: string }).lang;
      const defaultLocale = ((localization.value as Record<string, unknown>).defaultLocale as string) ?? 'es';
      const lang = normalizeLegalLang(requested, defaultLocale);

      let content = primary;
      if (lang !== 'es') {
        const suffix = lang === 'en' ? 'En' : 'Pt';
        const translated = (transValue[`${document.field}${suffix}`] as string) ?? '';
        if (translated.trim()) content = translated;
      }

      const origin = `${request.protocol}://${request.host}`;
      content = substituteLegalPlaceholders(
        content,
        buildLegalContext({
          site: site.value,
          contact: contact.value,
          footer: footer.value,
          seo: seo.value,
          company: company.value,
          origin,
          lang,
        }),
      );

      return { slug, lang, title: document.title, content };
    },
  );

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
