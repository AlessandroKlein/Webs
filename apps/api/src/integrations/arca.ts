/**
 * Cliente ARCA (ex-AFIP) — facturación electrónica Argentina.
 *
 * Implementa el Web Service de Facturación Electrónica (WSFE v1, CAE) con
 * autenticación WSAA (certificado X.509 → Ticket de Acceso) y documenta
 * WSMTXCA (monotributo, CAEA). Corre como *service local* en el proceso
 * Fastify (no microservicio), activable por organización (multi-tenant).
 *
 * Endpoints (modo homologación vs producción):
 *  - WSAA:  https://wsaa-homo.afip.gob.ar/ws/services/LoginCms  (homologación)
 *           https://wsaa.afip.gob.ar/ws/services/LoginCms       (producción)
 *  - WSFE:  https://wswhomo.afip.gob.ar/wsfev1/service.asmx     (homologación)
 *           https://servicios1.afip.gob.ar/wsfev1/service.asmx  (producción)
 *
 * Sin certificado/clave, o ante error del webservice, `issueArca` devuelve un
 * CAE simulado (`simulated: true`), igual que los adaptadores `afip`/`facturante`/`tsd`.
 *
 * NOTA DE SEGURIDAD: el certificado X.509 y la clave privada deben almacenarse
 * cifrados en reposo (análogo a `x-ui.secret`) y resolverse por organización;
 * nunca en texto plano en el repositorio.
 */

import { createSign, createPrivateKey, createHash, X509Certificate } from 'node:crypto';

export interface ArcaConfig {
  environment?: 'homologacion' | 'produccion';
  cuit?: string;
  puntoVenta?: string;
  /** responsable_inscripto → WSFE (CAE); monotributo → WSMTXCA (CAEA). */
  condicionFiscal?: 'responsable_inscripto' | 'monotributo';
  cert?: string; // certificado X.509 (PEM, clave pública)
  key?: string; // clave privada (PEM)
  alias?: string; // alias del certificado (informativo)
  serviceUrl?: string; // override del endpoint WSFE
  wsaaUrl?: string; // override del endpoint WSAA
  cbteTipo?: string; // tipo de comprobante por defecto (1..9, 11..63)
  docTipo?: string; // tipo de documento del receptor (80 CUIT, 96 DNI, 99 consumidor final)
}

export interface ArcaInvoice {
  id?: string;
  number?: string;
  amount: number;
  currency?: string;
  customerName?: string | null;
  customerTaxId?: string | null;
  vatCondition?: string | null;
  type?: string;
  /** discriminación de IVA: [{ baseImp, importe, id }] (alícuota 5/10.5/21/27). */
  iva?: Array<{ baseImp: number; importe: number; id: number }>;
  /** importe neto gravado (si no se discrimina IVA, = amount). */
  neto?: number;
}

export interface IssueArcaResult {
  cae: string;
  simulated: boolean;
  provider: 'arca';
  caeExpiresAt?: string | null;
  raw?: unknown;
}

export interface ArcaTa {
  token: string;
  sign: string;
  generationTime: string;
  expirationTime: string;
}

function str(value: unknown, fallback = ''): string {
  return typeof value === 'string' && value !== '' ? value : fallback;
}

function wsaaUrl(env: ArcaConfig['environment']): string {
  return env === 'produccion' ? 'https://wsaa.afip.gob.ar/ws/services/LoginCms' : 'https://wsaa-homo.afip.gob.ar/ws/services/LoginCms';
}

function wsfeUrl(env: ArcaConfig['environment']): string {
  return env === 'produccion' ? 'https://servicios1.afip.gob.ar/wsfev1/service.asmx' : 'https://wswhomo.afip.gob.ar/wsfev1/service.asmx';
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

async function fetchWithTimeout(url: string, init: RequestInit = {}, timeoutMs = 15000): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

function extractTag(xml: string, tag: string): string | null {
  const match = xml.match(new RegExp(`<${tag}[^>]*>([^<]+)</${tag}>`, 'i'));
  const value = match?.[1]?.trim();
  return value || null;
}

function simulatedResult(): IssueArcaResult {
  return { cae: crypto.randomUUID(), simulated: true, provider: 'arca' };
}

function hasCredentials(config: ArcaConfig): boolean {
  return Boolean(str(config.cuit) && str(config.cert) && str(config.key));
}

// ---------------------------------------------------------------------------
// DER helpers (para el CMS/PKCS#7 SignedData de WSAA)
// ---------------------------------------------------------------------------

function derLength(len: number): Buffer {
  if (len < 0x80) return Buffer.from([len]);
  const bytes: number[] = [];
  let n = len;
  while (n > 0) {
    bytes.unshift(n & 0xff);
    n = Math.floor(n / 256);
  }
  return Buffer.concat([Buffer.from([0x80 | bytes.length]), Buffer.from(bytes)]);
}

function tlv(tag: number, content: Buffer): Buffer {
  return Buffer.concat([Buffer.from([tag]), derLength(content.length), content]);
}

function derSequence(...items: Buffer[]): Buffer {
  return tlv(0x30, Buffer.concat(items));
}

function derSet(...items: Buffer[]): Buffer {
  return tlv(0x31, Buffer.concat(items));
}

function derInteger(n: number | bigint): Buffer {
  let value: bigint = typeof n === 'number' ? BigInt(n) : n;
  if (value < 0n) {
    // two's complement (los seriales de certificado son positivos; no se espera negativo)
    value = -value;
  }
  const bytes: number[] = [];
  while (value > 0n) {
    bytes.unshift(Number(value & 0xffn));
    value >>= 8n;
  }
  if (bytes.length === 0) bytes.push(0);
  if (bytes[0]! & 0x80) bytes.unshift(0); // sign bit
  return tlv(0x02, Buffer.from(bytes));
}

function derOctetString(buf: Buffer): Buffer {
  return tlv(0x04, buf);
}

function derNull(): Buffer {
  return Buffer.from([0x05, 0x00]);
}

function derOid(oid: string): Buffer {
  const parts = oid.split('.').map((p) => Number(p));
  const first = parts[0]! * 40 + parts[1]!;
  const out: number[] = [];
  const pushBase128 = (v: number): void => {
    const bytes: number[] = [];
    let n = v;
    bytes.unshift(n & 0x7f);
    n = Math.floor(n / 128);
    while (n > 0) {
      bytes.unshift(n & 0x7f);
      n = Math.floor(n / 128);
    }
    for (let i = 0; i < bytes.length - 1; i++) bytes[i] = bytes[i]! | 0x80;
    out.push(...bytes);
  };
  pushBase128(first);
  for (const p of parts.slice(2)) pushBase128(p);
  return tlv(0x06, Buffer.from(out));
}

function derUtcTime(date: Date): Buffer {
  const s = date.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z');
  return tlv(0x17, Buffer.from(s, 'ascii'));
}

function derContext(tagNum: number, content: Buffer): Buffer {
  return tlv(0xa0 | tagNum, content);
}

/** Codifica un Name (issuer/subject) como SEQUENCE OF SET OF AttributeTypeAndValue. */
function encodeDn(dn: string): Buffer {
  // X509Certificate.issuer devuelve "C=AR, O=..., CN=..." (separado por \n o ", ").
  const OIDS: Record<string, string> = {
    C: '2.5.4.6',
    O: '2.5.4.10',
    OU: '2.5.4.11',
    CN: '2.5.4.3',
    ST: '2.5.4.8',
    L: '2.5.4.7',
    SERIALNUMBER: '2.5.4.5',
    emailAddress: '1.2.840.113549.1.9.1',
  };
  const entries = dn
    .split(/\n|,(?=\s*[A-Za-z]+=)/)
    .map((part) => part.trim())
    .filter(Boolean);
  const rdns = entries.map((entry) => {
    const eq = entry.indexOf('=');
    const key = entry.slice(0, eq).trim();
    const value = entry.slice(eq + 1).trim();
    const oid = OIDS[key] ?? '2.5.4.3';
    // DirectoryString (PrintableString/UTF8String); PrintableString cubre la mayoría.
    const valueDer = tlv(0x0c, Buffer.from(value, 'utf8')); // UTF8String (más general)
    return derSet(derSequence(derOid(oid), valueDer));
  });
  return derSequence(...rdns);
}

/**
 * Firma el TRA (LoginTicketRequest.xml) con CMS/PKCS#7 (SignedData) usando el
 * certificado X.509 + clave privada, y devuelve el CMS codificado en Base64.
 *
 * Esta es una implementación de referencia del SignedData de WSAA. Se firma con
 * `RSA-SHA256` (PKCS#1 v1.5). Para endurecer el camino productivo se recomienda
 * validar el DER resultante contra el entorno de homologación de ARCA o usar
 * `node-forge` (mismo enfoque que `afip.js`).
 */
export function signLoginTicket(traXml: string, certPem: string, keyPem: string): string {
  const cert = new X509Certificate(certPem);
  const certDer = cert.raw;
  const issuerDer = encodeDn(cert.issuer);
  const serial = cert.serialNumber; // hex (ej. "01AB...")
  const serialBig = BigInt(`0x${serial || '0'}`);

  const privateKey = createPrivateKey(keyPem);

  const contentTypeOid = derOid('1.2.840.113549.1.9.3');
  const messageDigestOid = derOid('1.2.840.113549.1.9.4');
  const signingTimeOid = derOid('1.2.840.113549.1.9.5');
  const sha256Oid = derOid('2.16.840.1.101.3.4.2.1');
  const dataOid = derOid('1.2.840.113549.1.7.1');
  const sha256RsaOid = derOid('1.2.840.113549.1.1.11');
  const signedDataOid = derOid('1.2.840.113549.1.7.2');

  const traDer = derOctetString(Buffer.from(traXml, 'utf8'));
  const digestOfContent = createHash('sha256').update(traXml, 'utf8').digest();

  const signedAttrsContent = Buffer.concat([
    derSequence(contentTypeOid, derSet(dataOid)),
    derSequence(messageDigestOid, derSet(derOctetString(digestOfContent))),
    derSequence(signingTimeOid, derSet(derUtcTime(new Date()))),
  ]);
  const signedAttrs = derContext(0, signedAttrsContent);

  // La firma se calcula sobre el DER de los signedAttrs.
  const signer = createSign('RSA-SHA256');
  signer.update(signedAttrs);
  const signature = signer.sign(privateKey);

  const signerInfo = derSequence(
    derInteger(1),
    derSequence(issuerDer, derInteger(serialBig)),
    derSequence(sha256Oid, derNull()),
    signedAttrs,
    derSequence(sha256RsaOid, derNull()),
    derOctetString(signature),
  );

  const signedData = derSequence(
    derInteger(1),
    derSet(derSequence(sha256Oid, derNull())),
    derSequence(dataOid, derContext(0, traDer)),
    derContext(0, derContext(0, certDer)),
    derSet(signerInfo),
  );

  const contentInfo = derSequence(signedDataOid, derContext(0, signedData));
  return contentInfo.toString('base64');
}

// ---------------------------------------------------------------------------
// WSAA: LoginTicketRequest → CMS → LoginCms → token + sign
// ---------------------------------------------------------------------------

function buildLoginTicketRequest(service: string, ttlHours = 12): string {
  const now = new Date();
  const gen = now.toISOString();
  const exp = new Date(now.getTime() + ttlHours * 3600 * 1000).toISOString();
  const uniqueId = Math.floor(now.getTime() / 1000);
  return `<?xml version="1.0" encoding="UTF-8"?>
<loginTicketRequest version="1.0">
  <header>
    <uniqueId>${uniqueId}</uniqueId>
    <generationTime>${escapeXml(gen)}</generationTime>
    <expirationTime>${escapeXml(exp)}</expirationTime>
  </header>
  <service>${escapeXml(service)}</service>
</loginTicketRequest>`;
}

/** Solicita el Ticket de Acceso (TA) al WSAA. Devuelve null si no hay credenciales o falla. */
export async function loginCms(config: ArcaConfig, service = 'wsfe'): Promise<ArcaTa | null> {
  if (!hasCredentials(config)) return null;
  const env = config.environment === 'produccion' ? 'produccion' : 'homologacion';
  const url = str(config.wsaaUrl, wsaaUrl(env));
  const tra = buildLoginTicketRequest(service);
  const cms = signLoginTicket(tra, str(config.cert), str(config.key));

  const res = await fetchWithTimeout(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: `cms=${encodeURIComponent(cms)}`,
  });
  if (!res.ok) return null;
  const text = await res.text();
  const token = extractTag(text, 'token');
  const sign = extractTag(text, 'sign');
  if (!token || !sign) return null;
  return {
    token,
    sign,
    generationTime: extractTag(text, 'generationTime') ?? '',
    expirationTime: extractTag(text, 'expirationTime') ?? '',
  };
}

// ---------------------------------------------------------------------------
// WSFE v1: FECAESolicitar (CAE) + catálogos auxiliares
// ---------------------------------------------------------------------------

function soapEnvelope(action: string, body: string): string {
  return `<?xml version="1.0" encoding="utf-8"?>
<soap:Envelope xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/">
  <soap:Body>
    <${action} xmlns="http://ar.gov.afip.dif.FEV1/">
${body}
    </${action}>
  </soap:Body>
</soap:Envelope>`;
}

async function wsfeSoap(config: ArcaConfig, auth: ArcaTa, action: string, body: string): Promise<string | null> {
  const url = str(config.serviceUrl, wsfeUrl(config.environment));
  const soap = soapEnvelope(action, body);
  const res = await fetchWithTimeout(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'text/xml; charset=utf-8',
      SOAPAction: `"http://ar.gov.afip.dif.FEV1/${action}"`,
    },
    body: soap,
  });
  if (!res.ok) return null;
  return res.text();
}

/** Solicita un CAE ante WSFE (FECAESolicitar). Devuelve {cae, caeFchVto} o null. */
export async function solicitarCae(
  config: ArcaConfig,
  auth: ArcaTa,
  invoice: ArcaInvoice,
): Promise<{ cae: string; caeFchVto: string | null } | null> {
  const cuit = str(config.cuit);
  const ptoVta = str(config.puntoVenta, '1');
  const cbteTipo = str(config.cbteTipo, '6');
  const docTipo = str(config.docTipo, '99');
  const amount = Number(invoice.amount ?? 0);
  const neto = Number(invoice.neto ?? amount);
  const cbteFch = new Date().toISOString().slice(0, 10).replace(/-/g, '');

  const ivaItems = (invoice.iva ?? []).map(
    (i) => `<AlicIva><Id>${i.id}</Id><BaseImp>${Number(i.baseImp ?? 0).toFixed(2)}</BaseImp><Importe>${Number(i.importe ?? 0).toFixed(2)}</Importe></AlicIva>`,
  );

  const body = `
      <Auth>
        <Token>${escapeXml(auth.token)}</Token>
        <Sign>${escapeXml(auth.sign)}</Sign>
        <Cuit>${escapeXml(cuit)}</Cuit>
      </Auth>
      <FeCAEReq>
        <FeCabReq>
          <CantReg>1</CantReg>
          <PtoVta>${escapeXml(ptoVta)}</PtoVta>
          <CbteTipo>${escapeXml(cbteTipo)}</CbteTipo>
        </FeCabReq>
        <FeDetReq>
          <FECAEDetRequest>
            <Concepto>1</Concepto>
            <DocTipo>${escapeXml(docTipo)}</DocTipo>
            <DocNro>${escapeXml(str(invoice.customerTaxId, '0'))}</DocNro>
            <CbteDesde>1</CbteDesde>
            <CbteHasta>1</CbteHasta>
            <CbteFch>${cbteFch}</CbteFch>
            <ImpTotal>${amount.toFixed(2)}</ImpTotal>
            <ImpTotConc>0</ImpTotConc>
            <ImpNeto>${neto.toFixed(2)}</ImpNeto>
            <ImpOpEx>0</ImpOpEx>
            <ImpIVA>${(amount - neto).toFixed(2)}</ImpIVA>
            <ImpTrib>0</ImpTrib>
            <MonId>PES</MonId>
            <MonCotiz>1</MonCotiz>
            ${ivaItems.length ? `<Iva>${ivaItems.join('')}</Iva>` : ''}
          </FECAEDetRequest>
        </FeDetReq>
      </FeCAEReq>`;

  const text = await wsfeSoap(config, auth, 'FECAESolicitar', body);
  if (!text) return null;
  const cae = extractTag(text, 'CAE');
  if (!cae) return null;
  return { cae, caeFchVto: extractTag(text, 'CAEFchVto') };
}

/**
 * WSMTXCA (monotributo): `AutorizarComprobante` → CAEA. Requiere un rango de
 * CAEA previamente solicitado (`SolicitarCAEA`), lo cual está documentado aquí
 * pero NO implementado (solo responsable inscripto/WSFE queda con CAE real;
 * monotributo cae a simulado hasta integrar la solicitud de rango CAEA).
 */
export async function solicitarCaea(
  _config: ArcaConfig,
  _auth: ArcaTa,
  _invoice: ArcaInvoice,
): Promise<{ cae: string; caeFchVto: string | null } | null> {
  return null;
}

/** `FEParamGetTiposCbte`: catálogo de tipos de comprobante. */
export async function getTiposCbte(config: ArcaConfig, auth: ArcaTa): Promise<unknown> {
  const text = await wsfeSoap(
    config,
    auth,
    'FEParamGetTiposCbte',
    `<Auth><Token>${escapeXml(auth.token)}</Token><Sign>${escapeXml(auth.sign)}</Sign><Cuit>${escapeXml(str(config.cuit))}</Cuit></Auth>`,
  );
  return text ?? null;
}

/** `FEParamGetPtosVenta`: puntos de venta habilitados. */
export async function getPtosVenta(config: ArcaConfig, auth: ArcaTa): Promise<unknown> {
  const text = await wsfeSoap(
    config,
    auth,
    'FEParamGetPtosVenta',
    `<Auth><Token>${escapeXml(auth.token)}</Token><Sign>${escapeXml(auth.sign)}</Sign><Cuit>${escapeXml(str(config.cuit))}</Cuit></Auth>`,
  );
  return text ?? null;
}

/** `FECompUltimoAutorizado`: último comprobante autorizado por tipo/punto de venta. */
export async function getUltimoAutorizado(
  config: ArcaConfig,
  auth: ArcaTa,
  ptoVta: string,
  cbteTipo: string,
): Promise<unknown> {
  const text = await wsfeSoap(
    config,
    auth,
    'FECompUltimoAutorizado',
    `<Auth><Token>${escapeXml(auth.token)}</Token><Sign>${escapeXml(auth.sign)}</Sign><Cuit>${escapeXml(str(config.cuit))}</Cuit></Auth>
      <PtoVta>${escapeXml(ptoVta)}</PtoVta><CbteTipo>${escapeXml(cbteTipo)}</CbteTipo>`,
  );
  return text ?? null;
}

// ---------------------------------------------------------------------------
// Orquestación
// ---------------------------------------------------------------------------

/**
 * Emite (autoriza) un comprobante ante ARCA. Devuelve el CAE/CAEA o un CAE
 * simulado cuando no hay credenciales o el webservice falla.
 */
export async function issueArca(config: ArcaConfig, invoice: ArcaInvoice): Promise<IssueArcaResult> {
  if (!hasCredentials(config)) return simulatedResult();

  try {
    const service = config.condicionFiscal === 'monotributo' ? 'wsmtxca' : 'wsfe';
    const auth = await loginCms(config, service);
    if (!auth) return simulatedResult();

    if (config.condicionFiscal === 'monotributo') {
      const result = await solicitarCaea(config, auth, invoice);
      if (!result) return simulatedResult();
      return { cae: result.cae, simulated: false, provider: 'arca', caeExpiresAt: result.caeFchVto, raw: result };
    }

    const result = await solicitarCae(config, auth, invoice);
    if (!result) return simulatedResult();
    return { cae: result.cae, simulated: false, provider: 'arca', caeExpiresAt: result.caeFchVto, raw: result };
  } catch {
    return simulatedResult();
  }
}
