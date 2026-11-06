#!/usr/bin/env node
/**
 * qa-crm.mjs — QA: smoke del plugin CRM.
 * Flujo real: contacto → empresa → deal → mover etapa → pipeline → actividad → borrar.
 * + negativos: amount:-5 → 400, expectedCloseAt inválida → 400, GET /contacts?search=ana.
 * Sin dependencias. Sale 1 si algo falla.
 *
 * Rutas reales (plugins/crm/src/server.ts, bajo /api/v1/plugins/crm):
 *   POST /contacts, POST /companies, POST /deals, PATCH /deals/:id (mover etapa),
 *   GET /pipeline, POST /activities. DELETE /contacts|companies|deals|activities/:id.
 */
const API = process.env.API_URL ?? 'http://localhost:4000/api/v1';
const EMAIL = process.env.QA_EMAIL ?? 'admin@webs.test';
const PASSWORD = process.env.QA_PASSWORD ?? 'Admin12345!';
const BASE = `${API}/plugins/crm`;

let exitCode = 0;
let n = 0;
const ok = (m) => { n++; console.log(`  OK  ${m}`); };
const bad = (m) => { n++; console.log(`  BAD ${m}`); exitCode = 1; };

const A = 'qa-crm-' + Date.now();

async function req(method, path, { token, body } = {}) {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: {
      ...(token ? { authorization: `Bearer ${token}` } : {}),
      ...(body ? { 'content-type': 'application/json' } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  let json = null;
  try { json = await res.json(); } catch { /* no body */ }
  return { status: res.status, json };
}

async function main() {
  const login = await fetch(`${API}/auth/login`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ identifier: EMAIL, password: PASSWORD }),
  });
  if (!login.ok) { console.log(`[qa-crm] login falló ${login.status}`); process.exitCode = 1; return; }
  const { accessToken } = await login.json();
  ok(`login ${EMAIL}`);

  // 1. contacto
  const c = await req('POST', '/contacts', { token: accessToken, body: { name: `Ana ${A}`, email: `ana-${A}@qa.test` } });
  const contactId = c.json?.id;
  if (c.status >= 200 && c.status < 300 && contactId) ok(`contacto creado ${contactId}`);
  else bad(`contacto → ${c.status} ${JSON.stringify(c.json)}`);

  // 2. empresa
  const e = await req('POST', '/companies', { token: accessToken, body: { name: `Empresa ${A}` } });
  const companyId = e.json?.id;
  if (e.status >= 200 && e.status < 300 && companyId) ok(`empresa creada ${companyId}`);
  else bad(`empresa → ${e.status} ${JSON.stringify(e.json)}`);

  // 3. deal
  const d = await req('POST', '/deals', { token: accessToken, body: { title: `Deal ${A}`, contactId, companyId, amount: 10000, stage: 'prospecting' } });
  const dealId = d.json?.id;
  if (d.status >= 200 && d.status < 300 && dealId) ok(`deal creado ${dealId} (etapa ${d.json?.stage})`);
  else bad(`deal → ${d.status} ${JSON.stringify(d.json)}`);

  // 4. mover etapa
  if (dealId) {
    const m = await req('PATCH', `/deals/${dealId}`, { token: accessToken, body: { stage: 'qualified' } });
    if (m.status >= 200 && m.status < 300 && m.json?.stage === 'qualified') ok(`etapa movida → ${m.json.stage}`);
    else bad(`mover etapa → ${m.status} ${JSON.stringify(m.json)}`);
  }

  // 5. pipeline (etapa qualified con count >= 1)
  const p = await req('GET', '/pipeline', { token: accessToken });
  const stages = p.json?.stages ?? [];
  const q = stages.find((s) => s.stage === 'qualified');
  if (p.status >= 200 && q && q.count >= 1) ok(`pipeline: qualified count=${q.count}`);
  else bad(`pipeline → ${p.status} ${JSON.stringify(p.json)}`);

  // 6. actividad
  const a = await req('POST', '/activities', { token: accessToken, body: { type: 'task', subject: `Actividad ${A}`, contactId, dealId } });
  const activityId = a.json?.id;
  if (a.status >= 200 && a.status < 300 && activityId) ok(`actividad creada ${activityId}`);
  else bad(`actividad → ${a.status} ${JSON.stringify(a.json)}`);

  // 7. negativos
  const neg1 = await req('POST', '/deals', { token: accessToken, body: { title: 'Neg amount', amount: -5 } });
  if (neg1.status === 400 && /Importe inválido/i.test(neg1.json?.error ?? '')) ok('negativo: amount:-5 → 400 "Importe inválido"');
  else bad(`negativo amount:-5 → ${neg1.status} ${JSON.stringify(neg1.json)}`);

  const neg2 = await req('POST', '/deals', { token: accessToken, body: { title: 'Neg fecha', expectedCloseAt: 'no-es-fecha' } });
  if (neg2.status === 400 && /Fecha de cierre inválida/i.test(neg2.json?.error ?? '')) ok('negativo: expectedCloseAt inválida → 400');
  else bad(`negativo expectedCloseAt → ${neg2.status} ${JSON.stringify(neg2.json)}`);

  // 8. búsqueda
  const s = await req('GET', '/contacts?search=ana', { token: accessToken });
  if (Array.isArray(s.json) && s.json.some((x) => x.id === contactId)) ok('GET /contacts?search=ana devuelve el contacto');
  else bad(`search=ana → ${s.status} ${JSON.stringify(s.json)}`);

  // 9. borrado (inverso: actividad, deal, company, contact)
  for (const [key, id] of [['activity', activityId], ['deal', dealId], ['company', companyId], ['contact', contactId]]) {
    if (!id) continue;
    const path = key === 'activity' ? `/activities/${id}` : key === 'deal' ? `/deals/${id}` : key === 'company' ? `/companies/${id}` : `/contacts/${id}`;
    const del = await req('DELETE', path, { token: accessToken });
    if (del.status >= 200 && del.status < 300) ok(`borrado ${key} ${id}`);
    else bad(`borrado ${key} → ${del.status} ${JSON.stringify(del.json)}`);
  }
  console.log(`[qa-crm] ${exitCode === 0 ? 'PASS' : 'FAIL'} (${n} checks)`);
  process.exitCode = exitCode;
}

main().catch((err) => { console.error('[qa-crm] ERROR', err); process.exitCode = 1; });
