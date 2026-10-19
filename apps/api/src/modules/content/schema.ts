export type ContentStatus = 'draft' | 'published' | 'scheduled';

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

export interface ContentSeo {
  title?: string;
  description?: string;
  keywords?: string;
  ogImageUrl?: string;
  canonicalUrl?: string;
}

export interface CreateContentBody {
  type?: string;
  slug: string;
  title: Record<string, string>;
  body?: Record<string, string>;
  status?: ContentStatus;
  seo?: ContentSeo;
}

export interface UpdateContentBody {
  slug?: string;
  title?: Record<string, string>;
  body?: Record<string, string>;
  status?: ContentStatus;
  seo?: ContentSeo | null;
}
