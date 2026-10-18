/**
 * Sincroniza la documentación de Webs al repo Docs y compila el sitio MkDocs
 * en un solo paso.
 *
 *   node scripts/build-docs.mjs [--strict]
 *
 * Variables de entorno opcionales:
 *   DOCS_DIR  ruta al repo Docs (por defecto ../Docs)
 *   PYTHON    ejecutable de Python (por defecto "python")
 */
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const docsDir = process.env.DOCS_DIR
  ? path.resolve(process.env.DOCS_DIR)
  : path.resolve(root, '..', 'Docs');
const python = process.env.PYTHON ?? 'python';
const strict = process.argv.includes('--strict');

if (!fs.existsSync(docsDir)) {
  console.error(`No se encontró el repo Docs en ${docsDir}. Seteá DOCS_DIR.`);
  process.exit(1);
}

// 1) Sincronizar Webs/docs → Docs/docs/es/webs
console.log('→ Sincronizando docs de Webs…');
execFileSync(process.execPath, [path.join(root, 'scripts', 'sync-docs-to-central.mjs')], {
  stdio: 'inherit',
  cwd: root,
});

// 2) Compilar con MkDocs
console.log('→ Compilando sitio MkDocs…');
try {
  execFileSync(python, ['-m', 'mkdocs', 'build', ...(strict ? ['--strict'] : [])], {
    stdio: 'inherit',
    cwd: docsDir,
  });
  console.log('✔ Documentación compilada.');
} catch (err) {
  const e = err as { status?: number };
  console.error('✖ Falló el build de MkDocs. Instalá: pip install mkdocs-material mkdocs-static-i18n');
  process.exit(e.status ?? 1);
}
