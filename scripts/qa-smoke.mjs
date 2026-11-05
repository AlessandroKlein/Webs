// QA smoke E2E (task-10 round 2): barcode/sku search + sanitizado de attributes.
// Uso: node scripts/qa-smoke.mjs   (Node >= 22 con fetch global)
const API = process.env.WEBS_API ?? 'http://localhost:4000';
const WEB = process.env.WEBS_WEB ?? 'http://localhost:5173';
const EMAIL = process.env.WEBS_EMAIL ?? 'admin@webs.test';
const PASSWORD = process.env.WEBS_PASSWORD ?? 'Admin12345!';
const stamp = Date.now();
const SKU = `QA-${stamp}`;
const BARCODE = `779${String(stamp).slice(-10)}`;

const results = [];
const check = (name, ok, detail) => {
  results.push({ name, ok });
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}  ${detail}`);
};
const j = async (r) => {
  const txt = await r.text();
  let data = null;
  try { data = JSON.parse(txt); } catch { data = txt.slice(0, 200); }
  return { status: r.status, data };
};
const post = async (path, body, auth) =>
  j(await fetch(`${API}${path}`, { method: 'POST', headers: auth, body: JSON.stringify(body) }));
const get = async (path, auth) => j(await fetch(`${API}${path}`, { headers: auth }));

async function main() {
  const h = await j(await fetch(`${API}/health`));
  check('health', h.status === 200, `HTTP ${h.status}`);

  const login = await j(await fetch(`${API}/api/v1/auth/login`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ identifier: EMAIL, password: PASSWORD }),
  }));
  const token = login.data?.accessToken;
  check('login', login.status === 200 && !!token, `HTTP ${login.status} user=${login.data?.user?.email}`);
  const auth = { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` };

  // 1. Crear producto con attributes (strings) + barcode + sku
  const base = { title: `Prueba QA ${stamp}`, price: 1000, sku: SKU, barcode: BARCODE, stock: 5, attributes: { color: 'rojo', vencimiento: '2026-12-01' } };
  const create = await post('/api/v1/inventory/products', base, auth);
  check('POST attributes string', create.status === 200, `HTTP ${create.status} attributes=${JSON.stringify(create.data?.variants?.[0]?.attributes)}`);

  // 2. Búsqueda por barcode y por sku (antes daba 0)
  const byBarcode = await get(`/api/v1/inventory/products?search=${BARCODE}`, auth);
  const byBarcodeHit = Array.isArray(byBarcode.data) && byBarcode.data.some((p) => p.variants?.some((v) => v.barcode === BARCODE));
  check('search barcode', byBarcode.status === 200 && byBarcodeHit, `HTTP ${byBarcode.status} count=${Array.isArray(byBarcode.data) ? byBarcode.data.length : 'n/a'}`);

  const bySku = await get(`/api/v1/inventory/products?search=${SKU}`, auth);
  const bySkuHit = Array.isArray(bySku.data) && bySku.data.some((p) => p.variants?.some((v) => v.sku === SKU));
  check('search sku', bySku.status === 200 && bySkuHit, `HTTP ${bySku.status} count=${Array.isArray(bySku.data) ? bySku.data.length : 'n/a'}`);

  // 3. Sanitizado: anidado → 400, array → 400
  const nested = await post('/api/v1/inventory/products', { ...base, sku: `${SKU}-n`, barcode: `${BARCODE}-n`, attributes: { a: { b: 'c' } } }, auth);
  check('POST attributes anidado → 400', nested.status === 400, `HTTP ${nested.status} msg=${nested.data?.error?.message ?? nested.data?.message ?? ''}`);

  const arr = await post('/api/v1/inventory/products', { ...base, sku: `${SKU}-a`, barcode: `${BARCODE}-a`, attributes: ['rojo'] }, auth);
  check('POST attributes array → 400', arr.status === 400, `HTTP ${arr.status} msg=${arr.data?.error?.message ?? arr.data?.message ?? ''}`);

  // 4. number/boolean → 200 persistido como strings
  const nb = await post('/api/v1/inventory/products', { ...base, sku: `${SKU}-nb`, barcode: `${BARCODE}-nb`, attributes: { cantidad: 10, activo: false } }, auth);
  const nbAttr = nb.data?.variants?.[0]?.attributes;
  const nbOk = nb.status === 200 && nbAttr?.cantidad === '10' && nbAttr?.activo === 'false';
  check('POST attributes number/boolean → strings', nbOk, `HTTP ${nb.status} attributes=${JSON.stringify(nbAttr)}`);

  // 5. sin attributes → 200 con {}
  const { attributes: _omit, ...noAttr } = base;
  const none = await post('/api/v1/inventory/products', { ...noAttr, sku: `${SKU}-e`, barcode: `${BARCODE}-e` }, auth);
  const noneAttr = none.data?.variants?.[0]?.attributes;
  const noneOk = none.status === 200 && noneAttr && Object.keys(noneAttr).length === 0;
  check('POST sin attributes → {}', noneOk, `HTTP ${none.status} attributes=${JSON.stringify(noneAttr)}`);

  // 6. Duplicado de SKU → 409
  const dup = await post('/api/v1/inventory/products', { ...base, title: 'Prueba QA dup' }, auth);
  check('POST SKU duplicado → 409', dup.status === 409, `HTTP ${dup.status} msg=${dup.data?.error?.message ?? ''}`);

  // 7. Web
  const web = await fetch(`${WEB}/`);
  check('web /', web.status === 200, `HTTP ${web.status}`);

  const fails = results.filter((r) => !r.ok).length;
  console.log(`\n${results.length - fails}/${results.length} PASS  SKU=${SKU} BARCODE=${BARCODE}`);
  process.exit(fails ? 1 : 0);
}

main().catch((e) => { console.error('ERROR', e); process.exit(1); });
