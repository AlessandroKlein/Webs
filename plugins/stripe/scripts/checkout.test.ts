import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import plugin from '../src/server';

type Adapter = {
  createTransaction(input: unknown): Promise<{ transactionId: string; paymentUrl?: string; raw?: unknown }>;
  verifyWebhook(request: unknown): Promise<{ transactionId: string; status: string }>;
};

async function register(config: unknown): Promise<Adapter> {
  let adapter: Adapter | undefined;
  const fastify = {
    payments: { register: (a: Adapter) => { adapter = a; } },
    get: () => {},
    log: { info: () => {}, warn: () => {}, error: () => {} },
  };
  await plugin.register?.(fastify as never, config as never);
  if (!adapter) throw new Error('adapter no registrado');
  return adapter;
}

const input = { amount: 1000, currency: 'ARS', items: [{ id: 'a', title: 'Producto', quantity: 1, unitPrice: 1000 }] };

test('sin secretKey y sin mock → 400', async () => {
  const adapter = await register({});
  await assert.rejects(() => adapter.createTransaction(input), (e: Error & { statusCode?: number }) => e.statusCode === 400);
});

test('modo mock → URL sandbox sin fetch', async () => {
  const prev = process.env.STRIPE_MODE;
  process.env.STRIPE_MODE = 'mock';
  try {
    const adapter = await register({});
    let calls = 0;
    const origFetch = globalThis.fetch;
    globalThis.fetch = (async () => { calls += 1; throw new Error('no debe llamar a fetch'); }) as typeof fetch;
    try {
      const r = await adapter.createTransaction(input);
      assert.match(r.transactionId, /^cs_/);
      assert.match(r.paymentUrl ?? '', /sandbox\.stripe\.com\/mock\//);
      assert.equal(calls, 0);
    } finally {
      globalThis.fetch = origFetch;
    }
  } finally {
    if (prev === undefined) delete process.env.STRIPE_MODE; else process.env.STRIPE_MODE = prev;
  }
});

test('con secretKey → POST session form-urlencoded correcto', async () => {
  const adapter = await register({ secretKey: 'sk_test_123' });
  let captured: { url: string; init: RequestInit } | undefined;
  const origFetch = globalThis.fetch;
  globalThis.fetch = (async (url: unknown, init?: RequestInit) => {
    captured = { url: String(url), init: init ?? {} };
    return new Response(JSON.stringify({ id: 'cs_test_1', url: 'https://checkout.stripe' }), { status: 200, headers: { 'content-type': 'application/json' } });
  }) as typeof fetch;
  try {
    const r = await adapter.createTransaction(input);
    assert.equal(captured?.url, 'https://api.stripe.com/v1/checkout/sessions');
    assert.equal((captured?.init.headers as Record<string, string>).Authorization, 'Bearer sk_test_123');
    const body = new URLSearchParams(String(captured?.init.body));
    assert.equal(body.get('mode'), 'payment');
    assert.equal(body.get('client_reference_id'), r.transactionId);
    assert.equal(body.get('line_items[0][price_data][unit_amount]'), '1000');
    assert.equal(r.paymentUrl, 'https://checkout.stripe');
    assert.equal((r.raw as { sessionId: string }).sessionId, 'cs_test_1');
  } finally {
    globalThis.fetch = origFetch;
  }
});

test('webhook firma inválida → 401', async () => {
  const adapter = await register({ webhookSecret: 'whsec_1' });
  const req = { body: { data: { object: { client_reference_id: 'cs_x', payment_status: 'paid' } } }, headers: { 'stripe-signature': 'bad' } };
  await assert.rejects(() => adapter.verifyWebhook(req), (e: Error & { statusCode?: number }) => e.statusCode === 401);
});

test('webhook sin secret → mapea client_reference_id (idempotente)', async () => {
  const adapter = await register({});
  const req = { body: { data: { object: { client_reference_id: 'cs_abc', payment_status: 'paid' } } }, headers: {} };
  const a = await adapter.verifyWebhook(req);
  const b = await adapter.verifyWebhook(req); // misma entrega → mismo transactionId
  assert.equal(a.transactionId, 'cs_abc');
  assert.equal(a.status, 'approved');
  assert.equal(b.transactionId, a.transactionId);
});
