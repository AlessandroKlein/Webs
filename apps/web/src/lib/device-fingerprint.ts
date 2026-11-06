const STORAGE_KEY = 'webs.fingerprint';

/**
 * Huella de máquina estable por navegador. SHA-256 de userAgent + plataforma +
 * resolución + zona horaria, persistida en localStorage. Si crypto.subtle no
 * está disponible (contexto no seguro) cae a un id aleatorio persistido.
 */
export async function getDeviceFingerprint(): Promise<string> {
  const cached = localStorage.getItem(STORAGE_KEY);
  if (cached) return cached;

  const source = [
    navigator.userAgent,
    navigator.platform,
    `${screen.width}x${screen.height}`,
    Intl.DateTimeFormat().resolvedOptions().timeZone,
  ].join('|');

  let fingerprint: string;
  try {
    const data = new TextEncoder().encode(source);
    const digest = await crypto.subtle.digest('SHA-256', data);
    fingerprint = Array.from(new Uint8Array(digest))
      .map((b) => b.toString(16).padStart(2, '0'))
      .join('');
  } catch {
    fingerprint =
      (typeof crypto !== 'undefined' && 'randomUUID' in crypto && crypto.randomUUID()) ||
      `fp-${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
  }

  localStorage.setItem(STORAGE_KEY, fingerprint);
  return fingerprint;
}
