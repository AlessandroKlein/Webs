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

const jsonBody = (body: unknown): Record<string, unknown> => JSON.parse(String(body)) as Record<string, unknown>;

const input = { amount: 1000, currency: 'ARS', items: [{ id: 'a', title: 'Producto', quantity: 2, unitPrice: 1500 }] };

test('sin accessToken y sin mock → 400', async () => {
  const adapter = await register({});
  await assert.rejects(() => adapter.createTransaction(input), (e: Error & { statusCode?: number }) => e.statusCode === 400);
});

test('modo mock → URL sandbox sin llamar a fetch', async () => {
  const prev = process.env.MP_MODE;
  process.env.MP_MODE = 'mock';
  try {
    const adapter = await register({});
    let calls = 0;
    const origFetch = globalThis.fetch;
    globalThis.fetch = (async () => { calls += 1; throw new Error('no debe llamar a fetch en mock'); }) as typeof fetch;
    try {
      const r = await adapter.createTransaction(input);
      assert.match(r.transactionId, /^mp_/);
      assert.match(r.paymentUrl ?? '', /sandbox\.mercadopago\.com\/mock\//);
      assert.equal(calls, 0);
    } finally {
      globalThis.fetch = origFetch;
    }
  } finally {
    if (prev === undefined) delete process.env.MP_MODE; else process.env.MP_MODE = prev;
  }
});

test('con accessToken → POST preferencia con body correcto', async () => {
  const adapter = await register({ accessToken: 'TEST-123' });
  let captured: { url: string; init: RequestInit } | undefined;
  const origFetch = globalThis.fetch;
  globalThis.fetch = (async (url: unknown, init?: RequestInit) => {
    captured = { url: String(url), init: init ?? {} };
    return new Response(JSON.stringify({ id: 'pref_1', init_point: 'https://checkout.mp' }), { status: 201, headers: { 'content-type': 'application/json' } });
  }) as typeof fetch;
  try {
    const r = await adapter.createTransaction(input);
    assert.equal(captured?.url, 'https://api.mercadopago.com/checkout/preferences');
    assert.equal((captured?.init.headers as Record<string, string>).Authorization, 'Bearer TEST-123');
    const body = jsonBody(captured?.init.body);
    assert.equal(body.external_reference, r.transactionId);
    assert.equal((body.items as Array<{ unit_price: number; quantity: number }>)[0]?.unit_price, 15);
    assert.equal(r.paymentUrl, 'https://checkout.mp');
    assert.equal((r.raw as { preferenceId: string }).preferenceId, 'pref_1');
  } finally {
    globalThis.fetch = origFetch;
  }
});

test('webhook firma inválida → 401', async () => {
  const adapter = await register({ webhookSecret: 's3cret' });
  const req = { body: { data: { external_reference: 'mp_x', status: 'approved' } }, headers: { 'x-signature': 'sha256=bad' } };
  await assert.rejects(() => adapter.verifyWebhook(req), (e: Error & { statusCode?: number }) => e.statusCode === 401);
});

test('webhook sin secret → skip firma + mapea external_reference (idempotente)', async () => {
  const adapter = await register({});
  const req = { body: { data: { external_reference: 'mp_abc', status: 'approved' } }, headers: {} };
  const a = await adapter.verifyWebhook(req);
  const b = await adapter.verifyWebhook(req); // misma entrega → mismo transactionId
  assert.equal(a.transactionId, 'mp_abc');
  assert.equal(a.status, 'approved');
  assert.equal(b.transactionId, a.transactionId);
});
