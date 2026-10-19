import { Queue, Worker } from 'bullmq';
import type { FastifyInstance } from 'fastify';

/**
 * Cola de trabajos genérica (BullMQ con Redis). Si no hay Redis, `enqueueJob`
 * no hace nada (el llamador decide el fallback) y `startWorker` no arranca.
 * Se usa para email, generación de reportes, procesamiento de imágenes, etc.
 */

export interface EnqueueOptions {
  delay?: number;
  attempts?: number;
}

/**
 * BullMQ exige `maxRetriesPerRequest: null` para sus comandos bloqueantes, así
 * que construye una conexión propia desde REDIS_URL en lugar de reutilizar la
 * instancia compartida de `fastify.redis` (que usa maxRetriesPerRequest=3).
 */
function bullConnection(url?: string) {
  if (!url) return undefined;
  const u = new URL(url);
  return {
    host: u.hostname,
    port: Number(u.port || 6379),
    ...(u.password ? { password: decodeURIComponent(u.password) } : {}),
    maxRetriesPerRequest: null,
  };
}

export async function enqueueJob(
  fastify: FastifyInstance,
  queueName: string,
  jobName: string,
  data: unknown,
  opts?: EnqueueOptions,
): Promise<void> {
  const connection = bullConnection(fastify.config.REDIS_URL);
  if (!connection) return;
  const queue = new Queue(queueName, { connection });
  await queue.add(jobName, data, {
    delay: opts?.delay ?? 0,
    attempts: opts?.attempts ?? 3,
    backoff: { type: 'exponential', delay: 1000 },
  });
  await queue.close();
}

export function startWorker(
  fastify: FastifyInstance,
  queueName: string,
  handler: (data: unknown) => Promise<void>,
): void {
  const connection = bullConnection(fastify.config.REDIS_URL);
  if (!connection) return;
  const worker = new Worker(
    queueName,
    async (job) => handler(job.data),
    { connection, concurrency: 5 },
  );
  worker.on('failed', (job, err) => fastify.log.warn({ err, jobId: job?.id }, `job '${queueName}' fallido`));
  fastify.addHook('onClose', async () => worker.close());
}
