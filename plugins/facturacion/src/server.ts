import { definePlugin, type PluginManifest } from '@webs/plugin-sdk';
import { issueInvoice } from '../../../apps/api/src/integrations/tax';
import manifestJson from '../plugin.json';

const manifest = manifestJson as unknown as PluginManifest;

/** Organización raíz por defecto (fallback single-tenant), idéntico a `DEFAULT_ORG_ID` de apps/api. */
const ROOT_ORG_ID = '00000000-0000-4000-8000-000000000001';

/** Número de factura autoincremental simulado: `F-<timestamp>-<4 dígitos>`. */
function buildInvoiceNumber(): string {
  const random = Math.floor(1000 + Math.random() * 9000);
  return `F-${Date.now()}-${random}`;
}

/** Orden del ciclo de vida de una factura: draft → issued → paid. */
const INVOICE_STATUS_ORDER: Record<string, number> = { draft: 0, issued: 1, paid: 2 };

/** Plantilla por defecto del comprobante (imprimible a PDF desde el navegador). */
const DEFAULT_INVOICE_TEMPLATE = `<!doctype html>
<html lang="es">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Comprobante {{number}}</title>
    <style>
      * { box-sizing: border-box; }
      body { font-family: -apple-system, 'Segoe UI', Roboto, Arial, sans-serif; color: #111827; margin: 0; background: #f6f7f9; }
      .doc { max-width: 640px; margin: 24px auto; background: #fff; border-radius: 12px; padding: 32px; box-shadow: 0 12px 32px rgba(0,0,0,0.08); }
      h1 { margin: 0 0 4px; font-size: 22px; }
      .meta { color: #6b7280; font-size: 14px; margin-bottom: 20px; }
      table { width: 100%; border-collapse: collapse; font-size: 14px; }
      td { padding: 8px 4px; border-bottom: 1px solid #e5e7eb; }
      td:last-child { text-align: right; }
      .amount { font-size: 28px; font-weight: 700; margin: 16px 0; }
      .cae { color: #6b7280; font-size: 12px; word-break: break-all; margin-top: 20px; }
      @media print { body { background: #fff; } .doc { box-shadow: none; margin: 0; } }
    </style>
  </head>
  <body>
    <div class="doc">
      <h1>Comprobante {{type}}</h1>
      <div class="meta">N.º {{number}} · {{date}}</div>
      <table>
        <tr><td>Cliente</td><td>{{customerName}}</td></tr>
        <tr><td>Moneda</td><td>{{currency}}</td></tr>
      </table>
      <div class="amount">{{currency}} {{amount}}</div>
      <div class="cae">CAE: {{cae}}</div>
    </div>
  </body>
</html>`;

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
function renderInvoiceHtml(template: string, invoice: Record<string, any>): string {
  const amount = (Number(invoice.amount ?? 0) / 100).toFixed(2);
  const created = invoice.createdAt ? new Date(invoice.createdAt) : null;
  const date = created
    ? `${String(created.getDate()).padStart(2, '0')}/${String(created.getMonth() + 1).padStart(2, '0')}/${created.getFullYear()}`
    : '';
  const values: Record<string, string> = {
    number: String(invoice.number ?? ''),
    customerName: String(invoice.customerName ?? ''),
    amount,
    date,
    cae: String(invoice.cae ?? '—'),
    type: String(invoice.type ?? ''),
    currency: String(invoice.currency ?? 'ARS'),
  };
  return template.replace(/\{\{(number|customerName|amount|date|cae|type|currency)\}\}/g, (_match, key: string) =>
    escapeHtml(values[key] ?? ''),
  );
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
    };

    // ------------------------------------------------------------------
    // Facturas
    // ------------------------------------------------------------------
    fastify.get('/invoices', { preHandler: [authenticate, requireTenant] }, async (request: unknown) => {
      const { query } = request as { query?: { status?: string } };
      const where: Record<string, unknown> = { ...(await resolveScope(request)) };
      if (query?.status) where.status = query.status;
      return db.invoice.findMany({ where, orderBy: { createdAt: 'desc' } });
    });

    // Devuelve el comprobante en HTML (imprimible a PDF). Reemplaza los
    // placeholders de `config.invoiceTemplate` (o de la plantilla por defecto).
    fastify.get(
      '/invoices/:id/html',
      async (request: unknown, reply: { header: (name: string, value: string) => unknown }) => {
        const { params } = request as { params?: { id?: string } };
        // `findFirst` (no `findUnique`) permite ANDear el scope del tenant sin
        // exigir una constraint única compuesta.
        const invoice = await db.invoice.findFirst({ where: { id: params?.id, ...(await resolveScope(request)) } });
        reply.header('Content-Type', 'text/html; charset=utf-8');
        if (!invoice) {
          return `<!doctype html><html lang="es"><head><meta charset="utf-8" /></head><body><h1>Factura no encontrada</h1></body></html>`;
        }
        const template = String(cfg.invoiceTemplate ?? '').trim() || DEFAULT_INVOICE_TEMPLATE;
        return renderInvoiceHtml(template, invoice);
      },
    );

    fastify.post('/invoices', { preHandler: [authenticate] }, async (request: unknown) => {
      const { body } = request as {
        body?: { customerName?: string; customerTaxId?: string; vatCondition?: string; amount?: number; type?: string };
      };
      return db.invoice.create({
        data: {
          number: buildInvoiceNumber(),
          type: body?.type ?? 'invoice',
          amount: Number(body?.amount ?? 0),
          currency: 'ARS',
          status: 'draft',
          customerName: body?.customerName ?? null,
          customerTaxId: body?.customerTaxId ?? null,
          vatCondition: body?.vatCondition ?? null,
          organizationId: await resolveOrgId(request),
        },
      });
    });

    fastify.patch('/invoices/:id', { preHandler: [authenticate] }, async (request: unknown) => {
      const { params, body } = request as { params?: { id?: string }; body?: { status?: string } };
      const status = body?.status;
      if (!status || !(status in INVOICE_STATUS_ORDER)) return { ok: false, error: 'Estado inválido (draft | issued | paid)' };

      const invoice = await db.invoice.findUnique({ where: { id: params?.id } });
      if (!invoice) return { ok: false, error: 'Factura no encontrada' };

      const current = INVOICE_STATUS_ORDER[invoice.status] ?? 0;
      const next = INVOICE_STATUS_ORDER[status] ?? 0;
      if (next < current) return { ok: false, error: `Transición inválida: ${invoice.status} → ${status}` };

      return db.invoice.update({ where: { id: invoice.id }, data: { status } });
    });

    // Emite la factura ante el proveedor fiscal configurado; si no hay
    // credenciales o falla el webservice, cae a un CAE simulado.
    fastify.post('/invoices/:id/issue', { preHandler: [authenticate] }, async (request: unknown) => {
      const { params } = request as { params?: { id?: string } };
      const invoice = await db.invoice.findUnique({ where: { id: params?.id } });
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

    fastify.delete('/invoices/:id', { preHandler: [authenticate] }, async (request: unknown) => {
      const { params } = request as { params?: { id?: string } };
      return db.invoice.delete({ where: { id: params?.id } });
    });
  },
});
