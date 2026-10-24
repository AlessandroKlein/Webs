import { redact, isSensitiveKey, toYaml } from '../src/modules/update/raw';

let pass = 0;
let fail = 0;

function assert(cond: boolean, label: string): void {
  if (cond) {
    pass += 1;
  } else {
    fail += 1;
    console.error(`FAIL: ${label}`);
  }
}

// 1) Denylist de claves sensibles (ADR-0026 §3).
assert(isSensitiveKey('clientSecret') === true, 'clientSecret sensible');
assert(isSensitiveKey('apiKey') === true, 'apiKey sensible');
assert(isSensitiveKey('password') === true, 'password sensible');
assert(isSensitiveKey('privateKey') === true, 'privateKey sensible');
assert(isSensitiveKey('accessToken') === true, 'accessToken sensible');
assert(isSensitiveKey('cert') === true, 'cert sensible');
assert(isSensitiveKey('key') === true, 'key genérica sensible');
assert(isSensitiveKey('publicKey') === false, 'publicKey NO sensible (pública)');
assert(isSensitiveKey('signature') === false, 'signature NO sensible (pública)');
assert(isSensitiveKey('sha256') === false, 'sha256 NO sensible');
assert(isSensitiveKey('name') === false, 'name NO sensible');

// 2) Redacción recursiva (no muta el original y preserva claves públicas).
const payload = {
  name: 'Webs',
  version: '2.10.0',
  clientSecret: 's3cr3t',
  token: 'tok',
  publicKey: '-----BEGIN PUBLIC KEY-----',
  signature: { algorithm: 'ed25519', value: 'base64url-sig' },
  nested: { privateKey: 'pk', ok: 1, items: [{ apiKey: 'k' }, { id: 2 }] },
};
const out = redact(payload) as Record<string, unknown>;
assert(out.clientSecret === '«redacted»', 'redacta clientSecret');
assert(out.token === '«redacted»', 'redacta token');
assert(out.publicKey === '-----BEGIN PUBLIC KEY-----', 'preserva publicKey');
assert((out.signature as Record<string, unknown>).value === 'base64url-sig', 'preserva signature.value');
const nested = out.nested as Record<string, unknown>;
assert(nested.privateKey === '«redacted»', 'redacta privateKey anidado');
assert(nested.ok === 1, 'preserva valor no sensible');
assert((nested.items as unknown[])[0] && ((nested.items as Record<string, unknown>[])[0] as Record<string, unknown>).apiKey === '«redacted»', 'redacta apiKey en array');

// 3) Heurística de patrón sobre valores string.
assert(redact('sk-abcdefghijklmnop') === '«redacted»', 'redacta patrón sk-');
assert(redact('xoxb-1234-5678') === '«redacted»', 'redacta patrón xoxb-');
assert(redact('-----BEGIN PRIVATE KEY-----xxx') === '«redacted»', 'redacta PEM privada');
assert(redact('ghp_0123456789abcdefghijklmnopqrstuvwxyz') === '«redacted»', 'redacta patrón gh*_');
assert(redact('hola mundo') === 'hola mundo', 'preserva string normal');

// 4) Serialización YAML mínima (JSON-compatible).
const yaml = toYaml({
  kind: 'app',
  version: '2.10.0',
  files: [{ path: 'webs-2.10.0.tar.gz' }, { path: 'webs-2.10.0.tar.gz.sha256' }],
  nested: { x: 1, empty: {} },
  tags: ['a', 'b'],
});
assert(yaml.includes('kind: "app"'), 'YAML scalar string');
assert(yaml.includes('version: "2.10.0"'), 'YAML version');
assert(yaml.includes('- path: "webs-2.10.0.tar.gz"'), 'YAML array item');
assert(yaml.includes('nested:'), 'YAML nested key');
assert(yaml.includes('x: 1'), 'YAML nested number');
assert(yaml.includes('- "a"'), 'YAML string array');

// 5) YAML de payload vacío no rompe.
assert(toYaml({ files: [], integrity: undefined }) !== '', 'YAML payload con vacíos');

console.log(`\nupdate-raw: ${pass} passed, ${fail} failed`);
if (fail > 0) process.exit(1);
