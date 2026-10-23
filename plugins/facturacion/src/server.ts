import { definePlugin, type PluginManifest } from '@webs/plugin-sdk';
import { issueInvoice } from '../../../apps/api/src/integrations/tax';
import { renderEscPos } from './escpos';
import manifestJson from '../plugin.json';

const manifest = manifestJson as unknown as PluginManifest;

/** Organización raíz por defecto (fallback single-tenant), idéntico a `DEFAULT_ORG_ID` de apps/api. */
const ROOT_ORG_ID = '00000000-0000-4000-8000-000000000001';

/**
 * Numeración correlativa por punto de venta + tipo de comprobante (ADR-0014).
 * Formato `pppp-tt-ssssssss`. Reemplaza el `F-<timestamp>` simulado; la correlatividad
 * se apoya en la constraint `number` @unique (un duplicado revienta y se reintenta).
 */
async function nextInvoiceNumber(
  db: Record<string, any>,
  ptoVta: number,
  cbteTipo: number,
): Promise<string> {
  const last = await db.invoice.findFirst({ where: { ptoVta, cbteTipo }, orderBy: { number: 'desc' } });
  let seq = 1;
  if (last?.number) {
    const parts = String(last.number).split('-');
    const parsed = parseInt(parts[parts.length - 1] ?? '', 10);
    if (!Number.isNaN(parsed)) seq = parsed + 1;
  }
  return `${String(ptoVta).padStart(4, '0')}-${cbteTipo}-${String(seq).padStart(8, '0')}`;
}

/** Orden del ciclo de vida de una factura: draft → issued → paid. */
const INVOICE_STATUS_ORDER: Record<string, number> = { draft: 0, issued: 1, paid: 2 };

/** Escapa HTML para evitar inyección al interpolar valores en la plantilla. */
function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/** Reemplaza los placeholders `{{...}}` de la plantilla con los datos de la factura. */
function renderInvoiceHtml(template: string, invoice: Record<string, any>, cfg: Record<string, unknown> = {}): string {
  const fmt = (v: unknown): string => (Number(v ?? 0) / 100).toFixed(2);
  const created = invoice.createdAt ? new Date(invoice.createdAt) : null;
  const date = created
    ? `${String(created.getDate()).padStart(2, '0')}/${String(created.getMonth() + 1).padStart(2, '0')}/${created.getFullYear()}`
    : '';
  const caeExp = invoice.caeExpiresAt ? new Date(invoice.caeExpiresAt) : null;
  const caeExpiresAt = caeExp
    ? `${String(caeExp.getDate()).padStart(2, '0')}/${String(caeExp.getMonth() + 1).padStart(2, '0')}/${caeExp.getFullYear()}`
    : '';

  const values: Record<string, string> = {
    number: String(invoice.number ?? ''),
    customerName: String(invoice.customerName ?? ''),
    customerTaxId: String(invoice.customerTaxId ?? ''),
    vatCondition: String(invoice.vatCondition ?? ''),
    amount: fmt(invoice.amount),
    neto: invoice.neto != null ? fmt(invoice.neto) : '',
    iva: invoice.iva != null ? fmt(invoice.iva) : '',
    date,
    cae: String(invoice.cae ?? '—'),
    caeExpiresAt,
    type: String(invoice.type ?? ''),
    currency: String(invoice.currency ?? 'ARS'),
    ptoVta: String(invoice.ptoVta ?? 1),
    cbteTipo: String(invoice.cbteTipo ?? 1),
    heading: String(cfg.heading ?? 'Comprobante'),
    footer: String(cfg.footer ?? ''),
    logo: String(cfg.logo ?? ''),
    primaryColor: String(cfg.primaryColor ?? '#111827'),
  };
  return template.replace(/\{\{(\w+)\}\}/g, (_match, key: string) => escapeHtml(values[key] ?? ''));
}

/** Construye una plantilla HTML a partir del `invoiceTemplateConfig` (apariencia editable). */
function buildTemplate(cfg: Record<string, unknown>): string {
  const primaryColor = String(cfg.primaryColor ?? '#111827');
  const showCae = cfg.showCae !== false;
  const showCustomer = cfg.showCustomer !== false;
  const logo = String(cfg.logo ?? '');
  const logoBlock = logo
    ? `<div style="margin-bottom:16px"><img src="{{logo}}" alt="logo" style="max-height:72px" /></div>`
    : '';
  const customerBlock = showCustomer
    ? `<table>
        <tr><td>Cliente</td><td>{{customerName}}</td></tr>
        <tr><td>CUIT</td><td>{{customerTaxId}}</td></tr>
        <tr><td>Condición IVA</td><td>{{vatCondition}}</td></tr>
      </table>`
    : '';
  const caeBlock = showCae
    ? `<div class="cae">CAE: {{cae}} · Vence: {{caeExpiresAt}}</div>`
    : '';

  return `<!doctype html>
<html lang="es">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>{{heading}} {{number}}</title>
    <style>
      * { box-sizing: border-box; }
      body { font-family: -apple-system, 'Segoe UI', Roboto, Arial, sans-serif; color: #111827; margin: 0; background: #f6f7f9; }
      .doc { max-width: 640px; margin: 24px auto; background: #fff; border-radius: 12px; padding: 32px; box-shadow: 0 12px 32px rgba(0,0,0,0.08); }
      h1 { margin: 0 0 4px; font-size: 22px; color: ${escapeHtml(primaryColor)}; }
      .meta { color: #6b7280; font-size: 14px; margin-bottom: 20px; }
      table { width: 100%; border-collapse: collapse; font-size: 14px; }
      td { padding: 8px 4px; border-bottom: 1px solid #e5e7eb; }
      td:last-child { text-align: right; }
      .amount { font-size: 28px; font-weight: 700; margin: 16px 0; }
      .cae { color: #6b7280; font-size: 12px; word-break: break-all; margin-top: 20px; }
      .footer { margin-top: 24px; color: #6b7280; font-size: 13px; }
      @media print { body { background: #fff; } .doc { box-shadow: none; margin: 0; } }
    </style>
  </head>
  <body>
    <div class="doc">
      ${logoBlock}
      <h1>{{heading}} {{type}}</h1>
      <div class="meta">N.º {{number}} · Pto. Vta. {{ptoVta}} · {{date}}</div>
      ${customerBlock}
      <table>
        <tr><td>Neto</td><td>{{currency}} {{neto}}</td></tr>
        <tr><td>IVA</td><td>{{currency}} {{iva}}</td></tr>
      </table>
      <div class="amount">{{currency}} {{amount}}</div>
      ${caeBlock}
      <div class="footer">{{footer}}</div>
    </div>
  </body>
</html>`;
}

export default definePlugin(manifest, {
  register: async (fastify, config) => {
    const cfg = config as Record<string, unknown>;
    const db = (fastify as unknown as { prisma: Record<string, any> }).prisma;
    const authenticate = (fastify as unknown as { authenticate: unknown }).authenticate as (
      req: unknown,
    ) => Promise<void>;

    // Resuelve la organización activa (tenant) con fallback a la org raíz 'principal'.
    const resolveOrgId = async (request: unknown): Promise<string> => {
      try {
        const { resolveTenant } = fastify as unknown as {
          resolveTenant?: (req: unknown) => Promise<{ organizationId?: string | null }>;
        };
        const tenant = resolveTenant ? await resolveTenant(request) : null;
        return tenant?.organizationId ?? ROOT_ORG_ID;
      } catch {
        return ROOT_ORG_ID;
      }
    };

    // Scoping fail-closed (ADR-0006): fragmento `where` por tenant + preHandler.
    const requireTenant = (fastify as unknown as {
      requireTenant?: (req: unknown, reply: unknown) => Promise<void>;
    }).requireTenant;
    const resolveScope = async (request: unknown): Promise<Record<string, unknown>> => {
      const api = fastify as unknown as {
        resolveScope?: (tenant: unknown) => Promise<Record<string, unknown>>;
        resolveTenant?: (req: unknown) => Promise<unknown>;
      };
      if (api.resolveTenant && api.resolveScope) return api.resolveScope(await api.resolveTenant(request));
      return { organizationId: ROOT_ORG_ID };
    };

    // Credenciales del proveedor fiscal (claves genéricas para el adaptador).
    const taxConfig: Record<string, unknown> = {
      cuit: cfg.taxId,
      taxId: cfg.taxId,
      token: cfg.fiscalToken,
      sign: cfg.fiscalSign,
      username: cfg.fiscalUsername,
      password: cfg.fiscalPassword,
      reseller: cfg.fiscalReseller,
      serviceUrl: cfg.fiscalServiceUrl,
      baseUrl: cfg.fiscalServiceUrl,
      arcaCert: cfg.arcaCert,
      cert: cfg.arcaCert,
      key: cfg.arcaKey,
    };

    // Genera el comprobante para un pago aprobado (idempotente por paymentId).
    const createInvoiceForPayment = async (paymentId: string): Promise<void> => {
      const existing = await db.invoice.findFirst({ where: { paymentId } });
      if (existing) return;
      const payment = await db.payment.findUnique({ where: { id: paymentId } });
      if (!payment) return;
      const number = await nextInvoiceNumber(db, 1, 1);

      // Datos de facturación del receptor que el checkout guardó en payment.metadata
      // (ADR-0015). El checkout manda `metadata.customer = { name, taxId, vatCondition }`.
      const metadata = (payment.metadata ?? {}) as Record<string, unknown>;
      const customer = (metadata.customer ?? {}) as Record<string, unknown>;
      const strOrNull = (v: unknown): string | null => (typeof v === 'string' && v.trim() ? v.trim() : null);

      await db.invoice.create({
        data: {
          number,
          type: 'receipt',
          amount: Number(payment.amount ?? 0),
          currency: payment.currency ?? 'ARS',
          status: 'paid',
          paymentId: payment.id,
          userId: payment.userId ?? null,
          organizationId: payment.organizationId ?? ROOT_ORG_ID,
          customerName: strOrNull(customer.name),
          customerTaxId: strOrNull(customer.taxId),
          vatCondition: strOrNull(customer.vatCondition),
          customerAddress: strOrNull(customer.address ?? customer.domicilio),
        },
      });
    };

    // Cada pago aprobado genera su comprobante (ADR-0014). El bus de eventos es
    // en-proceso: los suscriptores se registran al activar el plugin.
    const events = (fastify as unknown as {
      events?: { on?: (event: string, handler: (payload: Record<string, unknown>) => Promise<void>) => void };
    }).events;
    events?.on?.('payment.approved', async (payload) => {
      const payment = (payload?.payment ?? {}) as { id?: string };
      if (!payment?.id) return;
      try {
        await createInvoiceForPayment(String(payment.id));
      } catch (err) {
        (fastify as unknown as { log?: { warn?: (o: unknown, m: string) => void } }).log?.warn?.(
          { err },
          'No se pudo generar el comprobante automático del pago',
        );
      }
    });

    // ------------------------------------------------------------------
    // Facturas
    // ------------------------------------------------------------------
    fastify.get('/invoices', { preHandler: [authenticate, requireTenant] }, async (request: unknown) => {
      const { query } = request as {
        query?: { status?: string; from?: string; to?: string; userId?: string };
      };
      const where: Record<string, unknown> = { ...(await resolveScope(request)) };
      if (query?.status) where.status = query.status;
      if (query?.userId) where.userId = query.userId;
      if (query?.from || query?.to) {
        const createdAt: Record<string, unknown> = {};
        if (query?.from) createdAt.gte = new Date(query.from);
        if (query?.to) createdAt.lte = new Date(query.to);
        where.createdAt = createdAt;
      }
      return db.invoice.findMany({ where, orderBy: { createdAt: 'desc' }, take: 200 });
    });

    // Devuelve el comprobante en HTML (imprimible a PDF). Reemplaza los
    // placeholders de `config.invoiceTemplate` (o de la plantilla por defecto).
    fastify.get(
      '/invoices/:id/html',
      { preHandler: [authenticate, requireTenant] },
      async (request: unknown, reply: { header: (name: string, value: string) => unknown }) => {
        const { params, query } = request as { params?: { id?: string }; query?: { download?: string } };
        const invoice = await db.invoice.findFirst({ where: { id: params?.id, ...(await resolveScope(request)) } });
        reply.header('Content-Type', 'text/html; charset=utf-8');
        if (query?.download) {
          reply.header(
            'Content-Disposition',
            `attachment; filename="comprobante-${invoice?.number ?? params?.id}.html"`,
          );
        }
        if (!invoice) {
          return `<!doctype html><html lang="es"><head><meta charset="utf-8" /></head><body><h1>Factura no encontrada</h1></body></html>`;
        }
        const templateConfig = (cfg.invoiceTemplateConfig ?? {}) as Record<string, unknown>;
        const template = String(cfg.invoiceTemplate ?? '').trim() || buildTemplate(templateConfig);
        return renderInvoiceHtml(template, invoice, templateConfig);
      },
    );

    // Comprobante para impresora térmica: stream ESC/POS (80 mm / 58 mm).
    fastify.get(
      '/invoices/:id/escpos',
      { preHandler: [authenticate, requireTenant] },
      async (request: unknown, reply: { header: (name: string, value: string) => unknown }) => {
        const { params, query } = request as { params?: { id?: string }; query?: { width?: string } };
        const invoice = await db.invoice.findFirst({ where: { id: params?.id, ...(await resolveScope(request)) } });
        reply.header('Content-Type', 'text/plain; charset=utf-8');
        if (!invoice) return 'Comprobante no encontrado\n';
        const width: 80 | 58 = query?.width === '58' ? 58 : 80;
        const esc = renderEscPos(
          {
            number: invoice.number,
            type: invoice.type,
            customerName: invoice.customerName,
            customerTaxId: invoice.customerTaxId,
            currency: invoice.currency,
            amount: invoice.amount,
            neto: invoice.neto,
            iva: invoice.iva,
            cae: invoice.cae,
            caeExpiresAt: invoice.caeExpiresAt,
            createdAt: invoice.createdAt,
            businessName: String(cfg.businessName ?? ''),
          },
          width,
        );
        return esc;
      },
    );

    fastify.post('/invoices', { preHandler: [authenticate, requireTenant] }, async (request: unknown) => {
      const { body } = request as {
        body?: {
          customerName?: string;
          customerTaxId?: string;
          vatCondition?: string;
          customerAddress?: string;
          amount?: number;
          neto?: number;
          iva?: number;
          type?: string;
          ptoVta?: number;
          cbteTipo?: number;
          orderId?: string;
          userId?: string;
        };
      };
      const ptoVta = Number(body?.ptoVta ?? cfg.ptoVta ?? 1) || 1;
      const cbteTipo = Number(body?.cbteTipo ?? 1) || 1;
      const number = await nextInvoiceNumber(db, ptoVta, cbteTipo);
      return db.invoice.create({
        data: {
          number,
          type: body?.type ?? 'invoice',
          amount: Number(body?.amount ?? 0),
          neto: body?.neto != null ? Number(body.neto) : null,
          iva: body?.iva != null ? Number(body.iva) : null,
          currency: 'ARS',
          status: 'draft',
          customerName: body?.customerName ?? null,
          customerTaxId: body?.customerTaxId ?? null,
          vatCondition: body?.vatCondition ?? null,
          customerAddress: body?.customerAddress ?? null,
          ptoVta,
          cbteTipo,
          orderId: body?.orderId ?? null,
          userId: body?.userId ?? null,
          organizationId: await resolveOrgId(request),
        },
      });
    });

    fastify.patch('/invoices/:id', { preHandler: [authenticate, requireTenant] }, async (request: unknown) => {
      const { params, body } = request as { params?: { id?: string }; body?: { status?: string } };
      const status = body?.status;
      if (!status || !(status in INVOICE_STATUS_ORDER)) return { ok: false, error: 'Estado inválido (draft | issued | paid)' };

      const invoice = await db.invoice.findFirst({ where: { id: params?.id, ...(await resolveScope(request)) } });
      if (!invoice) return { ok: false, error: 'Factura no encontrada' };

      const current = INVOICE_STATUS_ORDER[invoice.status] ?? 0;
      const next = INVOICE_STATUS_ORDER[status] ?? 0;
      if (next < current) return { ok: false, error: `Transición inválida: ${invoice.status} → ${status}` };

      return db.invoice.update({ where: { id: invoice.id }, data: { status } });
    });

    // Emite la factura ante el proveedor fiscal configurado; si no hay
    // credenciales o falla el webservice, cae a un CAE simulado.
    fastify.post('/invoices/:id/issue', { preHandler: [authenticate, requireTenant] }, async (request: unknown) => {
      const { params } = request as { params?: { id?: string } };
      const invoice = await db.invoice.findFirst({ where: { id: params?.id, ...(await resolveScope(request)) } });
      if (!invoice) return { ok: false, error: 'Factura no encontrada' };

      const provider = String(cfg.taxProvider ?? 'local');
      const result = await issueInvoice(provider, taxConfig, {
        id: invoice.id,
        number: invoice.number,
        amount: Number(invoice.amount),
        currency: invoice.currency,
        customerName: invoice.customerName,
        customerTaxId: invoice.customerTaxId,
        vatCondition: invoice.vatCondition,
        type: invoice.type,
      });

      const updated = await db.invoice.update({
        where: { id: invoice.id },
        data: { status: 'issued', cae: result.cae },
      });
      return {
        ok: true,
        cae: result.cae,
        provider,
        simulated: result.simulated,
        caeExpiresAt: result.caeExpiresAt ?? null,
        invoice: updated,
      };
    });

    fastify.delete('/invoices/:id', { preHandler: [authenticate, requireTenant] }, async (request: unknown) => {
      const { params } = request as { params?: { id?: string } };
      const invoice = await db.invoice.findFirst({ where: { id: params?.id, ...(await resolveScope(request)) } });
      if (!invoice) return { ok: false, error: 'Factura no encontrada' };
      return db.invoice.delete({ where: { id: invoice.id } });
    });
  },
});
