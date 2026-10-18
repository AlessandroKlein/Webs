import { PrismaClient } from '@prisma/client';

/**
 * Cliente Prisma singleton. En tests se puede inyectar una instancia aislada.
 * `import { prisma } from '.../lib/prisma'` en cualquier módulo.
 */
export const prisma = new PrismaClient();
