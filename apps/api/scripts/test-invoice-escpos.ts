/**
 * Smoke test del renderer ESC/POS (ADR-0014): verifica el contrato de salida
 * (init, encabezado, total, CAE, corte) para 80 mm y 58 mm.
 * Corre con: pnpm --filter @webs/api exec tsx ../../scripts/test-invoice-escpos.ts
 */
import { renderEscPos } from '../../../plugins/facturacion/src/escpos';

const invoice = {
  number: '0001-1-00000001',
  type: 'invoice',
  customerName: 'Cliente Test',
  customerTaxId: '20-12345678-9',
  currency: 'ARS',
  amount: 123456,
  neto: 101234,
  iva: 22222,
  cae: '12345678901234',
  caeExpiresAt: '2026-11-02T00:00:00Z',
  createdAt: '2026-10-23T12:00:00Z',
  businessName: 'Mi Empresa SRL',
};

const out80 = renderEscPos(invoice, 80);
const out58 = renderEscPos(invoice, 58);

const checks: Array<[string, boolean]> = [
  ['inicia con ESC @ (init)', out80.startsWith('\x1b@')],
  ['incluye número correlativo', out80.includes('0001-1-00000001')],
  ['incluye razón social', out80.includes('Mi Empresa SRL')],
  ['incluye total formateado (ARS 1234.56)', out80.includes('ARS 1234.56')],
  ['incluye neto', out80.includes('1012.34')],
  ['incluye CAE', out80.includes('12345678901234')],
  ['termina con corte parcial GS V 1', out80.endsWith('\x1d\x56\x01')],
  ['58mm usa divisor de 32 columnas', out58.includes('-'.repeat(32))],
  ['80mm usa divisor de 48 columnas', out80.includes('-'.repeat(48))],
];

let failed = 0;
for (const [name, ok] of checks) {
  console.log(`${ok ? 'PASS' : 'FAIL'} ${name}`);
  if (!ok) failed++;
}
if (failed) {
  console.log('\n--- salida 80mm ---\n' + JSON.stringify(out80.slice(0, 400)));
  process.exit(1);
}
console.log(`\n${checks.length - failed}/${checks.length} checks OK`);
