import { buildApp } from './app';
import { loadEnv } from './config/env';

/**
 * Punto de entrada del proceso. En producción, se puede escalar horizontalmente
 * (múltiples procesos con `node dist/index.js` detrás de un balanceador, o en
 * Kubernetes con N réplicas); Redis se encarga de sincronizar WebSocket y caché.
 */
async function main(): Promise<void> {
  const env = loadEnv();
  const app = await buildApp({ env });

  let shuttingDown = false;
  const shutdown = async (signal: string): Promise<void> => {
    if (shuttingDown) return;
    shuttingDown = true;
    app.log.info({ signal }, 'recibida señal de apagado');
    try {
      await app.close();
      process.exit(0);
    } catch (err) {
      app.log.error(err, 'error durante el apagado');
      process.exit(1);
    }
  };

  process.on('SIGINT', () => void shutdown('SIGINT'));
  process.on('SIGTERM', () => void shutdown('SIGTERM'));
  process.on('unhandledRejection', (reason) => {
    app.log.error({ reason }, 'unhandledRejection');
  });

  try {
    await app.listen({ host: env.HOST, port: env.PORT });
  } catch (err) {
    app.log.error(err, 'no se pudo iniciar el servidor');
    process.exit(1);
  }
}

void main();
