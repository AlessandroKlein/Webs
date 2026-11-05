import { lookup } from 'node:dns/promises';
import { isIP } from 'node:net';

import type { IotDeviceClientOptions } from './types';

const PRIVATE_IPV4 = [
  /^0\./, /^10\./, /^127\./, /^169\.254\./, /^172\.(1[6-9]|2[0-9]|3[0-1])\./, /^192\.168\./,
  /^22[4-9]\./, /^2[3-5][0-9]\./, /^240\./,
];
const PRIVATE_IPV6 = [/^::1$/, /^::$/, /^fc/i, /^fd/i, /^fe[89ab]/i, /^ff/i];

export function isPrivateIpv4(ip: string): boolean {
  return PRIVATE_IPV4.some((re) => re.test(ip));
}

export function isPrivateIpv6(ip: string): boolean {
  return PRIVATE_IPV6.some((re) => re.test(ip));
}

export function isPrivateIp(ip: string): boolean {
  const v = isIP(ip);
  if (v === 4) return isPrivateIpv4(ip);
  if (v === 6) return isPrivateIpv6(ip);
  return true;
}

/**
 * Resuelve `host` y verifica que TODAS sus direcciones sean públicas (o estén en
 * `allowlist`). Lanza si cualquier IP apunta a loopback/privada — protege contra SSRF.
 */
export async function assertSafeHost(host: string, allowlist: string[] = []): Promise<void> {
  const entries = await lookup(host, { all: true });
  for (const entry of entries) {
    const ip = entry.address;
    if (isPrivateIp(ip) && !allowlist.includes(ip) && !allowlist.includes(host)) {
      throw new Error(`Host bloqueado por seguridad (dirección privada/loopback): ${host} (${ip})`);
    }
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Cliente HTTP mínimo para sondear un dispositivo IoT con reintentos y SSRF-safe. */
export class DeviceClient {
  private readonly baseUrl: string;
  private readonly token?: string;
  private readonly authMode: NonNullable<IotDeviceClientOptions['authMode']>;
  private readonly timeoutMs: number;
  private readonly maxRetries: number;
  private readonly allowlist: string[];

  constructor(opts: IotDeviceClientOptions) {
    this.baseUrl = opts.baseUrl.replace(/\/+$/, '');
    this.token = opts.token;
    this.authMode = opts.authMode ?? 'bearer';
    this.timeoutMs = opts.timeoutMs ?? 5000;
    this.maxRetries = opts.maxRetries ?? 2;
    this.allowlist = opts.allowlist ?? [];
  }

  private authHeader(): Record<string, string> | undefined {
    if (!this.token) return undefined;
    switch (this.authMode) {
      case 'x-auth-token':
        return { 'X-Auth-Token': this.token };
      case 'x-api-key':
        return { 'X-API-Key': this.token };
      default:
        return { Authorization: `Bearer ${this.token}` };
    }
  }

  /** GET a una ruta del dispositivo, devolviendo el JSON. */
  async fetchJson<T = unknown>(path: string): Promise<T> {
    return this.request<T>('GET', path);
  }

  /** POST a una ruta del dispositivo (control), devolviendo el JSON. */
  async post<T = unknown>(path: string, body: unknown): Promise<T> {
    return this.request<T>('POST', path, body);
  }

  private async request<T>(method: 'GET' | 'POST', path: string, body?: unknown): Promise<T> {
    const url = new URL(path.startsWith('/') ? path : `/${path}`, `${this.baseUrl}/`);
    await assertSafeHost(url.hostname, this.allowlist);

    let lastErr: unknown;
    for (let attempt = 0; attempt <= this.maxRetries; attempt++) {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), this.timeoutMs);
      try {
        const res = await fetch(url.toString(), {
          method,
          signal: controller.signal,
          headers: {
            accept: 'application/json',
            ...(body !== undefined ? { 'content-type': 'application/json' } : {}),
            ...this.authHeader(),
          },
          ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
        });
        if (!res.ok) {
          throw new Error(`Dispositivo respondió HTTP ${res.status} en ${url.hostname}`);
        }
        return (await res.json()) as T;
      } catch (err) {
        lastErr = err;
        if (attempt < this.maxRetries) await sleep(250 * 2 ** attempt);
      } finally {
        clearTimeout(timer);
      }
    }
    throw lastErr instanceof Error ? lastErr : new Error('Error de conexión con el dispositivo');
  }
}

export function createIotDeviceClient(opts: IotDeviceClientOptions): DeviceClient {
  return new DeviceClient(opts);
}
