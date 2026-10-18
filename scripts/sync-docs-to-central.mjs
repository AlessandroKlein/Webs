#!/usr/bin/env node
/**
 * Sincroniza la documentación de Webs (Webs/docs/) al repositorio central de
 * documentación Docs (repositorio hermano `../Docs`), dentro de `docs/es/webs/`.
 *
 * - Copia el árbol de docs y renombra README.md → index.md (índice de MkDocs).
 * - Convierte los enlaces a archivos de código (`../../...`) a URLs de GitHub,
 *   dejando intactos los enlaces doc→doc (que ya son relativos correctos).
 *
 * Uso: node scripts/sync-docs-to-central.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const websRoot = path.resolve(__dirname, '..');
const websDocs = path.join(websRoot, 'docs');
const docsRepo = path.resolve(websRoot, '../Docs');
const destRoot = path.join(docsRepo, 'docs', 'es', 'webs');
const GITHUB = 'https://github.com/AlessandroKlein/Webs';

if (!fs.existsSync(docsRepo)) {
  console.error(`No se encontró el repo Docs en ${docsRepo}`);
  process.exit(1);
}

// 1. Copiar el árbol de docs.
fs.rmSync(destRoot, { recursive: true, force: true });
fs.cpSync(websDocs, destRoot, { recursive: true });

// 2. Renombrar el índice.
const readme = path.join(destRoot, 'README.md');
if (fs.existsSync(readme)) fs.renameSync(readme, path.join(destRoot, 'index.md'));

// 3. Recorrer y arreglar enlaces.
const mdFiles = [];
(function walk(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(p);
    else if (entry.name.endsWith('.md')) mdFiles.push(p);
  }
})(destRoot);

const LINK_RE = /(\[[^\]]*\]\()([^)\s]+)(\))/g;

for (const file of mdFiles) {
  let content = fs.readFileSync(file, 'utf8');
  const relNew = path.relative(destRoot, file); // ej. 'guides/crear-un-bloque.md'
  const originalDir = path.join(websDocs, path.dirname(relNew));

  content = content.replace(LINK_RE, (match, prefix, href, suffix) => {
    if (/^(https?:|mailto:|data:)/i.test(href) || href.startsWith('#')) return match;
    const [base, anchor] = href.split('#');
    if (!base) return match;

    const target = path.resolve(originalDir, base);
    const repoRel = path.relative(websRoot, target);

    // Doc → doc (dentro de Webs/docs): ya es un enlace relativo correcto.
    if (!repoRel.startsWith('..') && !path.isAbsolute(repoRel) && repoRel.startsWith(`docs${path.sep}`)) {
      return match;
    }

    // Archivo de código → URL de GitHub.
    const isDir = fs.existsSync(target) && fs.statSync(target).isDirectory();
    const type = isDir ? 'tree' : 'blob';
    const url = `${GITHUB}/${type}/main/${repoRel.split(path.sep).join('/')}`;
    return `${prefix}${url}${anchor ? `#${anchor}` : ''}${suffix}`;
  });

  fs.writeFileSync(file, content, 'utf8');
}

console.log(`✔ Docs de Webs sincronizados en ${path.relative(websRoot, destRoot)} (${mdFiles.length} archivos)`);
console.log('  Recordá actualizar la sección "Webs" en el nav de mkdocs.yml.');
