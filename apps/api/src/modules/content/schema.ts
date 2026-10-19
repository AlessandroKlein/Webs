/** Estado del ciclo de vida de un contenido: borrador, publicado o programado. */
export type ContentStatus = 'draft' | 'published' | 'scheduled';

/** Esquema de validación para crear contenido: exige `slug` y `title`. */
export const createContentSchema = {
  type: 'object',
  required: ['slug', 'title'],
  properties: {
    type: { type: 'string', default: 'page' },
    slug: { type: 'string', pattern: '^[a-z0-9][a-z0-9-]*$' },
    title: { type: 'object', additionalProperties: { type: 'string' } },
    body: { type: 'object', additionalProperties: { type: 'string' } },
    status: { type: 'string', enum: ['draft', 'published', 'scheduled'], default: 'draft' },
    seo: { type: 'object' },
  },
} as const;

/** Esquema de validación para actualizar contenido: todos los campos son opcionales. */
export const updateContentSchema = {
  type: 'object',
  properties: {
    slug: { type: 'string', pattern: '^[a-z0-9][a-z0-9-]*$' },
    title: { type: 'object', additionalProperties: { type: 'string' } },
    body: { type: 'object', additionalProperties: { type: 'string' } },
    status: { type: 'string', enum: ['draft', 'published', 'scheduled'] },
    seo: { type: 'object', nullable: true },
  },
} as const;

/** Metadatos SEO opcionales asociados a un contenido. */
export interface ContentSeo {
  title?: string;
  description?: string;
  keywords?: string;
  ogImageUrl?: string;
  canonicalUrl?: string;
}

/** Cuerpo esperado al crear contenido. */
export interface CreateContentBody {
  type?: string;
  slug: string;
  title: Record<string, string>;
  body?: Record<string, string>;
  status?: ContentStatus;
  seo?: ContentSeo;
}

/** Cuerpo esperado al actualizar contenido (todos los campos opcionales). */
export interface UpdateContentBody {
  slug?: string;
  title?: Record<string, string>;
  body?: Record<string, string>;
  status?: ContentStatus;
  seo?: ContentSeo | null;
}
