import { PrismaClient } from '@prisma/client';

/**
 * Crea un cliente Prisma. La URL se puede sobrescribir en tiempo de ejecución
 * (Prisma lo permite vía `datasources`), lo que permite reconectar al motor
 * elegido durante la instalación. El `provider` viene "compilado" en el cliente
 * generado (por eso el instalador regenera el cliente según el motor elegido).
 */
export function createPrismaClient(databaseUrl?: string): PrismaClient {
  if (!databaseUrl) return new PrismaClient();
  return new PrismaClient({ datasources: { db: { url: databaseUrl } } });
}
