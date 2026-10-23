/**
 * Catálogo definitivo de features ("plantilla definitiva").
 *
 * La licencia firmada (Ed25519) trae un array `features` con flags inmutables;
 * aquí se define el conjunto canónico de flags que Webs entiende, separando
 * funcionalidad núcleo (siempre disponible) de funcionalidad premium
 * (licencia-gated). `hasFeature()` en `LicenseService` consulta este catálogo.
 */

export interface LicenseFeature {
  /** Flag firmado dentro de la clave de activación. */
  key: string;
  label: string;
  description: string;
  area: 'core' | 'commerce' | 'ai' | 'scale' | 'extensions';
  /** `true` para funcionalidad base que no requiere licencia. */
  core: boolean;
}

export const LICENSE_FEATURES: LicenseFeature[] = [
  {
    key: 'core',
    label: 'Núcleo',
    description:
      'Funcionalidad base: auth, páginas, contenido, usuarios, roles, media y ajustes.',
    area: 'core',
    core: true,
  },
  {
    key: 'payments',
    label: 'Pagos',
    description: 'Cobros, pasarelas, suscripciones y facturación.',
    area: 'commerce',
    core: false,
  },
  {
    key: 'shipping',
    label: 'Envíos',
    description: 'Logística, cotización e integración con transportistas.',
    area: 'commerce',
    core: false,
  },
  {
    key: 'inventory',
    label: 'Inventario y tienda',
    description: 'Gestión de stock, productos y órdenes.',
    area: 'commerce',
    core: false,
  },
  {
    key: 'ai',
    label: 'Integraciones de IA',
    description: 'Asistentes, generación y análisis con IA.',
    area: 'ai',
    core: false,
  },
  {
    key: 'analytics',
    label: 'Analítica',
    description: 'Métricas, dashboards y reportes.',
    area: 'ai',
    core: false,
  },
  {
    key: 'multitenant',
    label: 'Cadenas multi-tenant',
    description: 'Organizaciones encadenadas y finanzas consolidadas.',
    area: 'scale',
    core: false,
  },
  {
    key: 'marketplace',
    label: 'Marketplace de plugins',
    description: 'Instalación y licenciamiento de plugins comerciales.',
    area: 'extensions',
    core: false,
  },
  {
    key: 'templates',
    label: 'Templates premium',
    description: 'Plantillas de sitio adicionales.',
    area: 'extensions',
    core: false,
  },
];

const BY_KEY = new Map(LICENSE_FEATURES.map((feature) => [feature.key, feature]));

/** Devuelve el catálogo canónico (para la UI de administración). */
export function listFeatures(): LicenseFeature[] {
  return LICENSE_FEATURES;
}

/** `true` si el flag corresponde a funcionalidad núcleo (siempre disponible). */
export function isCoreFeature(key: string): boolean {
  return BY_KEY.get(key)?.core === true;
}

/** `true` si el flag es conocido en el catálogo. */
export function isKnownFeature(key: string): boolean {
  return BY_KEY.has(key);
}
