#!/usr/bin/env node
/**
 * Genera los esquemas Prisma específicos de cada motor a partir del canónico
 * (`schema.prisma`, PostgreSQL). Los tres comparten exactamente los mismos
 * modelos; solo difiere la línea `provider`.
 *
 * Uso: node scripts/generate-prisma-schemas.mjs
 */
import fs from 'node:fs';
import path from 'node:path';

const basePath = path.resolve('apps/api/prisma/schema.prisma');
const base = fs.readFileSync(basePath, 'utf8');

for (const provider of ['sqlite', 'mysql']) {
  if (!base.includes('provider = "postgresql"')) {
    throw new Error('No se encontró provider = "postgresql" en schema.prisma');
  }
  const out = base.replace('provider = "postgresql"', `provider = "${provider}"`);
  const target = path.resolve(`apps/api/prisma/schema.${provider}.prisma`);
  fs.writeFileSync(target, out, 'utf8');
  console.log(`✔ generado ${path.relative(process.cwd(), target)}`);
}
