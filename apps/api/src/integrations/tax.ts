/**
 * Adaptadores de facturación electrónica (AFIP/ARCA, Facturante, TSD genérico).
 * Sin firma CMS real: ante falta de credenciales o error del webservice,
 * devuelve un CAE simulado (`crypto.randomUUID()`). Todo se lee de `config`.
 */

export interface InvoiceInput {
  id?: string;
  number?: string;
  amount: number;
  currency?: string;
  customerName?: string | null;
  customerTaxId?: string | null;
  vatCondition?: string | null;
  type?: string;
}

export interface IssueInvoiceResult {
  cae: string;
  simulated: boolean;
  provider: string;
  caeExpiresAt?: string | null;
  raw?: unknown;
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

async function fetchWithTimeout(url: string, init: RequestInit = {}, timeoutMs = 12000): Promise<Response> {
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

function simulatedResult(provider: string): IssueInvoiceResult {
  return { cae: crypto.randomUUID(), simulated: true, provider };
}

function hasCredentials(provider: string, config: Record<string, unknown>): boolean {
  if (provider === 'afip') {
    return Boolean(str(config.token) && str(config.sign) && str(config.cuit ?? config.taxId));
  }
  if (provider === 'facturante' || provider === 'tsd') {
    return Boolean(str(config.username) && str(config.password));
  }
  return false;
}

/** AFIP/ARCA directo: WSFE v1 `FECAESolicitar` (SOAP). Requiere TA (`token`+`sign`). */
async function issueAfip(config: Record<string, unknown>, invoice: InvoiceInput): Promise<IssueInvoiceResult | null> {
  const cuit = str(config.cuit ?? config.taxId);
  const token = str(config.token);
  const sign = str(config.sign);
  const serviceUrl = str(config.serviceUrl ?? config.baseUrl, 'https://servicios1.afip.gob.ar/wsfev1/service.asmx');
  const ptoVta = str(config.ptoVta ?? config.pointOfSale, '1');
  const cbteTipo = str(config.cbteTipo, '6');
  const amount = Number(invoice.amount ?? 0);
  const cbteFch = new Date().toISOString().slice(0, 10).replace(/-/g, '');

  const body = `<?xml version="1.0" encoding="utf-8"?>
<soap:Envelope xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/">
  <soap:Body>
    <FECAESolicitar xmlns="http://ar.gov.afip.dif.FEV1/">
      <Auth>
        <Token>${escapeXml(token)}</Token>
        <Sign>${escapeXml(sign)}</Sign>
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
            <DocTipo>${escapeXml(str(config.docTipo, '99'))}</DocTipo>
            <DocNro>${escapeXml(str(invoice.customerTaxId, '0'))}</DocNro>
            <CbteDesde>1</CbteDesde>
            <CbteHasta>1</CbteHasta>
            <CbteFch>${cbteFch}</CbteFch>
            <ImpTotal>${amount.toFixed(2)}</ImpTotal>
            <ImpTotConc>0</ImpTotConc>
            <ImpNeto>${amount.toFixed(2)}</ImpNeto>
            <ImpOpEx>0</ImpOpEx>
            <ImpIVA>0</ImpIVA>
            <ImpTrib>0</ImpTrib>
            <MonId>PES</MonId>
            <MonCotiz>1</MonCotiz>
          </FECAEDetRequest>
        </FeDetReq>
      </FeCAEReq>
    </FECAESolicitar>
  </soap:Body>
</soap:Envelope>`;

  const res = await fetchWithTimeout(serviceUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'text/xml; charset=utf-8',
      SOAPAction: '"http://ar.gov.afip.dif.FEV1/FECAESolicitar"',
    },
    body,
  });
  if (!res.ok) return null;

  const text = await res.text();
  const cae = extractTag(text, 'CAE');
  if (!cae) return null;
  const vto = extractTag(text, 'CAEFchVto');
  return { cae, simulated: false, provider: 'afip', caeExpiresAt: vto, raw: text };
}

/** Facturante (TSD de Linkside): SOAP `CrearComprobante`. */
async function issueFacturante(config: Record<string, unknown>, invoice: InvoiceInput): Promise<IssueInvoiceResult | null> {
  const username = str(config.username);
  const password = str(config.password);
  const reseller = str(config.reseller);
  const serviceUrl = str(config.serviceUrl ?? config.baseUrl, 'https://api.facturante.com/ws');
  const amount = Number(invoice.amount ?? 0);

  const body = `<?xml version="1.0" encoding="utf-8"?>
<soap:Envelope xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/">
  <soap:Body>
    <CrearComprobante xmlns="https://api.facturante.com/">
      <Autenticacion>
        <Usuario>${escapeXml(username)}</Usuario>
        <Hash>${escapeXml(password)}</Hash>
        <Reseller>${escapeXml(reseller)}</Reseller>
      </Autenticacion>
      <Comprobante>
        <Total>${amount.toFixed(2)}</Total>
        <Cliente>${escapeXml(str(invoice.customerName))}</Cliente>
        <CUIT>${escapeXml(str(invoice.customerTaxId))}</CUIT>
      </Comprobante>
    </CrearComprobante>
  </soap:Body>
</soap:Envelope>`;

  const res = await fetchWithTimeout(serviceUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'text/xml; charset=utf-8', SOAPAction: '"CrearComprobante"' },
    body,
  });
  if (!res.ok) return null;

  const text = await res.text();
  const cae =
    extractTag(text, 'CAE') ?? extractTag(text, 'Cae') ?? extractTag(text, 'NumeroComprobante');
  if (!cae) return null;
  return { cae, simulated: false, provider: 'facturante', raw: text };
}

/** TSD genérico: SOAP con autenticación por usuario/contraseña. */
async function issueTsd(config: Record<string, unknown>, invoice: InvoiceInput): Promise<IssueInvoiceResult | null> {
  const username = str(config.username);
  const password = str(config.password);
  const serviceUrl = str(config.serviceUrl ?? config.baseUrl);
  if (!serviceUrl) return null;
  const amount = Number(invoice.amount ?? 0);

  const body = `<?xml version="1.0" encoding="utf-8"?>
<soap:Envelope xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/">
  <soap:Body>
    <GenerarComprobante xmlns="https://webservice.tsd.local/">
      <Usuario>${escapeXml(username)}</Usuario>
      <Password>${escapeXml(password)}</Password>
      <Comprobante>
        <Total>${amount.toFixed(2)}</Total>
        <CUIT>${escapeXml(str(invoice.customerTaxId))}</CUIT>
      </Comprobante>
    </GenerarComprobante>
  </soap:Body>
</soap:Envelope>`;

  const res = await fetchWithTimeout(serviceUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'text/xml; charset=utf-8', SOAPAction: '"GenerarComprobante"' },
    body,
  });
  if (!res.ok) return null;

  const text = await res.text();
  const cae = extractTag(text, 'CAE') ?? extractTag(text, 'Cae');
  if (!cae) return null;
  return { cae, simulated: false, provider: 'tsd', raw: text };
}

/**
 * Emite (autoriza) una factura ante el proveedor fiscal. Si no hay credenciales
 * o falla el webservice, devuelve un CAE simulado (`simulated: true`).
 */
export async function issueInvoice(
  provider: string,
  config: Record<string, unknown>,
  invoice: InvoiceInput,
): Promise<IssueInvoiceResult> {
  if (!hasCredentials(provider, config)) return simulatedResult(provider);

  try {
    const result =
      provider === 'afip'
        ? await issueAfip(config, invoice)
        : provider === 'facturante'
          ? await issueFacturante(config, invoice)
          : await issueTsd(config, invoice);
    return result ?? simulatedResult(provider);
  } catch {
    return simulatedResult(provider);
  }
}
