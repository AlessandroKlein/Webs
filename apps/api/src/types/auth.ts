/** Payload del token de acceso (JWT de corta vida). */
export interface AccessTokenPayload {
  /** Identificador del usuario. */
  sub: string;
  email?: string;
  /** Permisos efectivos del usuario (token de acceso) o scopes (token de API). */
  permissions?: string[];
  /** Tipo de token. */
  type?: 'access' | 'api_token' | 'setup_2fa';
  /** Identificador del token de API (solo `api_token`). */
  tokenId?: string;
  /** Permisos acotados del token de API (solo `api_token`). */
  scopes?: string[];
}

// Nota: el refresh token NO es un JWT; es un valor opaco aleatorio (48 bytes
// en hex) cuyo hash SHA-256 se guarda en la tabla `Session`. Ver
// apps/api/src/modules/auth/service.ts.
