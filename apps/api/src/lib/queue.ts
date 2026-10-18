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

export async function enqueueJob(
  fastify: FastifyInstance,
  queueName: string,
  jobName: string,
  data: unknown,
  opts?: EnqueueOptions,
): Promise<void> {
  if (!fastify.redis) return;
  const queue = new Queue(queueName, { connection: fastify.redis as never });
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
  if (!fastify.redis) return;
  const worker = new Worker(
    queueName,
    async (job) => handler(job.data),
    { connection: fastify.redis as never, concurrency: 5 },
  );
  worker.on('failed', (job, err) => fastify.log.warn({ err, jobId: job?.id }, `job '${queueName}' fallido`));
  fastify.addHook('onClose', async () => worker.close());
}
