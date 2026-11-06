import assert from 'node:assert/strict';

/**
 * Contrato de tienda/blog/licencias (task-55).
 *
 * Verifica la lógica PURA que se replica en producción (los plugins no
 * exportan estos helpers porque son internos al `register` de Fastify):
 * - `slugify`/`uniqueSlug` — plugins/blog/src/server.ts y plugins/ecommerce/src/server.ts.
 * - scoping de órdenes — plugins/ecommerce/src/server.ts `GET /orders`.
 * - idempotencia de venta de licencia — apps/api/src/modules/licenses/index.ts
 *   (una clave por `paymentId`, patrón `Invoice.paymentId`).
 */

// --- slug ---------------------------------------------------------------
const slugify = (value: string): string =>
  value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .replace(/-+/g, '-');

assert.equal(slugify('Café con Leche'), 'cafe-con-leche');
assert.equal(slugify('  ¡Hola, Mundo!  '), 'hola-mundo');
assert.equal(slugify('Todo   Junto'), 'todo-junto');
assert.equal(slugify('A--B'), 'a-b');
assert.equal(slugify(''), '');

// --- scoping de órdenes --------------------------------------------------
type Tenant = { organizationId: string; isChainAdmin: boolean; isSuperAdmin: boolean };

const orderWhere = (tenant: Tenant, userId: string | null) => {
  const isAdmin = tenant.isChainAdmin || tenant.isSuperAdmin;
  if (isAdmin) return { organizationId: tenant.organizationId };
  return { organizationId: tenant.organizationId, userId };
};

assert.deepEqual(orderWhere({ organizationId: 'o1', isChainAdmin: false, isSuperAdmin: false }, 'u1'), {
  organizationId: 'o1',
  userId: 'u1',
});
assert.deepEqual(orderWhere({ organizationId: 'o1', isChainAdmin: true, isSuperAdmin: false }, 'u1'), {
  organizationId: 'o1',
});
assert.deepEqual(orderWhere({ organizationId: 'o1', isChainAdmin: false, isSuperAdmin: false }, null), {
  organizationId: 'o1',
  userId: null,
});

// --- idempotencia de venta de licencia -----------------------------------
const issued: string[] = [];
const sold = new Set<string>();

const onPaymentApproved = (payment: { id: string; metadata?: { kind?: string; fingerprint?: string } }) => {
  if (payment.metadata?.kind !== 'license' || !payment.id) return;
  if (sold.has(payment.id)) return; // idempotente: una clave por paymentId
  if (!payment.metadata.fingerprint) return; // sin fingerprint no se emite
  sold.add(payment.id);
  issued.push(payment.id);
};

const licensePayment = { id: 'p1', metadata: { kind: 'license', fingerprint: 'fp-abc' } };
onPaymentApproved(licensePayment);
onPaymentApproved(licensePayment); // duplicado: no re-emite
assert.deepEqual(issued, ['p1']);
assert.equal(sold.has('p1'), true);

onPaymentApproved({ id: 'p2', metadata: { kind: 'subscription', fingerprint: 'fp-x' } });
assert.deepEqual(issued, ['p1']); // no license → no emite

onPaymentApproved({ id: 'p3', metadata: { kind: 'license' } }); // sin fingerprint
assert.deepEqual(issued, ['p1']);

console.log('tienda-blog.test: OK');
