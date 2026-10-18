export const createRoleSchema = {
  type: 'object',
  required: ['key', 'name'],
  properties: {
    key: { type: 'string', pattern: '^[a-z0-9][a-z0-9_]*$' },
    name: { type: 'string', minLength: 1 },
    description: { type: 'string' },
    permissions: { type: 'array', items: { type: 'string' } },
  },
} as const;

export const updateRoleSchema = {
  type: 'object',
  properties: {
    name: { type: 'string' },
    description: { type: 'string', nullable: true },
    permissions: { type: 'array', items: { type: 'string' } },
  },
} as const;

export interface CreateRoleBody {
  key: string;
  name: string;
  description?: string;
  permissions?: string[];
}

export interface UpdateRoleBody {
  name?: string;
  description?: string | null;
  permissions?: string[];
}
