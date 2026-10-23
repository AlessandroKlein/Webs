import path from 'node:path';

/**
 * Rutas base del proceso de la API. Todo se resuelve respecto a `APP_DIR`
 * (por defecto el directorio de trabajo actual, que es `apps/api` al ejecutar
 * con los scripts de pnpm). En Docker se puede fijar `APP_DIR=/app/apps/api`.
 */
export function appDir(): string {
  return process.env.APP_DIR ? path.resolve(process.env.APP_DIR) : process.cwd();
}

export function prismaDir(): string {
  return path.join(appDir(), 'prisma');
}

export function dataDir(): string {
  return process.env.DATA_DIR ? path.resolve(process.env.DATA_DIR) : path.join(appDir(), 'data');
}

/** Directorio de plugins locales (antes `blocks`). Se mantiene `BLOCK_DIR` como clave de config. */
export function pluginsDir(configured?: string): string {
  return path.resolve(appDir(), configured ?? '../../plugins');
}

/** @deprecated Usar {@link pluginsDir}. Alias por retrocompatibilidad. */
export function blocksDir(configured?: string): string {
  return pluginsDir(configured);
}

/** Directorio de plantillas (presets) de sitios. */
export function templatesDir(configured?: string): string {
  return path.resolve(appDir(), configured ?? '../../templates');
}
