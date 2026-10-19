/**
 * Helpers de cookies para preferencias (tema, idioma). Las cookies de sesión
 * (refresh token) las maneja el backend con httpOnly + Secure; estas son de
 * preferencia (legibles por JS) y se marcan SameSite=Lax + Secure.
 */

function isSecureContext(): boolean {
  if (typeof window === 'undefined') return false;
  return window.location.protocol === 'https:';
}

export function getCookie(name: string): string | null {
  if (typeof document === 'undefined') return null;
  const match = document.cookie.match(new RegExp('(?:^|; )' + name + '=([^;]*)'));
  const value = match?.[1] ?? '';
  return value ? decodeURIComponent(value) : null;
}

export function setCookie(
  name: string,
  value: string,
  days = 365,
  options?: { sameSite?: 'lax' | 'strict' | 'none'; secure?: boolean },
): void {
  if (typeof document === 'undefined') return;
  const maxAge = days * 86400;
  const expires = new Date(Date.now() + maxAge * 1000).toUTCString();
  const secure = options?.secure ?? isSecureContext();
  const sameSite = options?.sameSite ?? 'lax';
  const parts = [
    `${name}=${encodeURIComponent(value)}`,
    'path=/',
    `max-age=${maxAge}`,
    `expires=${expires}`,
    `SameSite=${sameSite}`,
  ];
  if (secure) parts.push('Secure');
  document.cookie = parts.join('; ');
}

export function deleteCookie(name: string): void {
  setCookie(name, '', -1);
}
