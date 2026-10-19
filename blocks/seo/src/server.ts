import { defineBlock, type BlockManifest } from '@webs/plugin-sdk';
import manifestJson from '../block.json';

const manifest = manifestJson as unknown as BlockManifest;

export default defineBlock(manifest, {
  register: async (fastify, config) => {
    const cfg = config as Record<string, unknown>;
    const siteUrl = String(cfg.siteUrl ?? '');

    fastify.get('/sitemap.xml', async (_req: unknown, reply: { header: (n: string, v: string) => unknown }) => {
      const urls = ['/', '/store'].map((p) => `${siteUrl}${p}`);
      const xml = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${urls
        .map((u) => `<url><loc>${u}</loc></url>`)
        .join('')}</urlset>`;
      reply.header('Content-Type', 'application/xml');
      return xml;
    });

    fastify.get('/robots.txt', async (_req: unknown, reply: { header: (n: string, v: string) => unknown }) => {
      reply.header('Content-Type', 'text/plain');
      return `User-agent: *\nAllow: /\n${siteUrl ? `Sitemap: ${siteUrl}/api/v1/blocks/seo/sitemap.xml` : ''}`;
    });

    fastify.get('/meta', async () => ({ siteUrl, metaDescription: cfg.metaDescription ?? '' }));
  },
});
