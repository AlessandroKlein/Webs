#!/usr/bin/env node
/**
 * Firma el artefacto de release de Webs (ADR-0010 / ADR-0026).
 *
 * Uso (en GitHub Actions, con la privada como secreto):
 *   UPDATE_PRIVATE_KEY="$(cat update_private.pem)" \
 *     node scripts/sign-release.mjs webs-2.11.0.tar.gz
 *
 * Acepta dos formatos de clave privada Ed25519:
 *   - PKCS#8 (`-----BEGIN PRIVATE KEY-----`), el esperado por Node.
 *   - OpenSSH (`-----BEGIN OPENSSH PRIVATE KEY-----`, el que genera
 *     `ssh-keygen -t ed25519`). Node no lo parsea: se convierte a PKCS#8
 *     con `ssh-keygen -p -m PKCS8` en un directorio temporal.
 *
 * Antes de firmar verifica que la pública derivada coincida con
 * `UPDATE_PUBLIC_KEY` (env) o con `deploy/k8s/configmap.yaml`. Firmar con un
 * par distinto produciría artefactos que las instalaciones no pueden verificar.
 *
 * Produce:
 *   <tarball>.sha256 → sha256 hex del tarball (ASCII).
 *   <tarball>.sig    → firma Ed25519 (base64url) sobre el digest hex (UTF-8).
 *
 * El mensaje firmado es el DIGEST hex (no el artefacto), igual que verifica
 * apps/api/src/modules/update/verify.ts (`verifyEd25519(digest, sig, pub)`).
 */
import { createHash, createPrivateKey, createPublicKey, sign as nodeSign } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const tarball = process.argv[2];
if (!tarball) {
  console.error('Uso: node scripts/sign-release.mjs <webs-X.Y.Z.tar.gz>');
  process.exit(1);
}

const rawKey = process.env.UPDATE_PRIVATE_KEY;
if (!rawKey) {
  console.error('Falta UPDATE_PRIVATE_KEY (clave privada Ed25519 PKCS#8 PEM u OpenSSH).');
  process.exit(1);
}

/** Normaliza el secreto: `\n` literales y salto final. */
function normalize(pem) {
  let material = pem.trim();
  if (!material.includes('\n') && material.includes('\\n')) material = material.replace(/\\n/g, '\n');
  return material.endsWith('\n') ? material : `${material}\n`;
}

/** Construye una privada Ed25519 PKCS#8 a partir de la semilla cruda. */
function fromSeed(seed) {
  const bytes = seed.length === 64 ? seed.subarray(0, 32) : seed;
  if (bytes.length !== 32) throw new Error(`semilla Ed25519 de ${bytes.length} bytes (se esperan 32)`);
  const der = Buffer.concat([Buffer.from('302e020100300506032b657004220420', 'hex'), bytes]);
  return createPrivateKey({ key: der, format: 'der', type: 'pkcs8' });
}

/** Acepta la clave sin cabeceras PEM: DER PKCS#8 o semilla en base64/hex. */
function loadWithoutArmor(material) {
  const compact = material.replace(/^["']|["']$/g, '').replace(/\s+/g, '');
  if (/^[0-9a-fA-F]{64}$/.test(compact)) return fromSeed(Buffer.from(compact, 'hex'));
  if (!/^[A-Za-z0-9+/=]+$/.test(compact)) return undefined;
  const bytes = Buffer.from(compact, 'base64');
  if (bytes.length === 0) return undefined;
  try {
    return createPrivateKey({ key: bytes, format: 'der', type: 'pkcs8' });
  } catch {
    if (bytes.length === 32 || bytes.length === 64) return fromSeed(bytes);
    return undefined;
  }
}

/** Carga una privada Ed25519 en PKCS#8, convirtiendo OpenSSH si hace falta. */
function loadPrivateKey(pem) {
  const material = normalize(pem);
  try {
    return createPrivateKey(material);
  } catch (firstError) {
    if (!material.includes('BEGIN OPENSSH PRIVATE KEY')) {
      const raw = loadWithoutArmor(material);
      if (raw) return raw;
      throw firstError;
    }
    const dir = mkdtempSync(join(tmpdir(), 'webs-sign-'));
    const file = join(dir, 'key');
    try {
      writeFileSync(file, material, { mode: 0o600 });
      execFileSync('ssh-keygen', ['-p', '-m', 'PKCS8', '-N', '', '-f', file], { stdio: 'pipe' });
      return createPrivateKey(readFileSync(file, 'utf8'));
    } catch (conversionError) {
      const reason = conversionError instanceof Error ? conversionError.message : String(conversionError);
      throw new Error(
        `No se pudo convertir la clave OpenSSH a PKCS#8 (¿tiene passphrase?): ${reason}. ` +
          'Convertila a mano con: ssh-keygen -p -m PKCS8 -N "" -f update_private.pem',
      );
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  }
}

function expectedPublicKey() {
  if (process.env.UPDATE_PUBLIC_KEY) return process.env.UPDATE_PUBLIC_KEY.trim();
  try {
    const yaml = readFileSync('deploy/k8s/configmap.yaml', 'utf8');
    return yaml.match(/UPDATE_PUBLIC_KEY:\s*["']?([A-Za-z0-9+/=]+)/)?.[1];
  } catch {
    return undefined;
  }
}

let privateKey;
try {
  privateKey = loadPrivateKey(rawKey);
} catch (error) {
  const reason = error instanceof Error ? error.message : String(error);
  console.error(`UPDATE_PRIVATE_KEY inválida: ${reason}`);
  console.error('Debe ser una privada Ed25519 en PKCS#8, OpenSSH, o base64/hex de la semilla.');
  process.exit(1);
}

if (privateKey.asymmetricKeyType !== 'ed25519') {
  console.error(`UPDATE_PRIVATE_KEY no es Ed25519 (es ${privateKey.asymmetricKeyType ?? 'desconocido'}).`);
  process.exit(1);
}

const derivedPublic = createPublicKey(privateKey).export({ format: 'der', type: 'spki' }).toString('base64');
const expected = expectedPublicKey();
if (expected && expected !== derivedPublic) {
  console.error('La clave privada NO corresponde a la pública configurada.');
  console.error(`  esperada: ${expected}`);
  console.error(`  derivada: ${derivedPublic}`);
  console.error('No se firma: las instalaciones desplegadas no podrían verificar el artefacto.');
  process.exit(1);
}

const artifact = readFileSync(tarball);
const digest = createHash('sha256').update(artifact).digest('hex');
const signature = nodeSign(null, Buffer.from(digest, 'utf8'), privateKey).toString('base64url');

writeFileSync(`${tarball}.sha256`, `${digest}\n`);
writeFileSync(`${tarball}.sig`, `${signature}\n`);

console.log(`sha256 ${digest}`);
console.log(`firma  ${signature}`);
console.log(`ok     ${tarball}.sha256 y ${tarball}.sig`);
