export const loginSchema = {
  type: 'object',
  required: ['identifier', 'password'],
  properties: {
    identifier: { type: 'string', minLength: 1 },
    password: { type: 'string', minLength: 8 },
    totp: { type: 'string' },
    smsCode: { type: 'string' },
    rememberMe: { type: 'boolean' },
  },
} as const;

export const registerSchema = {
  type: 'object',
  required: ['email', 'password'],
  properties: {
    email: { type: 'string', format: 'email' },
    password: { type: 'string', minLength: 8 },
    displayName: { type: 'string', minLength: 1 },
    firstName: { type: 'string' },
    lastName: { type: 'string' },
    birthDate: { type: 'string' },
    username: { type: 'string', minLength: 3 },
    inviteToken: { type: 'string' },
  },
} as const;

export interface LoginBody {
  identifier: string;
  password: string;
  totp?: string;
  smsCode?: string;
  rememberMe?: boolean;
}

export interface RegisterBody {
  email: string;
  password: string;
  displayName?: string;
  firstName?: string;
  lastName?: string;
  birthDate?: string;
  username?: string;
  inviteToken?: string;
}
