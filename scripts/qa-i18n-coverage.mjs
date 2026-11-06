#!/usr/bin/env node
/**
 * qa-i18n-coverage.mjs — QA: texto JSX hardcodeado + paridad de claves i18n.
 * Sin dependencias. Ejecutable en CI: `node scripts/qa-i18n-coverage.mjs`.
 *
 * Detecta en `apps/web/src/**\/*.tsx`:
 *   1. Texto visible hardcodeado entre tags JSX (`>Texto<`).
 *   2. Literales en atributos visibles: placeholder / title / aria-label / alt.
 * Ignora comentarios JS, contenido `<code>`, y un whitelist de nombres propios.
 *
 * Además compara las claves de `packages/i18n/src/locales/{es,en,pt}.ts`.
 * Salida: exit 1 si hay texto hardcodeado o si hay desparidad de claves.
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

const ROOT = process.cwd();
const WEB_SRC = join(ROOT, 'apps', 'web', 'src');
const LOCALES = ['es', 'en', 'pt'].map((l) => join(ROOT, 'packages', 'i18n', 'src', 'locales', `${l}.ts`));

// Nombres propios / strings técnicos legítimos que no son texto a traducir.
const WHITELIST = new Set([
  'Webs', 'GitHub', 'Google', 'API', 'REST', 'JSON', 'SQL', 'MySQL', 'PostgreSQL',
  'Redis', 'Docker', 'Node', 'React', 'TypeScript', 'JavaScript', 'Tailwind', 'URL',
  'HTTP', 'HTTPS', 'OK', 'ID', 'IDS', 'UI', 'UX', 'CSV', 'XML', 'PDF', 'SMS', 'SEO',
  // Ejemplos de datos / nombres propios / valores técnicos (placeholders legítimos).
  'https://…', 'https://…, https://…', 'https://…/logo.png', 'https://… (o URL)', 'http://192.168.1.50',
  'smtp.tudominio.com', 'no-reply@tudominio.com', 'email@ejemplo.com',
  'Av. Corrientes', 'Buenos Aires', 'Argentina',
  'Juan', 'Pérez', 'Nombre visible', 'usuario',
  'S, M, L', '250m', '1000m', '128Mi', '1Gi',
  'sucursal-norte', 'mi-org', 'contacto', 'webs', 'editor', 'pending', 'es', 'UUID del QR',
  'App móvil, integración…', 'user.create, …', 'user, content, …', 'Rutina de pecho',
  'bienvenida', 'Bienvenido, {{ user.name }}', 'site.name, user.name, user.email',
  '<h1>Hola</h1>', 'user, editor', 'Opción 1, Opción 2', 'nav.home, common.save…', 'fr, de, it…',
  'Español', 'English', 'Português',
  '/social', 'readLS',
]);

let exitCode = 0;
const findings = []; // { file, line, text, kind }

function walk(dir, out = []) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) walk(full, out);
    else if (entry.name.endsWith('.tsx')) out.push(full);
  }
  return out;
}

function stripComments(src) {
  // Máquina de estados: solo pisa comentarios `//` y `/* */` FUERA de literales
  // de string ("…", '…', `…`). Sin esto, los `//` de URLs (`placeholder="https://…"`)
  // se comían el resto de la línea y generaban falsos positivos. Conserva `\n`.
  let out = '';
  let i = 0;
  const n = src.length;
  while (i < n) {
    const c = src[i];
    const next = src[i + 1];
    if (c === '"' || c === "'" || c === '`') {
      const quote = c;
      out += c;
      i++;
      while (i < n) {
        const d = src[i];
        out += d;
        if (d === '\\') { if (i + 1 < n) { out += src[i + 1]; i += 2; continue; } }
        if (d === quote) { i++; break; }
        i++;
      }
      continue;
    }
    if (c === '/' && next === '/') {
      while (i < n && src[i] !== '\n') { out += ' '; i++; }
      continue;
    }
    if (c === '/' && next === '*') {
      out += '  ';
      i += 2;
      while (i < n && !(src[i] === '*' && src[i + 1] === '/')) {
        out += src[i] === '\n' ? '\n' : ' ';
        i++;
      }
      if (i < n) { out += '  '; i += 2; }
      continue;
    }
    out += c;
    i++;
  }
  return out;
}

function isWhitelisted(text) {
  const t = text.trim();
  if (!t) return true;
  if (!/[A-Za-zÁÉÍÓÚáéíóúÑñ]/.test(t)) return true; // sin letras
  if (/^[0-9%$€£¥.,:;\/\-+*\s]+$/.test(t)) return true; // solo números/símbolos
  // Nombres propios sueltos o cadenas que son mayormente mayúsculas/acrónimos.
  if (WHITELIST.has(t)) return true;
  if (/^[A-Z0-9][A-Z0-9_.-]{0,30}$/.test(t)) return true; // acrónimos/constantes
  return false;
}

// Descarta fragmentos de código JS capturados entre tags JSX (ternarios,
// operadores, accesos a propiedades) para no reportar falsos positivos.
function looksLikeCode(text) {
  if (/=>|\?\?|===|!==|<=|>=|\btypeof\b|\binstanceof\b|\breturn\b|\bconst\b|\blet\b/.test(text)) return true;
  if (/\.[A-Za-z_$]/.test(text)) return true; // api.get, .length, .map, .phase
  if (/[;{}()\[\]=]/.test(text)) return true; // paréntesis, llaves, corchetes, asignación
  if (/^[)}\],.:;=+*&|]/.test(text)) return true; // empieza con puntuación de código
  if (/\s:\s|\s\?\s/.test(text)) return true; // operador ternario ` ? : `
  return false;
}

function scanFile(file) {
  const src = stripComments(readFileSync(file, 'utf8'));
  const rel = relative(ROOT, file);
  const lines = src.split('\n');

  // Fuera de <code>…</code> y de los valores de atributos visibles (que ya escanea
  // attrRe aparte) para no marcar falsos positivos como el texto dentro de
  // placeholder="<h1>Hola</h1>" (el `>Hola<` se confundía con texto visible).
  const withoutCode = src
    .replace(/<code\b[^>]*>[\s\S]*?<\/code>/g, (m) => m.replace(/[^\n]/g, ' '))
    .replace(/\b(placeholder|title|aria-label|alt)=["'][^"']*["']/g, (m) => m.replace(/[^\n]/g, ' '));

  const seen = new Set();
  // 1) Texto entre tags: >algo<
  const textRe = />([^<>{}]+)</g;
  for (const m of withoutCode.matchAll(textRe)) {
    const text = m[1].trim();
    if (!text || isWhitelisted(text) || looksLikeCode(text)) continue;
    const line = src.slice(0, m.index).split('\n').length;
    const key = `${rel}:${line}:${text}`;
    if (!seen.has(key)) {
      seen.add(key);
      findings.push({ file: rel, line, text, kind: 'texto' });
    }
  }
  // 2) Atributos visibles con literal
  const attrRe = /\b(placeholder|title|aria-label|alt)=["']([^"']{2,})["']/g;
  for (const m of src.matchAll(attrRe)) {
    const attr = m[1];
    const text = m[2].trim();
    if (!text || isWhitelisted(text)) continue;
    const line = src.slice(0, m.index).split('\n').length;
    const key = `${rel}:${line}:${attr}:${text}`;
    if (!seen.has(key)) {
      seen.add(key);
      findings.push({ file: rel, line, text: `${attr}="${text}"`, kind: 'atributo' });
    }
  }
}

// ---- Escaneo TSX ----
for (const file of walk(WEB_SRC)) scanFile(file);

if (findings.length) {
  exitCode = 1;
  console.log(`\n[qa-i18n-coverage] ${findings.length} string(s) hardcodeadas detectadas:`);
  const byFile = new Map();
  for (const f of findings) {
    if (!byFile.has(f.file)) byFile.set(f.file, []);
    byFile.get(f.file).push(`${f.line}: [${f.kind}] ${f.text.slice(0, 80)}`);
  }
  for (const [file, items] of byFile) {
    console.log(`  ${file}`);
    for (const it of items.slice(0, 20)) console.log(`    ${it}`);
    if (items.length > 20) console.log(`    … y ${items.length - 20} más`);
  }
} else {
  console.log('[qa-i18n-coverage] sin texto JSX hardcodeado.');
}

// ---- Paridad de claves i18n ----
function extractKeys(file) {
  const src = readFileSync(file, 'utf8');
  const keys = new Set();
  for (const m of src.matchAll(/['"]([^'"]+)['"]\s*:/g)) keys.add(m[1]);
  return keys;
}
const [es, en, pt] = LOCALES.map(extractKeys);
const missingIn = (base, other, label) => [...base].filter((k) => !other.has(k)).map((k) => `${label} falta '${k}'`);
const gaps = [
  ...missingIn(es, en, 'en'),
  ...missingIn(es, pt, 'pt'),
  ...missingIn(en, es, 'es'),
  ...missingIn(pt, es, 'es'),
];
if (gaps.length) {
  exitCode = 1;
  console.log(`\n[qa-i18n-coverage] desparidad de claves (${gaps.length}):`);
  for (const g of gaps.slice(0, 50)) console.log(`  ${g}`);
  if (gaps.length > 50) console.log(`  … y ${gaps.length - 50} más`);
} else {
  console.log(`[qa-i18n-coverage] claves i18n en paridad (es=${es.size}, en=${en.size}, pt=${pt.size}).`);
}

process.exit(exitCode);
