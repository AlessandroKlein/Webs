import 'dotenv/config';
import { z } from 'zod';

/**
 * Esquema y carga de variables de entorno. Es la única puerta de entrada a
 * `process.env`: el resto del código consume el objeto tipado `Env`.
 */
const boolFromEnv = z.preprocess((v) => v === 'true' || v === true || v === 1 || v === '1', z.boolean());

/**
 * Defaults de desarrollo SOLO para entornos no productivos. En producción
 * `loadEnv` falla (fail-fast) si los secretos JWT faltan o coinciden con estos
 * valores, para evitar tokens forgeables.
 */
const DEFAULT_JWT_SECRET = 'dev-secret-change-me-please-0123456789';
const DEFAULT_JWT_REFRESH_SECRET = 'dev-refresh-secret-change-me-0123456789';

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  HOST: z.string().default('0.0.0.0'),
  PORT: z.coerce.number().int().positive().default(4000),

  DATABASE_URL: z.string().optional(),
  REDIS_URL: z.string().url().optional(),

  // Base de datos separada para la telemetría IoT (ADR-0027). Fuera del
  // schema Prisma; se accede con un pool `pg` dedicado (t170).
  IOT_DATABASE_URL: z.string().url().optional(),

  JWT_SECRET: z.string().min(32).default(DEFAULT_JWT_SECRET),
  JWT_REFRESH_SECRET: z.string().min(32).default(DEFAULT_JWT_REFRESH_SECRET),

  CORS_ORIGIN: z.string().default('http://localhost:5173'),
  LOG_LEVEL: z
    .enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent'])
    .default('info'),

  BLOCK_DIR: z.string().optional(),
  BLOCK_REGISTRY_URL: z.string().url().optional(),

  // TLS / HTTPS (opcional, decidido por el usuario)
  SSL_ENABLED: boolFromEnv.default(false),
  SSL_CERT_PATH: z.string().optional(),
  SSL_KEY_PATH: z.string().optional(),
  SSL_CERT: z.string().optional(),
  SSL_KEY: z.string().optional(),

  // Clave maestra para cifrado de datos sensibles (AES-256-GCM). Obligatoria
  // solo si se cifran columnas PII. Usar `openssl rand -hex 32`.
  ENCRYPTION_KEY: z.string().optional(),

  // Clave pública Ed25519 (PEM SPKI) del vendedor de licencias (Licensify).
  // Opcional: sin ella el módulo de licencias queda 'unconfigured' y la
  // activación se rechaza. La clave privada NUNCA se embebe en la app.
  LICENSE_PUBLIC_KEY: z.string().optional(),

  // Modo de licenciamiento:
  // - `auto` (default): `dev` si NODE_ENV != production, `production` si no.
  // - `dev`: habilita todas las features SIN licencia (stack local de Docker).
  //   La app NO arranca con NODE_ENV=production + dev.
  // - `production`: las features premium exigen una licencia activa.
  LICENSE_MODE: z.enum(['auto', 'dev', 'production']).default('auto'),

  // Clave privada Ed25519 (PEM PKCS#8) del vendedor, SOLO para la instancia de
  // emisión/venta (panel admin de claves). No se embebe en la app: se inyecta
  // por entorno únicamente en el entorno del vendedor. Sin ella, `POST
  // /license/keys` solo puede REGISTRAR claves ya emitidas por @licensify/cli
  // (nunca firmar). Generar con @licensify/cli (`generateKeyPair`).
  LICENSE_PRIVATE_KEY: z.string().optional(),

  SEED_ADMIN_EMAIL: z.string().email().optional(),
  SEED_ADMIN_PASSWORD: z.string().optional(),

  // Actualización de la app (updater / bootloader, ADR-0010).
  // Clave pública Ed25519 (PEM SPKI) del proveedor para verificar la firma de
  // los artefactos de release. Opcional: sin ella `POST /system/update/apply`
  // rechaza las actualizaciones (no puede verificar autenticidad).
  UPDATE_PUBLIC_KEY: z.string().optional(),
  // 'auto' detecta Docker vs bare; 'bare' fuerza swap atómico + reload; 'docker'
  // fuerza rolling update vía `docker compose`.
  UPDATE_MODE: z.enum(['auto', 'bare', 'docker']).default('auto'),
  // Nombre del servicio a actualizar en Docker Compose (por defecto 'api').
  UPDATE_DOCKER_SERVICE: z.string().default('api'),
});

export type Env = z.infer<typeof envSchema>;

export function loadEnv(source: NodeJS.ProcessEnv = process.env): Env {
  const parsed = envSchema.safeParse(source);
  if (!parsed.success) {
    console.error('Variables de entorno inválidas:\n' + JSON.stringify(parsed.error.issues, null, 2));
    throw new Error('Configuración de entorno inválida');
  }
  const env = parsed.data;

  // F1 (P0): en producción los secretos JWT deben ser fuertes y propios. Si
  // faltan (default aplicado) o coinciden con el default de desarrollo, la app
  // NO arranca: de lo contrario cualquier atacante podría forjar tokens.
  // Rotación: regenerar con `openssl rand -base64 48` y actualizar las variables
  // de entorno (todas las instancias), invalidando sesiones/refresh previos.
  if (env.NODE_ENV === 'production') {
    const insecure: string[] = [];
    if (!env.JWT_SECRET || env.JWT_SECRET === DEFAULT_JWT_SECRET) insecure.push('JWT_SECRET');
    if (!env.JWT_REFRESH_SECRET || env.JWT_REFRESH_SECRET === DEFAULT_JWT_REFRESH_SECRET) {
      insecure.push('JWT_REFRESH_SECRET');
    }
    if (insecure.length) {
      console.error(
        `Secretos JWT inseguros en producción (${insecure.join(', ')}): ` +
          'definí valores fuertes (>=32 caracteres) distintos del default de desarrollo.',
      );
      throw new Error('Configuración de seguridad inválida: secretos JWT inseguros');
    }
  }

  // F2 (Licensify, P0): el modo `dev` habilita todas las features sin licencia.
  // Sólo es válido fuera de producción; en producción la app NO arranca para
  // que no quede una instalación "completa" por una variable de entorno mal
  // copiada (el bypass real exige editar código o controlar el host).
  const licenseMode: LicenseMode = resolveLicenseMode(env);
  if (env.NODE_ENV === 'production' && licenseMode === 'dev') {
    console.error(
      'LICENSE_MODE=dev no está permitido con NODE_ENV=production: ' +
        'usá LICENSE_MODE=production y una licencia activa, o NODE_ENV=development para pruebas locales.',
    );
    throw new Error('Configuración de licencia inválida: modo dev en producción');
  }

  return env;
}

export type LicenseMode = 'production' | 'dev';

/** Resuelve `LICENSE_MODE` (`auto` según NODE_ENV) al modo efectivo. */
export function resolveLicenseMode(env: Pick<Env, 'LICENSE_MODE' | 'NODE_ENV'>): LicenseMode {
  if (env.LICENSE_MODE === 'dev') return 'dev';
  if (env.LICENSE_MODE === 'production') return 'production';
  return env.NODE_ENV === 'production' ? 'production' : 'dev';
}

export function corsOrigins(env: Env): string[] {
  return env.CORS_ORIGIN.split(',').map((s) => s.trim()).filter(Boolean);
}
