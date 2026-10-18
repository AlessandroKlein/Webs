/** Payload del token de acceso (JWT de corta vida). */
export interface AccessTokenPayload {
  /** Identificador del usuario. */
  sub: string;
  email: string;
  /** Permisos efectivos del usuario al momento de emitir el token. */
  permissions: string[];
}

// Nota: el refresh token NO es un JWT; es un valor opaco aleatorio (48 bytes
// en hex) cuyo hash SHA-256 se guarda en la tabla `Session`. Ver
// apps/api/src/modules/auth/service.ts.

