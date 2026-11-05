#!/usr/bin/env node
/**
 * Firma el artefacto de release de Webs (ADR-0010 / ADR-0026).
 *
 * Uso (en GitHub Actions, con la privada como secreto):
 *   UPDATE_PRIVATE_KEY="$(cat update_private.pem)" \
 *     node scripts/sign-release.mjs webs-2.11.0.tar.gz
 *
 * Produce:
 *   <tarball>.sha256 → sha256 hex del tarball (ASCII).
 *   <tarball>.sig    → firma Ed25519 (base64url) sobre el digest hex (UTF-8).
 *
 * El mensaje firmado es el DIGEST hex (no el artefacto), igual que verifica
 * apps/api/src/modules/update/verify.ts (`verifyEd25519(digest, sig, pub)`).
 * La clave privada es Ed25519 PKCS#8 PEM y NUNCA se commitea: se carga como
 * secreto de GitHub Actions `UPDATE_PRIVATE_KEY`.
 */
import { createHash, createPrivateKey, sign as nodeSign } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';

const tarball = process.argv[2];
if (!tarball) {
  console.error('Uso: node scripts/sign-release.mjs <webs-X.Y.Z.tar.gz>');
  process.exit(1);
}

const privateKeyPem = process.env.UPDATE_PRIVATE_KEY;
if (!privateKeyPem) {
  console.error('Falta UPDATE_PRIVATE_KEY (clave privada Ed25519 PKCS#8 PEM).');
  process.exit(1);
}

const artifact = readFileSync(tarball);
const digest = createHash('sha256').update(artifact).digest('hex');
const privateKey = createPrivateKey(privateKeyPem);
const signature = nodeSign(null, Buffer.from(digest, 'utf8'), privateKey).toString('base64url');

writeFileSync(`${tarball}.sha256`, `${digest}\n`);
writeFileSync(`${tarball}.sig`, `${signature}\n`);

console.log(`sha256 ${digest}`);
console.log(`firma  ${signature}`);
console.log(`ok     ${tarball}.sha256 y ${tarball}.sig`);
