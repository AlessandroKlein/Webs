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

  SEED_ADMIN_EMAIL: z.string().email().optional(),
  SEED_ADMIN_PASSWORD: z.string().optional(),
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

  return env;
}

export function corsOrigins(env: Env): string[] {
  return env.CORS_ORIGIN.split(',').map((s) => s.trim()).filter(Boolean);
}
