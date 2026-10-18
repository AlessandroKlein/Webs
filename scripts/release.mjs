#!/usr/bin/env node
/**
 * Helper para preparar un release semver.
 *
 * Uso: `node scripts/release.mjs [major|minor|patch]`
 * Imprime el próximo tag y los comandos git sugeridos.
 */
import { execSync } from 'node:child_process';

const type = process.argv[2] ?? 'patch';
if (!['major', 'minor', 'patch'].includes(type)) {
  console.error('Uso: node scripts/release.mjs [major|minor|patch]');
  process.exit(1);
}

let current = '0.0.0';
try {
  current = execSync('git describe --tags --abbrev=0', { encoding: 'utf8' }).trim().replace(/^v/, '');
} catch {
  /* sin tags todavía */
}

const [major, minor, patch] = current.split('.').map((n) => Number(n) || 0);
const next = {
  major: `${major + 1}.0.0`,
  minor: `${major}.${minor + 1}.0`,
  patch: `${major}.${minor}.${patch + 1}`,
}[type];

console.log(`Versión actual : v${current}`);
console.log(`Próximo release: v${next} (${type})`);
console.log('');
console.log('Comandos:');
console.log(`  git tag -a v${next} -m "Release v${next}"`);
console.log(`  git push origin v${next}`);
console.log('');
console.log('Recordá actualizar el CHANGELOG antes de etiquetar.');
