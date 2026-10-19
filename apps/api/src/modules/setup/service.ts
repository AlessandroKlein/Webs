import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { createRequire } from 'node:module';
import fs from 'node:fs';
import path from 'node:path';
import { BadRequestError } from '@webs/core';
import { appDir, dataDir, prismaDir } from '../../lib/paths';
import { writeState } from '../../lib/state';

const execFileAsync = promisify(execFile);
const require = createRequire(import.meta.url);

export const SUPPORTED_PROVIDERS = ['postgresql', 'sqlite', 'mysql'] as const;
export type DatabaseProvider = (typeof SUPPORTED_PROVIDERS)[number];

export interface DatabaseConfig {
  provider: DatabaseProvider;
  host?: string;
  port?: number;
  name?: string;
  user?: string;
  password?: string;
  ssl?: boolean;
  file?: string;
}

export interface SiteConfig {
  name: string;
  tagline?: string;
  logoUrl?: string;
  logoDarkUrl?: string;
  iconUrl?: string;
  faviconUrl?: string;
  defaultLocale?: string;
}

export interface SmtpConfig {
  enabled: boolean;
  host?: string;
  port?: number;
  user?: string;
  password?: string;
  from?: string;
  secure?: boolean;
}

export interface AdminConfig {
  email: string;
  password: string;
  displayName?: string;
  username?: string;
}

export interface InstallPayload {
  database: DatabaseConfig;
  site: SiteConfig;
  smtp: SmtpConfig;
  admin: AdminConfig;
  /** Plantilla opcional a aplicar tras la instalación (gym, market, …). */
  template?: string;
}

/** Construye la URL de conexión según el motor elegido. */
export function buildDatabaseUrl(db: DatabaseConfig): string {
  switch (db.provider) {
    case 'sqlite':
      return `file:${db.file ?? './data/webs.db'}`;
    case 'mysql':
      return `mysql://${db.user}:${db.password}@${db.host ?? 'localhost'}:${db.port ?? 3306}/${db.name}`;
    case 'postgresql':
    default:
      return `postgresql://${db.user}:${db.password}@${db.host ?? 'localhost'}:${db.port ?? 5432}/${db.name}?schema=public${
        db.ssl ? '&sslmode=require' : ''
      }`;
  }
}

/** Ruta del esquema Prisma correspondiente a un motor. */
export function schemaPathFor(provider: DatabaseProvider): string {
  const file = provider === 'postgresql' ? 'schema.prisma' : `schema.${provider}.prisma`;
  return path.join(prismaDir(), file);
}

function prismaCliEntry(): string {
  return require.resolve('prisma/build/index.js');
}

async function runPrisma(args: string[], env: Record<string, string>): Promise<string> {
  try {
    const { stdout, stderr } = await execFileAsync(process.execPath, [prismaCliEntry(), ...args], {
      env: { ...process.env, ...env },
      maxBuffer: 16 * 1024 * 1024,
      windowsHide: true,
    });
    return `${stdout}\n${stderr}`;
  } catch (err) {
    const e = err as { stdout?: string; stderr?: string; message?: string };
    throw new BadRequestError(
      `No se pudo conectar/crear la base de datos: ${(e.stderr ?? e.stdout ?? e.message ?? '').trim()}`,
    );
  }
}

/** Prueba la conexión (no modifica nada): `prisma db pull --print`. */
export async function testDatabase(db: DatabaseConfig): Promise<{ ok: boolean }> {
  const url = buildDatabaseUrl(db);
  await runPrisma(['db', 'pull', '--print', '--schema', schemaPathFor(db.provider)], {
    DATABASE_URL: url,
  });
  return { ok: true };
}

/** Ejecuta la instalación completa y devuelve `installed: true`. */
export async function install(payload: InstallPayload): Promise<{ installed: true }> {
  const url = buildDatabaseUrl(payload.database);
  const schema = schemaPathFor(payload.database.provider);
  const data = dataDir();

  // 1. Persiste el payload para el script de finalización (seed + admin + settings).
  fs.mkdirSync(data, { recursive: true });
  fs.writeFileSync(path.join(data, 'setup-payload.json'), JSON.stringify(payload, null, 2), 'utf8');

  // 2. Crea el esquema en el motor elegido.
  await runPrisma(['db', 'push', '--schema', schema, '--skip-generate'], { DATABASE_URL: url });

  // 3. Regenera el cliente Prisma para ese motor.
  await runPrisma(['generate', '--schema', schema], { DATABASE_URL: url });

  // 4. Seed + admin + settings en un proceso nuevo (importa el cliente recién generado).
  const finishScript = path.resolve(appDir(), '../../scripts/setup-finish.mjs');
  await execFileAsync(process.execPath, [finishScript], {
    env: { ...process.env, DATABASE_URL: url, DATA_DIR: data },
    maxBuffer: 16 * 1024 * 1024,
    windowsHide: true,
  });

  // 5. Marca la instalación como completada (y plantilla pendiente si se eligió).
  writeState({
    installed: true,
    databaseProvider: payload.database.provider,
    databaseUrl: url,
    installedAt: new Date().toISOString(),
    pendingTemplate: payload.template ?? undefined,
  });

  return { installed: true };
}
