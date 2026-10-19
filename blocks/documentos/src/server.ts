import { defineBlock, type BlockManifest } from '@webs/plugin-sdk';
import manifestJson from '../block.json';

const manifest = manifestJson as unknown as BlockManifest;

interface DocumentosConfig {
  requireSignature?: boolean;
  auditTrail?: boolean;
  signatureProvider?: string;
}

/**
 * Bloque de documentos y firma electrónica. Rutas bajo
 * `/api/v1/blocks/documentos`.
 */
export default defineBlock(manifest, {
  register: async (fastify, config) => {
    const cfg = config as DocumentosConfig;

    const db = (fastify as unknown as { prisma: Record<string, any> }).prisma;
    const authenticate = (fastify as unknown as { authenticate: unknown }).authenticate as (
      req: unknown,
    ) => Promise<void>;

    // TODO(firma electrónica): con `signatureProvider` distinto de "local" la
    // firma (`signed=true`) se delegaría a un proveedor externo (DocuSign, etc.).
    void cfg.signatureProvider;

    fastify.get('/documents', async () => db.document.findMany({ orderBy: { createdAt: 'desc' } }));

    fastify.post(
      '/documents',
      { preHandler: [authenticate] },
      async (request: unknown) => {
        const { body } = request as {
          body?: { name?: string; content?: string; userId?: string };
        };
        return db.document.create({
          data: {
            name: body?.name ?? '',
            content: body?.content ?? '',
            userId: body?.userId ?? null,
          },
        });
      },
    );

    fastify.patch(
      '/documents/:id',
      { preHandler: [authenticate] },
      async (request: unknown) => {
        const { params, body } = request as {
          params?: { id?: string };
          body?: { name?: string; content?: string; signed?: boolean };
        };
        const data: Record<string, unknown> = {};
        if (body?.name !== undefined) data.name = body.name;
        if (body?.content !== undefined) data.content = body.content;
        if (body?.signed !== undefined) data.signed = Boolean(body.signed);
        return db.document.update({ where: { id: params?.id }, data });
      },
    );

    fastify.delete(
      '/documents/:id',
      { preHandler: [authenticate] },
      async (request: unknown) => {
        const { params } = request as { params?: { id?: string } };
        await db.document.delete({ where: { id: params?.id } });
        return { ok: true };
      },
    );

    fastify.post(
      '/documents/:id/sign',
      { preHandler: [authenticate] },
      async (request: unknown) => {
        const { params } = request as { params?: { id?: string } };
        return db.document.update({ where: { id: params?.id }, data: { signed: true } });
      },
    );
  },
});
