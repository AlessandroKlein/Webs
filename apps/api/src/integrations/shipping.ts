/**
 * Adaptadores de cotización de envíos (Andreani / OCA / Correo Argentino /
 * Mercado Envíos / DHL) con fallback a cálculo local. Sin credenciales
 * hardcodeadas: todo se lee de `config`.
 *
 * Siguiendo el patrón "provider registry": interfaz común (`quoteShipping`) +
 * adaptadores por proveedor + fallback "local/mock" cuando no hay credenciales.
 */

export type ShippingProvider = 'local' | 'andreani' | 'oca' | 'correo' | 'mercadolibre' | 'dhl';

export interface ShippingQuoteInput {
  /** Peso en kg. */
  weight: number;
  /** Código postal / dirección de destino. */
  destination?: string | null;
  /** Código postal de destino (preferido para cotizar por CP). */
  postalCode?: string | null;
  /** Provincia de destino. */
  province?: string | null;
  /** Ciudad de destino. */
  city?: string | null;
  /** Código postal / dirección de origen. */
  origin?: string | null;
}

export interface ShippingRate {
  provider: string;
  baseCost: number;
  costPerKg: number;
  days: number;
}

export interface ShippingQuote {
  provider: string;
  cost: number;
  currency: string;
  days: number | null;
  source: 'provider' | 'local';
  raw?: unknown;
}

/** Proveedores que intentan una cotización real vía HTTP. */
const REAL_PROVIDERS: ReadonlySet<string> = new Set(['andreani', 'oca', 'correo', 'mercadolibre', 'dhl']);

const BASE64_CHARS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';

/** Base64 UTF-8 (sin `Buffer` ni `node:crypto`). */
function toBase64(input: string): string {
  const bytes = new TextEncoder().encode(input);
  let out = '';
  for (let i = 0; i < bytes.length; i += 3) {
    const b0 = bytes[i] ?? 0;
    const b1 = bytes[i + 1] ?? 0;
    const b2 = bytes[i + 2] ?? 0;
    const has1 = i + 1 < bytes.length;
    const has2 = i + 2 < bytes.length;
    out += BASE64_CHARS[(b0 >> 2) & 0x3f];
    out += BASE64_CHARS[((b0 & 0x03) << 4) | (b1 >> 4)];
    out += has1 ? BASE64_CHARS[((b1 & 0x0f) << 2) | (b2 >> 6)] : '=';
    out += has2 ? BASE64_CHARS[b2 & 0x3f] : '=';
  }
  return out;
}

function str(value: unknown, fallback = ''): string {
  return typeof value === 'string' && value !== '' ? value : fallback;
}

const XML_ESCAPES: Record<string, string> = {
  '<': '&lt;',
  '>': '&gt;',
  '&': '&amp;',
  "'": '&apos;',
  '"': '&quot;',
};

function escapeXml(value: string): string {
  return value.replace(/[<>&'"]/g, (c) => XML_ESCAPES[c] ?? c);
}

async function fetchWithTimeout(url: string, init: RequestInit = {}, timeoutMs = 8000): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

function baseUrlOf(config: Record<string, unknown>, fallback: string): string {
  return str(config.baseUrl ?? config.url, fallback).replace(/\/+$/, '');
}

function toFinite(value: unknown): number | null {
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  if (typeof value === 'string' && value.trim() !== '') {
    const n = Number.parseFloat(value);
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

/** Devuelve el primer número cuyo nombre de clave coincide con el patrón (o el primer número). */
function firstNumber(data: unknown, keyPattern: RegExp): number | null {
  let match: number | null = null;
  let fallback: number | null = null;
  const visit = (node: unknown): void => {
    if (match !== null) return;
    if (Array.isArray(node)) {
      for (const item of node) {
        visit(item);
        if (match !== null) return;
      }
      return;
    }
    if (node !== null && typeof node === 'object') {
      for (const [key, value] of Object.entries(node as Record<string, unknown>)) {
        if (keyPattern.test(key)) {
          const num = toFinite(value);
          if (num !== null) {
            match = num;
            return;
          }
        } else if (fallback === null && typeof value === 'number' && Number.isFinite(value)) {
          fallback = value;
        }
        visit(value);
        if (match !== null) return;
      }
    }
  };
  visit(data);
  return match ?? fallback;
}

/** Cotización local calculada a partir de las tarifas configuradas. */
function localQuote(provider: string, weight: number, rates: ShippingRate[]): ShippingQuote {
  const rate = rates.find((r) => r.provider === provider);
  const baseCost = Number(rate?.baseCost ?? 0);
  const costPerKg = Number(rate?.costPerKg ?? 0);
  const days = Number(rate?.days ?? 3);
  const cost = Math.round(baseCost + costPerKg * Math.max(weight, 0));
  return { provider, cost, currency: 'ARS', days, source: 'local' };
}

function hasCredentials(provider: string, config: Record<string, unknown>): boolean {
  if (provider === 'andreani') {
    return Boolean(str(config.token) || (str(config.username) && str(config.password)));
  }
  if (provider === 'oca') {
    return Boolean(str(config.username) && str(config.password));
  }
  if (provider === 'correo') {
    return Boolean(
      str(config.customerId) &&
        (str(config.token) || (str(config.userToken ?? config.username) && str(config.passwordToken ?? config.password))),
    );
  }
  if (provider === 'mercadolibre') {
    return Boolean(str(config.itemId) && (str(config.token) || str(config.apiKey)));
  }
  if (provider === 'dhl') {
    return Boolean(str(config.apiKey) || str(config.token));
  }
  return false;
}

async function quoteAndreani(
  config: Record<string, unknown>,
  weight: number,
  destination: string,
  province?: string,
): Promise<ShippingQuote | null> {
  const baseUrl = baseUrlOf(config, 'https://api.andreani.com');
  let token = str(config.token);
  if (!token) {
    const username = str(config.username);
    const password = str(config.password);
    if (!username || !password) return null;
    const login = await fetchWithTimeout(`${baseUrl}/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password, clientId: str(config.clientId, 'CLIENTE_DEFAULT') }),
    });
    if (!login.ok) return null;
    const loginData = (await login.json()) as Record<string, unknown>;
    token = str(loginData.token ?? loginData.accessToken ?? loginData.access_token);
    if (!token) return null;
  }

  const res = await fetchWithTimeout(`${baseUrl}/v1/cotizacion`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({
      contrato: str(config.contract ?? config.contrato, 'F'),
      peso: weight,
      volumen: 0,
      cpDestino: destination,
      provinciaDestino: str(province ?? config.provinciaDestino),
    }),
  });
  if (!res.ok) return null;

  const data = (await res.json()) as unknown;
  const cost = firstNumber(data, /tarifa|total|precio|valor|price|cost|amount/i);
  if (cost === null) return null;
  return { provider: 'andreani', cost: Math.round(cost), currency: 'ARS', days: null, source: 'provider', raw: data };
}

async function quoteOca(
  config: Record<string, unknown>,
  weight: number,
  destination: string,
): Promise<ShippingQuote | null> {
  const baseUrl = baseUrlOf(config, 'https://webservice.oca.com.ar/ePak_tracking/Oep_TrackEPak.asmx');
  const usr = str(config.username);
  const psw = str(config.password);
  if (!usr || !psw) return null;

  const body = `<?xml version="1.0" encoding="utf-8"?>
<soap:Envelope xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/">
  <soap:Body>
    <Tarifar_Envio_Corporativo xmlns="http://www.oca.com.ar/">
      <usr>${escapeXml(usr)}</usr>
      <psw>${escapeXml(psw)}</psw>
      <Peso>${weight}</Peso>
      <CPDestino>${escapeXml(destination)}</CPDestino>
    </Tarifar_Envio_Corporativo>
  </soap:Body>
</soap:Envelope>`;

  const res = await fetchWithTimeout(baseUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'text/xml; charset=utf-8',
      SOAPAction: '"http://www.oca.com.ar/Tarifar_Envio_Corporativo"',
    },
    body,
  });
  if (!res.ok) return null;

  const text = await res.text();
  const match =
    text.match(/<Tarifar_Envio_CorporativoResult[^>]*>\s*([0-9]+(?:\.[0-9]+)?)/i) ??
    text.match(/([0-9]+(?:\.[0-9]+)?)/);
  const costStr = match?.[1];
  if (!costStr) return null;
  const cost = Number.parseFloat(costStr);
  if (!Number.isFinite(cost)) return null;
  return { provider: 'oca', cost: Math.round(cost), currency: 'ARS', days: null, source: 'provider', raw: text };
}

async function quoteCorreo(
  config: Record<string, unknown>,
  weight: number,
  destination: string,
): Promise<ShippingQuote | null> {
  const baseUrl = baseUrlOf(config, 'https://api.correoargentino.com.ar/micorreo/v1');
  const customerId = str(config.customerId);
  const postalCodeOrigin = str(config.postalCodeOrigin ?? config.originPostalCode, '1000');
  if (!customerId || !destination) return null;

  // JWT: token preexistente o Basic auth con userToken/passwordToken (MiCorreo).
  let token = str(config.token);
  if (!token) {
    const userToken = str(config.userToken ?? config.username);
    const passwordToken = str(config.passwordToken ?? config.password);
    if (!userToken || !passwordToken) return null;
    const login = await fetchWithTimeout(`${baseUrl}/token`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Basic ${toBase64(`${userToken}:${passwordToken}`)}`,
      },
    });
    if (!login.ok) return null;
    const loginData = (await login.json()) as Record<string, unknown>;
    token = str(loginData.token ?? loginData.accessToken ?? loginData.access_token);
    if (!token) return null;
  }

  // Peso en gramos (límite MiCorreo 1–25000 g); dimensiones por defecto.
  const weightGrams = Math.max(1, Math.min(25000, Math.round(weight * 1000)));
  const res = await fetchWithTimeout(`${baseUrl}/rates`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({
      customerId,
      postalCodeOrigin,
      postalCodeDestination: destination,
      dimensions: [{ length: 30, width: 20, height: 10, weight: weightGrams, quantity: 1 }],
    }),
  });
  if (!res.ok) return null;

  const data = (await res.json()) as unknown;
  const cost = firstNumber(data, /price|cost|total|tarifa|importe/i);
  if (cost === null) return null;
  return { provider: 'correo', cost: Math.round(cost), currency: 'ARS', days: null, source: 'provider', raw: data };
}

async function quoteMercadolibre(
  config: Record<string, unknown>,
  destination: string,
  city: string,
): Promise<ShippingQuote | null> {
  const token = str(config.token ?? config.apiKey);
  const itemId = str(config.itemId);
  if (!token || !itemId) return null;

  const baseUrl = baseUrlOf(config, 'https://api.mercadolibre.com');
  const query = destination
    ? `zip_code=${encodeURIComponent(destination)}`
    : city
      ? `city_to=${encodeURIComponent(city)}`
      : '';
  if (!query) return null;

  const res = await fetchWithTimeout(`${baseUrl}/items/${encodeURIComponent(itemId)}/shipping_options?${query}`, {
    method: 'GET',
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) return null;

  const data = (await res.json()) as Record<string, unknown>;
  const options = Array.isArray(data.options) ? (data.options as Array<Record<string, unknown>>) : [];
  const option = options.find((o) => o.shipping_option_type === 'address') ?? options[0];
  if (!option) return null;
  const cost = toFinite(option.list_cost ?? option.cost ?? option.base_cost);
  if (cost === null) return null;
  const currency = str(option.currency_id, 'ARS');
  return { provider: 'mercadolibre', cost: Math.round(cost), currency, days: null, source: 'provider', raw: data };
}

async function quoteDhl(
  config: Record<string, unknown>,
  weight: number,
  destination: string,
): Promise<ShippingQuote | null> {
  const baseUrl = baseUrlOf(config, 'https://express.api.dhl.com/mydhlapi');
  const apiKey = str(config.apiKey);
  const token = str(config.token);
  if (!apiKey && !token) return null;

  const apiSecret = str(config.apiSecret);
  const authorization = token
    ? `Bearer ${token}`
    : `Basic ${toBase64(apiSecret ? `${apiKey}:${apiSecret}` : `${apiKey}:`)}`;

  const res = await fetchWithTimeout(`${baseUrl}/rates`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: authorization },
    body: JSON.stringify({
      accountNumber: str(config.accountNumber),
      originCountryCode: str(config.originCountry, 'AR'),
      destinationCountryCode: str(config.destinationCountry, 'AR'),
      postalCode: destination,
      weight: { value: weight, unit: 'kg' },
      requestedPackages: [{ weight: { value: weight, unit: 'kg' } }],
    }),
  });
  if (!res.ok) return null;

  const data = (await res.json()) as unknown;
  const cost = firstNumber(data, /price|totalPrice|amount|cost|rate|charge|total/i);
  if (cost === null) return null;
  return { provider: 'dhl', cost: Math.round(cost), currency: 'USD', days: null, source: 'provider', raw: data };
}

/**
 * Cotiza un envío. Si el proveedor es real ("andreani"/"oca"/"dhl") y hay
 * credenciales en `config`, intenta el endpoint real; ante cualquier error o
 * falta de credenciales, devuelve la cotización local calculada con `rates`.
 */
export async function quoteShipping(
  provider: string,
  config: Record<string, unknown>,
  input: ShippingQuoteInput,
  rates: ShippingRate[] = [],
): Promise<ShippingQuote> {
  const weight = Number(input.weight ?? 0);
  const destination = str(input.postalCode ?? input.destination);
  const province = str(input.province);
  const city = str(input.city);
  const fallback = (): ShippingQuote => localQuote(provider, weight, rates);

  if (!REAL_PROVIDERS.has(provider)) return fallback();
  if (!hasCredentials(provider, config)) return fallback();

  try {
    let quote: ShippingQuote | null;
    if (provider === 'andreani') quote = await quoteAndreani(config, weight, destination, province);
    else if (provider === 'oca') quote = await quoteOca(config, weight, destination);
    else if (provider === 'correo') quote = await quoteCorreo(config, weight, destination);
    else if (provider === 'mercadolibre') quote = await quoteMercadolibre(config, destination, city);
    else quote = await quoteDhl(config, weight, destination);
    return quote ?? fallback();
  } catch {
    return fallback();
  }
}
