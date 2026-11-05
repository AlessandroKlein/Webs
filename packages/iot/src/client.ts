import { lookup } from 'node:dns/promises';
import { isIP } from 'node:net';
import http, { type IncomingHttpHeaders } from 'node:http';
import https from 'node:https';

import type { IotDeviceClientOptions } from './types';

const MAX_REDIRECTS = 5;

const PRIVATE_IPV4 = [
  /^0\./,
  /^10\./,
  /^100\.(6[4-9]|[7-9][0-9]|1[0-1][0-9]|12[0-7])\./, // 100.64/10 (CGNAT)
  /^127\./,
  /^169\.254\./,
  /^172\.(1[6-9]|2[0-9]|3[0-1])\./,
  /^192\.0\.0\./, // 192.0.0/24
  /^192\.168\./,
  /^198\.(1[8-9])\./, // 198.18/15 (benchmark)
  /^22[4-9]\./,
  /^2[3-5][0-9]\./,
  /^240\./,
];
const PRIVATE_IPV6 = [/^::1$/, /^::$/, /^fc/i, /^fd/i, /^fe[89ab]/i, /^ff/i];

export function isPrivateIpv4(ip: string): boolean {
  return PRIVATE_IPV4.some((re) => re.test(ip));
}

/** Extrae la IPv4 embebida de un IPv4-mapped IPv6 (`::ffff:a.b.c.d` o `::ffff:hex:hex`). */
function mappedIpv4(ip: string): string | null {
  let m = ip.match(/^::ffff:(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/i);
  if (m) return `${m[1]}.${m[2]}.${m[3]}.${m[4]}`;
  m = ip.match(/^::ffff:([0-9a-f]{1,4}):([0-9a-f]{1,4})$/i);
  if (m) {
    const hi = parseInt(m[1]!, 16);
    const lo = parseInt(m[2]!, 16);
    return `${(hi >> 8) & 0xff}.${hi & 0xff}.${(lo >> 8) & 0xff}.${lo & 0xff}`;
  }
  return null;
}

export function isPrivateIpv6(ip: string): boolean {
  const mapped = mappedIpv4(ip);
  if (mapped !== null) return isPrivateIpv4(mapped);
  return PRIVATE_IPV6.some((re) => re.test(ip));
}

export function isPrivateIp(ip: string): boolean {
  const v = isIP(ip);
  if (v === 4) return isPrivateIpv4(ip);
  if (v === 6) return isPrivateIpv6(ip);
  return true;
}

/**
 * Resuelve `host` (o acepta una IP literal) y devuelve TODAS sus direcciones ya
 * validadas: cada una debe ser pública o estar en `allowlist`. Lanza si alguna
 * apunta a loopback/privada — protege contra SSRF.
 */
async function resolveValidatedIps(host: string, allowlist: string[]): Promise<string[]> {
  if (isIP(host)) {
    if (isPrivateIp(host) && !allowlist.includes(host)) {
      throw new Error(`Host bloqueado por seguridad (dirección privada/loopback): ${host}`);
    }
    return [host];
  }
  const entries = await lookup(host, { all: true });
  if (entries.length === 0) throw new Error(`Host sin resolución DNS: ${host}`);
  const ips = entries.map((e) => e.address);
  for (const ip of ips) {
    if (isPrivateIp(ip) && !allowlist.includes(ip) && !allowlist.includes(host)) {
      throw new Error(`Host bloqueado por seguridad (dirección privada/loopback): ${host} (${ip})`);
    }
  }
  return ips;
}

/** Verifica que `host` solo resuelva a direcciones públicas (o allowlist). */
export async function assertSafeHost(host: string, allowlist: string[] = []): Promise<void> {
  await resolveValidatedIps(host, allowlist);
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

interface ResolvedTarget {
  ip: string;
  family: 4 | 6;
  hostname: string;
  port: number;
  secure: boolean;
}

/** Resuelve una vez, valida todas las IPs y pincha la primera para conectar. */
async function resolveTarget(url: URL, allowlist: string[]): Promise<ResolvedTarget> {
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new Error(`Protocolo no permitido: ${url.protocol}`);
  }
  if (url.username || url.password) {
    throw new Error('La URL del dispositivo no puede incluir credenciales');
  }
  const ips = await resolveValidatedIps(url.hostname, allowlist);
  const ip = ips[0]!;
  return {
    ip,
    family: isIP(ip) === 6 ? 6 : 4,
    hostname: url.hostname,
    port: url.port ? Number(url.port) : url.protocol === 'https:' ? 443 : 80,
    secure: url.protocol === 'https:',
  };
}

interface RawResponse {
  statusCode: number;
  headers: IncomingHttpHeaders;
  body: string;
}

/** Petición cruda a la IP ya validada; el `lookup` propio ignora el hostname y pincha la IP. */
function rawRequest(
  target: ResolvedTarget,
  method: string,
  path: string,
  body: string | undefined,
  headers: Record<string, string>,
  timeoutMs: number,
): Promise<RawResponse> {
  // `lookup` propio: ignora el hostname y devuelve siempre la IP ya validada.
  const pinnedLookup = (
    _hostname: string,
    options: { all?: boolean },
    cb: (err: NodeJS.ErrnoException | null, address: string | { address: string; family: number }[], family?: number) => void,
  ): void => {
    if (options?.all) cb(null, [{ address: target.ip, family: target.family }]);
    else cb(null, target.ip, target.family);
  };

  return new Promise((resolve, reject) => {
    const mod = target.secure ? https : http;
    const req = mod.request(
      {
        hostname: target.hostname, // Host/SNI correctos (certificado verificado contra el hostname)
        port: target.port,
        path,
        method,
        headers,
        // Cierra el TOCTOU DNS-rebinding: no se re-resuelve; se conecta a la IP validada.
        // Node 22 con `autoSelectFamily` llama al lookup con `{ all: true }` y espera un array.
        lookup: pinnedLookup,
      },
      (res) => {
        const chunks: Buffer[] = [];
        res.on('data', (c: Buffer) => chunks.push(c));
        res.on('end', () =>
          resolve({ statusCode: res.statusCode ?? 0, headers: res.headers, body: Buffer.concat(chunks).toString('utf8') }),
        );
      },
    );
    req.on('error', reject);
    req.setTimeout(timeoutMs, () => req.destroy(new Error(`Timeout de ${timeoutMs} ms`)));
    if (body !== undefined) req.write(body);
    req.end();
  });
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
    const url = deviceUrl(this.baseUrl, path);
    let lastErr: unknown;
    for (let attempt = 0; attempt <= this.maxRetries; attempt++) {
      try {
        return await this.execute<T>(url, method, body);
      } catch (err) {
        lastErr = err;
        if (attempt < this.maxRetries) await sleep(250 * 2 ** attempt);
      }
    }
    throw lastErr instanceof Error ? lastErr : new Error('Error de conexión con el dispositivo');
  }

  /** Sigue redirects manualmente y re-valida cada salto (nunca `redirect:'follow'` ciego). */
  private async execute<T>(startUrl: URL, method: 'GET' | 'POST', body?: unknown): Promise<T> {
    let current = startUrl;
    let reqMethod: 'GET' | 'POST' = method;
    let reqBody = body !== undefined ? JSON.stringify(body) : undefined;
    for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
      const target = await resolveTarget(current, this.allowlist);
      const headers: Record<string, string> = {
        accept: 'application/json',
        Host: current.host,
        ...(reqBody !== undefined ? { 'content-type': 'application/json' } : {}),
        ...this.authHeader(),
      };
      const res = await rawRequest(target, reqMethod, `${current.pathname}${current.search}`, reqBody, headers, this.timeoutMs);

      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        const next = new URL(res.headers.location, current);
        // 303, o 301/302 sobre POST, bajan a GET sin cuerpo (RFC 9110); 307/308 conservan método.
        if (res.statusCode === 303 || ((res.statusCode === 301 || res.statusCode === 302) && reqMethod === 'POST')) {
          reqMethod = 'GET';
          reqBody = undefined;
        }
        current = next;
        continue;
      }

      if (res.statusCode < 200 || res.statusCode >= 300) {
        throw new Error(`Dispositivo respondió HTTP ${res.statusCode} en ${current.hostname}`);
      }
      return JSON.parse(res.body) as T;
    }
    throw new Error(`Demasiados redirects (>${MAX_REDIRECTS})`);
  }
}

export function createIotDeviceClient(opts: IotDeviceClientOptions): DeviceClient {
  return new DeviceClient(opts);
}

/**
 * Prefijo `/api/v1` a anteponer a las rutas del dispositivo. Devuelve '' si el
 * `baseUrl` ya termina en `/api/v1` (con o sin barra final); si no, `/api/v1`.
 * Es el único lugar donde se decide este prefijo (los plugins no lo duplican).
 */
export function deviceApiPrefix(baseUrl: string): string {
  const normalized = baseUrl.replace(/\/+$/, '');
  return normalized.endsWith('/api/v1') ? '' : '/api/v1';
}

/**
 * URL final de una ruta del dispositivo. La ruta se resuelve RELATIVA al
 * `baseUrl` para conservar su path (un `new URL('/status', …)` lo descartaría,
 * y con `baseUrl = http://ip/api/v1` se sondeaba `http://ip/status`).
 */
export function deviceUrl(baseUrl: string, path: string): URL {
  return new URL(path.replace(/^\/+/, ''), `${baseUrl.replace(/\/+$/, '')}/`);
}
