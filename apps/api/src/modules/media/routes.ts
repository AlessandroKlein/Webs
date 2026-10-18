import multipart from '@fastify/multipart';
import sharp from 'sharp';
import type { FastifyInstance } from 'fastify';
import { BadRequestError, NotFoundError } from '@webs/core';
import { getStorageDriver, newStorageKey } from '../../lib/storage';

interface UploadFile {
  toBuffer(): Promise<Buffer>;
  mimetype: string;
}

export default async function mediaRoutes(fastify: FastifyInstance): Promise<void> {
  await fastify.register(multipart, { limits: { fileSize: 5 * 1024 * 1024, files: 1 } });

  fastify.post(
    '/media/upload',
    { schema: { tags: ['media'] }, preHandler: [fastify.authenticate, fastify.authorize('media.write')] },
    async (request) => {
      const file = (await (request as unknown as { file(): Promise<UploadFile | undefined> }).file()) ?? null;
      if (!file) throw new BadRequestError('No se envió un archivo');
      const buffer = await file.toBuffer();
      if (!file.mimetype.startsWith('image/')) throw new BadRequestError('Solo se permiten imágenes');

      // Procesa con sharp: rotación automática + redimensionado + WebP.
      let out = buffer;
      let mime = file.mimetype;
      let ext = file.mimetype.split('/')[1] ?? 'bin';
      try {
        out = await sharp(buffer).rotate().resize({ width: 1600, withoutEnlargement: true }).webp({ quality: 80 }).toBuffer();
        mime = 'image/webp';
        ext = 'webp';
      } catch {
        /* no procesable → se guarda el original */
      }

      const key = newStorageKey(ext);
      const driver = getStorageDriver(process.env.STORAGE_DRIVER);
      const url = await driver.put(key, out, mime);

      const media = await fastify.prisma.media.create({
        data: { key, mimeType: mime, size: out.length, url, alt: null },
      });
      return { id: media.id, url, size: out.length, mimeType: mime };
    },
  );

  fastify.get(
    '/media',
    { schema: { tags: ['media'] }, preHandler: [fastify.authenticate, fastify.authorize('media.read')] },
    async () => fastify.prisma.media.findMany({ orderBy: { createdAt: 'desc' }, take: 100 }),
  );

  fastify.get('/media/files/:key', async (request, reply) => {
    const key = (request.params as { key: string }).key;
    const driver = getStorageDriver(process.env.STORAGE_DRIVER);
    const data = await driver.get(key);
    if (!data) return reply.status(404).send();
    reply.header('Content-Type', 'image/webp');
    return reply.send(Buffer.from(data));
  });

  fastify.delete(
    '/media/:id',
    {
      schema: { tags: ['media'], params: { type: 'object', properties: { id: { type: 'string' } } } },
      preHandler: [fastify.authenticate, fastify.authorize('media.write')],
    },
    async (request, reply) => {
      const id = (request.params as { id: string }).id;
      const media = await fastify.prisma.media.findUnique({ where: { id } });
      if (!media) throw new NotFoundError('Medio');
      await getStorageDriver(process.env.STORAGE_DRIVER).delete(media.key);
      await fastify.prisma.media.delete({ where: { id } });
      return reply.status(204).send();
    },
  );
}
