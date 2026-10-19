import { defineBlock, type BlockManifest } from '@webs/plugin-sdk';
import manifestJson from '../block.json';

const manifest = manifestJson as unknown as BlockManifest;

/**
 * Bloque SEO: genera `sitemap.xml`, `robots.txt` y metadatos.
 *
 * Se integra con el ajuste "SEO global" de /admin/settings (clave `seo`) y con
 * el ajuste de sitio (clave `site`, para la URL base). El sitemap es dinámico:
 * incluye páginas, contenido publicado, entradas de blog y productos.
 */
export default defineBlock(manifest, {
  register: async (fastify, config) => {
    const cfg = config as Record<string, unknown>;
    const db = (fastify as unknown as { prisma: Record<string, any> }).prisma;

    // Resuelve la URL base: ajuste de sitio > configuración del bloque.
    async function resolveSiteUrl(): Promise<string> {
      const site = await db.setting.findUnique({ where: { key: 'site' } }).catch(() => null);
      const url = (site?.value as { url?: string } | null)?.url ?? String(cfg.siteUrl ?? '');
      return url.replace(/\/+$/, '');
    }

    // Resuelve la directiva robots desde el ajuste "SEO global" (clave `seo`).
    async function resolveRobotsDirective(): Promise<string> {
      const seo = await db.setting.findUnique({ where: { key: 'seo' } }).catch(() => null);
      return String((seo?.value as { robots?: string } | null)?.robots ?? 'index,follow');
    }

    fastify.get('/sitemap.xml', async (_req: unknown, reply: { header: (n: string, v: string) => unknown }) => {
      const siteUrl = await resolveSiteUrl();
      const exclude = new Set((Array.isArray(cfg.sitemapExcludePaths) ? cfg.sitemapExcludePaths : []) as string[]);

      const [pages, contents, posts, products] = await Promise.all([
        db.page.findMany({ select: { slug: true, updatedAt: true } }).catch(() => []),
        db.content.findMany({ where: { status: 'published' }, select: { slug: true, type: true, updatedAt: true } }).catch(() => []),
        db.blogPost.findMany({ where: { status: 'published' }, select: { id: true, updatedAt: true } }).catch(() => []),
        db.product.findMany({ select: { id: true } }).catch(() => []),
      ]);

      const entries: Array<{ loc: string; lastmod?: string }> = [];
      const add = (path: string, lastmod?: Date) => {
        if (exclude.has(path)) return;
        entries.push({ loc: `${siteUrl}${path}`, lastmod: lastmod?.toISOString().slice(0, 10) });
      };

      add('/');
      for (const p of pages as Array<{ slug: string; updatedAt: Date }>) add(`/${p.slug}`, p.updatedAt);
      for (const c of contents as Array<{ slug: string; type: string; updatedAt: Date }>) {
        add(`/${c.type === 'page' ? '' : `${c.type}/`}${c.slug}`, c.updatedAt);
      }
      for (const b of posts as Array<{ id: string; updatedAt: Date }>) add(`/blog/${b.id}`, b.updatedAt);
      for (const pr of products as Array<{ id: string }>) add(`/store/${pr.id}`);

      const xml = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${entries
        .map((e) => `<url><loc>${e.loc}</loc>${e.lastmod ? `<lastmod>${e.lastmod}</lastmod>` : ''}</url>`)
        .join('')}</urlset>`;
      reply.header('Content-Type', 'application/xml');
      return xml;
    });

    fastify.get('/robots.txt', async (_req: unknown, reply: { header: (n: string, v: string) => unknown }) => {
      const siteUrl = await resolveSiteUrl();
      const directive = await resolveRobotsDirective();
      const [allow, follow] = directive.split(',');
      reply.header('Content-Type', 'text/plain');
      return `User-agent: *\nAllow: /\n${follow === 'nofollow' ? 'NoFollow' : ''}${siteUrl ? `\nSitemap: ${siteUrl}/api/v1/blocks/seo/sitemap.xml` : ''}`.replace(/\n\n+/, '\n');
    });

    fastify.get('/meta', async () => {
      const [seo, site] = await Promise.all([
        db.setting.findUnique({ where: { key: 'seo' } }).catch(() => null),
        db.setting.findUnique({ where: { key: 'site' } }).catch(() => null),
      ]);
      const seoValue = (seo?.value ?? {}) as Record<string, unknown>;
      const siteValue = (site?.value ?? {}) as Record<string, unknown>;
      return {
        siteUrl: await resolveSiteUrl(),
        title: String(cfg.defaultTitle ?? siteValue.name ?? ''),
        metaDescription: String(seoValue.metaDescription ?? cfg.metaDescription ?? ''),
        robots: String(seoValue.robots ?? 'index,follow'),
        ogImageUrl: String(cfg.ogImageUrl ?? ''),
        twitterHandle: String(cfg.twitterHandle ?? ''),
        enableSchemaOrg: Boolean(cfg.enableSchemaOrg ?? true),
      };
    });
  },
});
