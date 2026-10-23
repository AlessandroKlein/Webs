import { buildCatalog } from '../src/plugins/catalog';
import type { PluginManifest } from '@webs/plugin-sdk';

function manifest(overrides: Partial<PluginManifest> & { id: string }): PluginManifest {
  return {
    name: `@webs/plugin-${overrides.id}`,
    version: '1.0.0',
    type: 'plugin',
    displayName: { es: overrides.id },
    description: { es: overrides.id },
    author: 'Webs',
    apiVersion: '1.0.0',
    ...overrides,
  };
}

let pass = 0;
let fail = 0;
function check(name: string, cond: boolean) {
  if (cond) {
    pass++;
    console.log(`  ✓ ${name}`);
  } else {
    fail++;
    console.log(`  ✗ ${name}`);
  }
}

const REPO = 'https://github.com/AlessandroKlein/Webs';

// 1. First-party plugin con `repository` → source 'git' (ADR-0016).
let cat = buildCatalog([manifest({ id: 'blog', repository: REPO })], [], new Map());
check('first-party con repository → git', cat.local[0]?.source === 'git');

// 2. Manifiesto con `source: "npm"` explícito → npm.
cat = buildCatalog([manifest({ id: 'npm-pkg', source: 'npm' })], [], new Map());
check('manifest source npm → npm', cat.local[0]?.source === 'npm');

// 3. Sin repository ni source → 'local' (marcador interno de desarrollo).
cat = buildCatalog([manifest({ id: 'bare' })], [], new Map());
check('sin repository → local', cat.local[0]?.source === 'local');

// 4. Entrada solo en el registro → remota con su source.
cat = buildCatalog([], [{ id: 'acme', name: '@acme/plugin', version: '1.0.0', source: 'git', url: 'https://github.com/acme/repo.git' }], new Map());
check('registro-only → remote git', cat.remote.length === 1 && cat.remote[0]?.source === 'git');

// 5. Overlap local+registro → un solo item local (sin duplicado remoto), source del registro.
cat = buildCatalog(
  [manifest({ id: 'blog', repository: REPO })],
  [{ id: 'blog', name: '@webs/plugin-blog', version: '2.0.0', source: 'git', url: REPO }],
  new Map(),
);
check('overlap → single local git, no remote dup', cat.local.length === 1 && cat.local[0]?.source === 'git' && cat.remote.length === 0);

// 6. repository propagado al item.
cat = buildCatalog([manifest({ id: 'blog', repository: REPO })], [], new Map());
check('repository propagado', cat.local[0]?.repository === REPO);

// 7. Instalado → installed:true + installedVersion.
cat = buildCatalog([manifest({ id: 'blog', repository: REPO })], [], new Map([['blog', '1.0.0']]));
check('instalado → installed true + version', cat.local[0]?.installed === true && cat.local[0]?.installedVersion === '1.0.0');

console.log(`\n${pass} passed, ${fail} failed`);
if (fail > 0) process.exit(1);
