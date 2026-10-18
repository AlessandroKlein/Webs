/** Token de acceso en memoria (no se persiste por seguridad). */
let accessToken: string | null = null;

export function getAccessToken(): string | null {
  return accessToken;
}

export function setAccessToken(token: string | null): void {
  accessToken = token;
}

/** Token temporal para el flujo de activación de 2FA/passkey (en memoria). */
let setupToken: string | null = null;

export function getSetupToken(): string | null {
  return setupToken;
}

export function setSetupToken(token: string | null): void {
  setupToken = token;
}
