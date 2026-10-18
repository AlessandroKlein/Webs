import { S3Client, PutObjectCommand, GetObjectCommand, DeleteObjectCommand } from '@aws-sdk/client-s3';
import { defineBlock, type BlockManifest } from '@webs/plugin-sdk';
import manifestJson from '../block.json';

const manifest = manifestJson as unknown as BlockManifest;

/**
 * Bloque de almacenamiento de objetos (Amazon S3, Cloudflare R2, MinIO).
 * Registra el driver `s3` en el núcleo de media; activalo con `STORAGE_DRIVER=s3`.
 */
export default defineBlock(manifest, {
  register: async (fastify, options) => {
    const config = options as Record<string, unknown>;
    const bucket = String(config.bucket ?? '');
    const endpoint = config.endpoint ? String(config.endpoint) : undefined;
    const publicBaseUrl = config.publicBaseUrl ? String(config.publicBaseUrl) : undefined;

    const client = new S3Client({
      endpoint,
      region: String(config.region ?? 'auto'),
      credentials: {
        accessKeyId: String(config.accessKeyId ?? ''),
        secretAccessKey: String(config.secretAccessKey ?? ''),
      },
      forcePathStyle: true,
    });

    fastify.storage?.register({
      id: 's3',
      put: async (key, data, contentType) => {
        await client.send(new PutObjectCommand({ Bucket: bucket, Key: key, Body: data, ContentType: contentType }));
        return publicBaseUrl ? `${publicBaseUrl}/${key}` : `${endpoint}/${bucket}/${key}`;
      },
      get: async (key) => {
        try {
          const res = await client.send(new GetObjectCommand({ Bucket: bucket, Key: key }));
          return (await res.Body?.transformToByteArray()) ?? null;
        } catch {
          return null;
        }
      },
      delete: async (key) => {
        await client.send(new DeleteObjectCommand({ Bucket: bucket, Key: key }));
      },
    });
  },
});
