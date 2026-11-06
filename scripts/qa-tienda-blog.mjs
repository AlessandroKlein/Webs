// QA E2E task-58: cuenta, mis compras, blog y licencias.
// Sólo node (>=22) + fetch nativo. Sin deps. Contra http://localhost:4000.
import { randomUUID } from 'node:crypto';
const BASE = 'http://localhost:4000/api/v1';
const ts = Date.now();
// fingerprints únicos por run (hex de 32), para no confundir claves stale de runs previos
const FP1 = randomUUID().replace(/-/g, '');
const FP2 = randomUUID().replace(/-/g, '');
let failures = 0;
let findings = 0;

function line(name, ok, detail) {
  if (ok) {
    console.log(`PASA  ${name}`);
  } else {
    failures++;
    console.log(`FALLA ${name}  ${detail ?? ''}`);
  }
}
function info(name, detail) {
  console.log(`INFO  ${name}  ${detail ?? ''}`);
}
function hallazgo(name, detail) {
  findings++;
  console.log(`HALLAZGO ${name}  ${detail ?? ''}`);
}
function check(name, cond, detail) {
  line(name, !!cond, detail);
}

async function api(method, path, { token, body, raw } = {}) {
  const res = await fetch(BASE + path, {
    method,
    headers: {
      ...(body !== undefined ? { 'content-type': 'application/json' } : {}),
      ...(token ? { authorization: `Bearer ${token}` } : {}),
    },
    body: body === undefined ? undefined : raw ? body : JSON.stringify(body),
  });
  const text = await res.text();
  let data;
  try { data = JSON.parse(text); } catch { data = text; }
  return { status: res.status, data };
}

async function login(identifier, password) {
  const r = await api('POST', '/auth/login', { body: { identifier, password } });
  return r;
}

const admin = await login('admin@webs.test', 'Admin12345!');
check('login admin 200', admin.status === 200, JSON.stringify(admin.data).slice(0, 120));
const adminToken = admin.data?.accessToken;
if (!adminToken) { console.log('FATAL: sin token admin'); process.exit(2); }

// Asegurar plugins (ecommerce, blog, mercadopago) instalados
async function ensurePlugin(id) {
  const r = await api('POST', '/plugins/install', { token: adminToken, body: { id } });
  // 201 nuevo, 200/409 ya instalado
  return r.status === 201 || r.status === 200 || r.status === 409;
}
for (const pid of ['ecommerce', 'blog', 'mercadopago']) {
  const ok = await ensurePlugin(pid);
  info(`plugin ${pid}`, ok ? 'instalado/ok' : 'FALLO');
  if (!ok) line(`instalar ${pid}`, false, 'instalación falló');
}

// ---------------------------------------------------------------- 1) /auth/me
{
  const phone = '+5491122334455';
  const addr = { street: 'Calle Falsa', city: 'CABA', province: 'Buenos Aires', postalCode: '1000', country: 'AR' };
  const p = await api('PATCH', '/auth/me', { token: adminToken, body: { phone, address: addr } });
  check('PATCH /auth/me 200', p.status === 200, JSON.stringify(p.data).slice(0, 160));
  const g = await api('GET', '/auth/me', { token: adminToken });
  check('GET /auth/me devuelve phone', g.data?.user?.phone === phone, JSON.stringify(g.data).slice(0, 160));
  check('GET /auth/me devuelve address.street', g.data?.user?.address?.street === 'Calle Falsa');

  // clave desconocida descartada
  const u = await api('PATCH', '/auth/me', { token: adminToken, body: { address: { street: 'X', city: 'Y', unknownKey: 'ZZZ', otra: 42 } } });
  check('PATCH address clave desconocida 200', u.status === 200);
  const g2 = await api('GET', '/auth/me', { token: adminToken });
  check('clave desconocida descartada', g2.data?.user?.address?.unknownKey === undefined && g2.data?.user?.address?.otra === undefined,
    JSON.stringify(g2.data?.user?.address));

  // address array -> rechazado (400, documentado: el array se rechaza y el address previo queda intacto)
  const arr = await api('PATCH', '/auth/me', { token: adminToken, body: { address: ['no', 'objeto'] } });
  const g3 = await api('GET', '/auth/me', { token: adminToken });
  info('address array', `status=${arr.status} address=${JSON.stringify(g3.data?.user?.address)} (400 rechaza, previo intacto)`);
  check('address array -> 400 (documentado)', arr.status === 400);

  // address gigante -> truncado a 200 (o 400, documentar)
  const giant = 'a'.repeat(500);
  const gg = await api('PATCH', '/auth/me', { token: adminToken, body: { address: { street: giant } } });
  const g4 = await api('GET', '/auth/me', { token: adminToken });
  const storedLen = g4.data?.user?.address?.street?.length;
  info('address gigante', `status=${gg.status} len=${storedLen}`);
  check('address gigante no rompe (200 truncado o 400)', gg.status === 200 || gg.status === 400,
    `status=${gg.status} len=${storedLen}`);

  // profile > 8 KB -> 400
  const bigProfile = { bio: 'x'.repeat(9000) };
  const bp = await api('PATCH', '/auth/me', { token: adminToken, body: { profile: bigProfile } });
  check('profile > 8KB -> 400', bp.status === 400, `status=${bp.status} ${JSON.stringify(bp.data).slice(0, 160)}`);
}

// ---------------------------------------------------------------- 2) usuarios + aislamiento
let tokenA, tokenB, userAId, userBId, orderAId, orderBId;
{
  const ea = `qa-a-${ts}@test.com`;
  const eb = `qa-b-${ts}@test.com`;
  const ca = await api('POST', '/users', { token: adminToken, body: { email: ea, password: 'Passw0rd123', displayName: 'QA A', username: `qaa${ts}` } });
  const cb = await api('POST', '/users', { token: adminToken, body: { email: eb, password: 'Passw0rd123', displayName: 'QA B', username: `qab${ts}` } });
  check('crear usuario A 201', ca.status === 201, JSON.stringify(ca.data).slice(0, 160));
  check('crear usuario B 201', cb.status === 201, JSON.stringify(cb.data).slice(0, 160));
  userAId = ca.data?.id ?? ca.data?.user?.id;
  userBId = cb.data?.id ?? cb.data?.user?.id;

  const la = await login(ea, 'Passw0rd123');
  const lb = await login(eb, 'Passw0rd123');
  check('login usuario A 200', la.status === 200);
  check('login usuario B 200', lb.status === 200, `status=${lb.status} ${JSON.stringify(lb.data).slice(0, 160)}`);
  tokenA = la.data?.accessToken;
  tokenB = lb.data?.accessToken;

  // orden por cada uno (POST /blocks/ecommerce/orders es público, con token setea userId)
  const oa = await api('POST', '/blocks/ecommerce/orders', { token: tokenA, body: { items: [{ id: 'qa-prod-a', qty: 1 }], shippingCost: 0 } });
  const ob = await api('POST', '/blocks/ecommerce/orders', { token: tokenB, body: { items: [{ id: 'qa-prod-b', qty: 2 }], shippingCost: 0 } });
  check('orden A 200', oa.status === 200, JSON.stringify(oa.data).slice(0, 160));
  check('orden B 200', ob.status === 200, JSON.stringify(ob.data).slice(0, 160));
  orderAId = oa.data?.id;
  orderBId = ob.data?.id;
  check('orden A userId seteado', oa.data?.userId === userAId, `userId=${oa.data?.userId} userAId=${userAId}`);

  // GET /my-orders de A: sólo la suya (o 403 si no tiene membership)
  const ma = await api('GET', '/blocks/ecommerce/my-orders', { token: tokenA });
  info('GET /my-orders (A)', `status=${ma.status}`);
  if (ma.status === 403) {
    hallazgo('usuario nuevo sin membership -> 403 en /my-orders',
      `lib/tenant.ts:180-184 requireTenant + users/service.ts:41-76 createUser sin membership. body=${JSON.stringify(ma.data).slice(0, 120)}`);
  } else if (ma.status === 200) {
    const arr = Array.isArray(ma.data) ? ma.data : (ma.data?.orders ?? []);
    const ids = arr.map(o => o.id);
    const own = ids.includes(orderAId);
    const leak = ids.includes(orderBId);
    check('/my-orders A devuelve SOLO la suya', own && !leak, `ids=${JSON.stringify(ids)}`);
  } else {
    check('/my-orders A 200', false, `status=${ma.status} ${JSON.stringify(ma.data).slice(0, 120)}`);
  }

  // admin GET /orders ve todas
  const all = await api('GET', '/blocks/ecommerce/orders', { token: adminToken });
  const allArr = Array.isArray(all.data) ? all.data : (all.data?.orders ?? []);
  const allIds = allArr.map(o => o.id);
  check('admin GET /orders ve las 2 órdenes', all.status === 200 && allIds.includes(orderAId) && allIds.includes(orderBId),
    `status=${all.status} ids=${JSON.stringify(allIds)}`);
}

// ---------------------------------------------------------------- 3) pago aprobado simulado
let paymentId, orderPayId;
{
  // asegurar proveedor mercadopago instalado
  const inst = await api('POST', '/plugins/install', { token: adminToken, body: { id: 'mercadopago' } });
  info('instalar mercadopago', `status=${inst.status} ${JSON.stringify(inst.data).slice(0, 120)}`);

  const o = await api('POST', '/blocks/ecommerce/orders', { token: adminToken, body: { items: [{ id: 'qa-prod-pay', qty: 1 }], shippingCost: 0 } });
  check('orden pago 200', o.status === 200);
  orderPayId = o.data?.id;

  const co = await api('POST', '/payments/checkout', { token: adminToken, body: { provider: 'mercadopago', amount: 1000, currency: 'ARS', orderId: orderPayId } });
  check('checkout 201', co.status === 201, JSON.stringify(co.data).slice(0, 200));
  paymentId = co.data?.id;

  const mp = await api('POST', `/payments/${paymentId}/mark-paid`, { token: adminToken });
  check('mark-paid 200', mp.status === 200, JSON.stringify(mp.data).slice(0, 200));

  // repetir mark-paid -> idempotente (no duplica)
  const mp2 = await api('POST', `/payments/${paymentId}/mark-paid`, { token: adminToken });
  check('mark-paid repetido idempotente', mp2.status === 200 && (mp2.data?.ok === false || mp2.data?.alreadyApproved === true || mp2.data?.status === 'approved'),
    `status=${mp2.status} ${JSON.stringify(mp2.data).slice(0, 160)}`);

  const orderAfter = await api('GET', `/blocks/ecommerce/my-orders`, { token: adminToken });
  const oArr = Array.isArray(orderAfter.data) ? orderAfter.data : (orderAfter.data?.orders ?? []);
  const found = oArr.find(o => o.id === orderPayId);
  check('orden -> paid', found?.status === 'paid', `status=${found?.status}`);
  check('my-orders trae payment.metadata', found?.payment?.metadata !== undefined,
    `payment.metadata=${JSON.stringify(found?.payment?.metadata)}`);

  const pay = await api('GET', `/payments/${paymentId}`, { token: adminToken });
  check('payment.orderId seteado', pay.data?.orderId === orderPayId, JSON.stringify(pay.data).slice(0, 200));
}

// ---------------------------------------------------------------- 4) blog
let publishedSlug, publishedId, draftSlug, postIds = [];
{
  const t1 = `Café con Acentos ${ts}`;
  const expectedSlug = `cafe-con-acentos-${ts}`;
  const p1 = await api('POST', '/blocks/blog/posts', { token: adminToken, body: { title: t1, body: '<p>Hola</p>', status: 'published' } });
  check('post acentos 200', p1.status === 200 || p1.status === 201, JSON.stringify(p1.data).slice(0, 160));
  publishedSlug = p1.data?.slug;
  publishedId = p1.data?.id;
  check('slug normalizado (cafe-con-acentos-<ts>)', publishedSlug === expectedSlug, `slug=${publishedSlug} esperado=${expectedSlug}`);

  const p2 = await api('POST', '/blocks/blog/posts', { token: adminToken, body: { title: t1, body: '<p>Duplicado</p>', status: 'published' } });
  check('duplicado -> sufijo', p2.data?.slug === `${expectedSlug}-2`, `slug=${p2.data?.slug}`);
  postIds.push(p1.data?.id, p2.data?.id);

  // público
  const pub = await api('GET', `/blocks/blog/posts/${publishedSlug}`);
  check('GET /posts/:slug público 200', pub.status === 200, `slug=${publishedSlug}`);

  // draft -> 404
  const dr = await api('POST', '/blocks/blog/posts', { token: adminToken, body: { title: 'Draft Secreto', body: '<p>x</p>', status: 'draft' } });
  draftSlug = dr.data?.slug;
  const dg = await api('GET', `/blocks/blog/posts/${draftSlug}`);
  check('draft -> 404 público', dg.status === 404, `slug=${draftSlug} status=${dg.status}`);
  postIds.push(dr.data?.id);

  // paginación
  const pg = await api('GET', '/blocks/blog/posts?limit=2&offset=0');
  const items = pg.data?.items ?? pg.data;
  check('paginación items<=2', pg.status === 200 && Array.isArray(items) && items.length <= 2, `items=${items.length}`);
  check('paginación total presente', typeof pg.data?.total === 'number' && pg.data.total >= 1, `total=${pg.data?.total}`);

  // sin params -> array plano
  const flat = await api('GET', '/blocks/blog/posts');
  check('GET /posts sin params -> array plano', Array.isArray(flat.data), `isArray=${Array.isArray(flat.data)}`);

  // comentarios: via `body` (XSS sin sanitizar) + via `content`
  const cm = await api('POST', `/blocks/blog/posts/${publishedSlug}/comments`, { token: adminToken, body: { body: '<script>alert(1)</script> Hola comentario', rating: 5 } });
  check('POST comentario (body) 200/201', cm.status === 200 || cm.status === 201, JSON.stringify(cm.data).slice(0, 160));
  const cm2 = await api('POST', `/blocks/blog/posts/${publishedSlug}/comments`, { token: adminToken, body: { content: 'Comentario vía content', rating: 4 } });
  check('POST comentario (content) 200/201', cm2.status === 200 || cm2.status === 201, JSON.stringify(cm2.data).slice(0, 160));
  const cg = await api('GET', `/blocks/blog/posts/${publishedSlug}/comments`);
  const comments = cg.data?.comments ?? cg.data ?? [];
  const rawC = comments.find(c => String(c.body ?? c.content ?? '').includes('<script>'));
  const servedRaw = !!rawC;
  check('GET comentarios devuelve el comentario', cg.status === 200 && comments.length >= 1);
  if (servedRaw) {
    hallazgo('XSS: comentario <script> guardado/servido RAW (sin sanitizar)',
      `plugins/blog/src/server.ts:218-252. body=${String(rawC.body ?? rawC.content).slice(0, 80)}`);
  } else {
    info('comentario <script>', `no persistió <script> en ninguno de ${comments.length} comentarios`);
  }

  // by-id
  const byId = await api('GET', `/blocks/blog/posts/by-id/${publishedId}`);
  check('GET /posts/by-id/:id 200', byId.status === 200 && byId.data?.id === publishedId, `status=${byId.status}`);

  // POST body con <script> -> saneado al leer (cleanPostBody)
  const xssPost = await api('POST', '/blocks/blog/posts', { token: adminToken, body: { title: `XSS Post ${ts}`, body: '<p>ok</p><script>alert(1)</script>', status: 'published' } });
  check('POST body <script> 200', xssPost.status === 200 || xssPost.status === 201, JSON.stringify(xssPost.data).slice(0, 160));
  if (xssPost.data?.id) {
    const xr = await api('GET', `/blocks/blog/posts/by-id/${xssPost.data.id}`);
    const xbody = xr.data?.body ?? '';
    check('body <script> NO persiste (saneado)', !String(xbody).includes('<script>'), `body=${String(xbody).slice(0, 100)}`);
    postIds.push(xssPost.data?.id);
  }

  // usuario sin content.write -> 403 al crear post
  const ec = `qa-nocw-${ts}@test.com`;
  const cc = await api('POST', '/users', { token: adminToken, body: { email: ec, password: 'Passw0rd123', displayName: 'No CW', username: `qac${ts}`, roles: ['user'] } });
  const lc = await api('POST', '/auth/login', { body: { identifier: ec, password: 'Passw0rd123' } });
  if (lc.data?.accessToken) {
    const pc = await api('POST', '/blocks/blog/posts', { token: lc.data.accessToken, body: { title: 'Sin permiso', body: '<p>x</p>' } });
    check('usuario sin content.write -> 403', pc.status === 403, `status=${pc.status} ${JSON.stringify(pc.data).slice(0, 160)}`);
  } else {
    info('usuario sin content.write', `login status=${lc.status} ${JSON.stringify(lc.data).slice(0, 120)}`);
  }
}

// ---------------------------------------------------------------- 5) licencias
{
  // 5a) pago con metadata.kind='license' -> LicenseKey emitida UNA vez (por paymentId)
  const o = await api('POST', '/blocks/ecommerce/orders', { token: adminToken, body: { items: [{ id: 'qa-prod-lic', qty: 1 }], shippingCost: 0 } });
  const orderId = o.data?.id;
  const co = await api('POST', '/payments/checkout', { token: adminToken, body: { provider: 'mercadopago', amount: 500, currency: 'ARS', orderId, metadata: { kind: 'license', fingerprint: FP1 } } });
  const pid = co.data?.id;
  check('checkout licencia 201', co.status === 201, JSON.stringify(co.data).slice(0, 200));
  const mp = await api('POST', `/payments/${pid}/mark-paid`, { token: adminToken });
  check('mark-paid licencia 200', mp.status === 200);

  const keys = await api('GET', '/license/keys', { token: adminToken });
  const keyArr = Array.isArray(keys.data) ? keys.data : (keys.data?.keys ?? []);
  const emitted = keyArr.find(k => k.fingerprint === FP1);
  if (emitted) {
    check('LicenseKey emitida por pago', true, `id=${emitted.id}`);
  } else {
    hallazgo('license por pago NO emite LicenseKey (bug: emit dropea metadata/organizationId)',
      `payments/routes.ts:256-258 y :340-342 emiten {payment:{id,transactionId,amount,currency,orderId}} sin metadata ni organizationId; licenses/index.ts:21-86 lee payment.metadata + payment.organizationId -> nunca presentes. keys=${keyArr.length}`);
  }

  // my-keys (comprador) — el pago con metadata.kind='license' debería exponer la clave ahí
  const myKeys = await api('GET', '/license/my-keys', { token: adminToken });
  const mkArr = Array.isArray(myKeys.data) ? myKeys.data : (myKeys.data?.keys ?? []);
  const mkEmitted = mkArr.find(k => k.fingerprint === FP1 || k.activationKey);
  info('GET /license/my-keys', `status=${myKeys.status} count=${mkArr.length}`);
  check('GET /license/my-keys 200', myKeys.status === 200, JSON.stringify(myKeys.data).slice(0, 160));
  if (mkArr.length === 0) {
    hallazgo('GET /license/my-keys vacío (consecuencia del bug de emit sin metadata)',
      'Sin licenseSale por paymentId -> my-keys devuelve [] aunque el pago tenía metadata.kind=license');
  }

  // 5b) emitir clave manualmente (POST /license/keys, emit mode) para testear activate-key
  const emit = await api('POST', '/license/keys', { token: adminToken, body: { productId: 'webs-dev', licensee: 'QA test', fingerprint: FP1, limits: { activations: 1 } } });
  check('POST /license/keys emit 200', emit.status === 200 || emit.status === 201, JSON.stringify(emit.data).slice(0, 200));
  const activationKey = emit.data?.activationKey;
  info('activationKey', `${String(activationKey).slice(0, 20)}... (len=${String(activationKey).length})`);
  check('activationKey presente', !!activationKey);

  if (activationKey) {
    const a1 = await api('POST', '/license/activate-key', { body: { activationKey, fingerprint: FP1 } });
    check('activate-key mismo fp -> ok', a1.status === 200 && a1.data?.ok === true, `status=${a1.status} ${JSON.stringify(a1.data).slice(0, 160)}`);

    const a2 = await api('POST', '/license/activate-key', { body: { activationKey, fingerprint: FP1 } });
    check('activate-key mismo fp -> alreadyActive', a2.data?.alreadyActive === true, `status=${a2.status} ${JSON.stringify(a2.data).slice(0, 160)}`);
    check('activate-key response lleva activationsUsed', typeof a2.data?.activationsUsed === 'number', JSON.stringify(a2.data).slice(0, 160));

    const a3 = await api('POST', '/license/activate-key', { body: { activationKey, fingerprint: FP2 } });
    info('activate-key otro fingerprint', `status=${a3.status} ${JSON.stringify(a3.data).slice(0, 200)}`);
    check('activate-key otro fp -> 409 (o 400 por clave node-locked)', a3.status === 409 || a3.status === 400, `status=${a3.status}`);

    const a4 = await api('POST', '/license/activate-key', { body: { activationKey: 'garbage-invalid', fingerprint: 'x' } });
    check('activate-key clave inválida -> 400', a4.status === 400, `status=${a4.status} ${JSON.stringify(a4.data).slice(0, 160)}`);
    info('404 clave inexistente (code-verified)', 'licenses/keys.ts:310-315 findUnique miss -> 404; no reproducible desde script sin firma válida');
  }
}

// ---------------------------------------------------------------- 6) menú / dashboard (regresión)
{
  const menu = await api('GET', '/menu', { token: adminToken });
  check('GET /menu 200 (admin)', menu.status === 200, JSON.stringify(menu.data).slice(0, 160));
  const items = menu.data?.items ?? menu.data ?? [];
  const rawDashboard = JSON.stringify(items).includes('dashboard.');
  check('menú sin claves dashboard.* crudas', !rawDashboard, `items=${items.length} rawDashboard=${rawDashboard}`);
}

// ---------------------------------------------------------------- resumen
console.log(`\n=== RESULTADO: ${failures} FALLA, ${findings} HALLAZGO ===`);
process.exitCode = failures > 0 ? 1 : 0;
