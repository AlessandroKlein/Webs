export const createUserSchema = {
  type: 'object',
  required: ['email', 'password'],
  properties: {
    email: { type: 'string', format: 'email' },
    password: { type: 'string', minLength: 8 },
    displayName: { type: 'string' },
    locale: { type: 'string' },
    roles: { type: 'array', items: { type: 'string' } },
  },
} as const;

export const updateUserSchema = {
  type: 'object',
  properties: {
    email: { type: 'string', format: 'email' },
    password: { type: 'string', minLength: 8 },
    displayName: { type: 'string', nullable: true },
    locale: { type: 'string' },
    active: { type: 'boolean' },
    roles: { type: 'array', items: { type: 'string' } },
  },
} as const;

export interface CreateUserBody {
  email: string;
  password: string;
  displayName?: string;
  locale?: string;
  roles?: string[];
}

export interface UpdateUserBody {
  email?: string;
  password?: string;
  displayName?: string | null;
  locale?: string;
  active?: boolean;
  roles?: string[];
}
