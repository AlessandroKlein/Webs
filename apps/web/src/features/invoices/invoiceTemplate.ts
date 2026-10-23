/**
 * Réplica client-side de `buildTemplate` + `renderInvoiceHtml` del plugin
 * `facturacion` (plugins/facturacion/src/server.ts). Sirve para la vista previa
 * en vivo del editor de plantilla sin depender de un comprobante guardado.
 *
 * Debe mantenerse en sincronía con el backend (mismas claves, mismos
 * placeholders, misma estructura HTML).
 */

import i18next from '../../lib/i18n';

export interface InvoiceTemplateConfig {
  logo: string;
  primaryColor: string;
  heading: string;
  footer: string;
  showCae: boolean;
  showCustomer: boolean;
}

export const DEFAULT_TEMPLATE_CONFIG: InvoiceTemplateConfig = {
  logo: '',
  primaryColor: '#111827',
  heading: 'Comprobante',
  footer: 'Gracias por su compra',
  showCae: true,
  showCustomer: true,
};

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
function renderInvoiceHtml(template: string, invoice: Record<string, unknown>, cfg: Partial<InvoiceTemplateConfig>): string {
  const fmt = (v: unknown): string => (Number(v ?? 0) / 100).toFixed(2);
  const created = invoice.createdAt ? new Date(String(invoice.createdAt)) : null;
  const date = created
    ? `${String(created.getDate()).padStart(2, '0')}/${String(created.getMonth() + 1).padStart(2, '0')}/${created.getFullYear()}`
    : '';
  const caeExp = invoice.caeExpiresAt ? new Date(String(invoice.caeExpiresAt)) : null;
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

/** Construye una plantilla HTML a partir del `invoiceTemplateConfig`. */
function buildTemplate(cfg: Partial<InvoiceTemplateConfig>): string {
  const primaryColor = String(cfg.primaryColor ?? '#111827');
  const showCae = cfg.showCae !== false;
  const showCustomer = cfg.showCustomer !== false;
  const logo = String(cfg.logo ?? '');
  const logoBlock = logo
    ? `<div style="margin-bottom:16px"><img src="{{logo}}" alt="logo" style="max-height:72px" /></div>`
    : '';
  const customerBlock = showCustomer
    ? `<table>
        <tr><td>${i18next.t('invoice.customer')}</td><td>{{customerName}}</td></tr>
        <tr><td>${i18next.t('invoice.taxId')}</td><td>{{customerTaxId}}</td></tr>
        <tr><td>${i18next.t('invoice.vatCondition')}</td><td>{{vatCondition}}</td></tr>
      </table>`
    : '';
  const caeBlock = showCae
    ? `<div class="cae">${i18next.t('invoice.cae')}: {{cae}} · ${i18next.t('invoice.expires')}: {{caeExpiresAt}}</div>`
    : '';

  return `<!doctype html>
<html lang="${i18next.language.split('-')[0]}">
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
      <div class="meta">${i18next.t('invoice.numberLabel')} {{number}} · ${i18next.t('invoice.pointOfSale')} {{ptoVta}} · {{date}}</div>
      ${customerBlock}
      <table>
        <tr><td>${i18next.t('invoice.net')}</td><td>{{currency}} {{neto}}</td></tr>
        <tr><td>${i18next.t('invoice.vat')}</td><td>{{currency}} {{iva}}</td></tr>
      </table>
      <div class="amount">{{currency}} {{amount}}</div>
      ${caeBlock}
      <div class="footer">{{footer}}</div>
    </div>
  </body>
</html>`;
}

/** Renderiza el HTML final de un comprobante (plantilla + datos). */
export function renderTemplateHtml(cfg: Partial<InvoiceTemplateConfig>, invoice: Record<string, unknown>): string {
  return renderInvoiceHtml(buildTemplate(cfg), invoice, cfg);
}

/** Datos de ejemplo para la vista previa del editor. */
export function sampleInvoice(): Record<string, unknown> {
  return {
    number: '0001-1-00000001',
    type: 'Factura B',
    amount: 123456,
    neto: 102029,
    iva: 21427,
    currency: 'ARS',
    customerName: 'Cliente de ejemplo',
    customerTaxId: '20-12345678-9',
    vatCondition: 'Responsable inscripto',
    cae: '12345678901234',
    caeExpiresAt: new Date(Date.now() + 10 * 24 * 60 * 60 * 1000).toISOString(),
    createdAt: new Date().toISOString(),
    ptoVta: 1,
    cbteTipo: 1,
  };
}
