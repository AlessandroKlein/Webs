/**
 * Renderer ESC/POS para comprobantes (factura/receipt) en impresoras térmicas.
 *
 * Produce un documento de texto con comandos de control ESC/POS:
 *  - `ESC @` (0x1B 0x40): inicializar impresora.
 *  - `GS ! n` (0x1D 0x21 n): modo de carácter (bit 0 = doble ancho, bit 1 = doble alto).
 *  - `ESC d n` (0x1B 0x64 n): imprimir y avanzar n líneas.
 *  - `GS V n` (0x1D 0x56 n): corte de papel (n=1 corte parcial, n=0 corte total).
 *
 * Anchos soportados: 80 mm (48 columnas) y 58 mm (32 columnas).
 * El texto se recorta/ajusta a la columna; los importes se formatean a 2 decimales.
 */

const ESC = '\x1b';
const GS = '\x1d';

export type EscPosWidth = 80 | 58;

/** Importes en centavos → string con 2 decimales. */
function money(amount: number): string {
  return (Number(amount ?? 0) / 100).toFixed(2);
}

function dateEs(iso: string | Date | null | undefined): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return String(iso);
  const dd = String(d.getDate()).padStart(2, '0');
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const yyyy = d.getFullYear();
  return `${dd}/${mm}/${yyyy}`;
}

function pad(text: string, width: number): string {
  const s = String(text ?? '');
  return s.length > width ? s.slice(0, width) : s.padEnd(width, ' ');
}

function center(text: string, width: number): string {
  const s = String(text ?? '');
  const totalPad = Math.max(0, width - s.length);
  const left = Math.floor(totalPad / 2);
  return ' '.repeat(left) + s;
}

function divider(width: number, char = '-'): string {
  return char.repeat(width);
}

export interface EscPosInvoice {
  number?: string;
  type?: string;
  customerName?: string;
  customerTaxId?: string;
  currency?: string;
  amount?: number;
  neto?: number | null;
  iva?: number | null;
  cae?: string;
  caeExpiresAt?: string | Date | null;
  createdAt?: string | Date | null;
  businessName?: string;
}

export function renderEscPos(invoice: EscPosInvoice, width: EscPosWidth = 80): string {
  const W = width === 58 ? 32 : 48;
  const out: string[] = [];

  out.push(ESC + '@'); // init
  out.push(GS + '!' + String.fromCharCode(0x11)); // doble ancho + doble alto (encabezado)
  out.push(center(invoice.businessName ?? 'COMPROBANTE', W));
  out.push(GS + '!' + String.fromCharCode(0x00)); // modo normal
  out.push('');
  out.push(pad(`Nº: ${invoice.number ?? ''}`, W));
  out.push(pad(`Fecha: ${dateEs(invoice.createdAt)}`, W));
  out.push(pad(`Tipo: ${invoice.type ?? ''}`, W));
  out.push(divider(W));

  if (invoice.customerName) out.push(pad(`Cliente: ${invoice.customerName}`, W));
  if (invoice.customerTaxId) out.push(pad(`CUIT: ${invoice.customerTaxId}`, W));
  out.push(divider(W));

  if (invoice.neto != null) out.push(pad(`Neto:   ${money(invoice.neto)}`, W));
  if (invoice.iva != null) out.push(pad(`IVA:    ${money(invoice.iva)}`, W));
  out.push(pad(`Total: ${invoice.currency ?? 'ARS'} ${money(invoice.amount ?? 0)}`, W));
  out.push(divider(W));

  if (invoice.cae) {
    out.push(pad(`CAE: ${invoice.cae}`, W));
    if (invoice.caeExpiresAt) out.push(pad(`Vto: ${dateEs(invoice.caeExpiresAt)}`, W));
    out.push(divider(W));
  }

  out.push('');
  out.push(center('Gracias por su compra', W));
  out.push('');
  out.push(ESC + 'd' + String.fromCharCode(3)); // avanzar 3 líneas
  out.push(GS + 'V' + String.fromCharCode(1)); // corte parcial

  return out.join('\n');
}
