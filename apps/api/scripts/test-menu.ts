/* Smoke test t115 (GET /menu admin):
 * verifica normalizeItems (preserva section/feature/permissions), sortByOrder y
 * buildAdminMenu (source core/plugin + dedup por path + defaults feature/permissions).
 * Corre con: pnpm --filter @webs/api exec tsx scripts/test-menu.ts
 */
import { buildAdminMenu, normalizeItems, sortByOrder } from '../src/modules/menu/routes';
import { collectPluginMenuItems } from '../src/lib/plugin-menu';
import { pluginRegistry } from '../src/plugins/registry';

let passed = 0;
let failed = 0;
function check(name: string, cond: boolean) {
  if (cond) {
    passed += 1;
    console.log(`PASS ${name}`);
  } else {
    failed += 1;
    console.log(`FAIL ${name}`);
  }
}

// --- 1. normalizeItems --------------------------------------------------
const normalized = normalizeItems([
  { label: 'Panel', path: '/admin', order: 1, section: 'panel', feature: 'core', permissions: [] },
  { label: 'Generado', path: '/admin/generated', section: 'integraciones', feature: 'generator', permissions: ['generated.read'] },
  { label: '', path: '/admin/empty' }, // label vacío → descartado
  { label: 'Sin ruta', path: '' }, // path vacío → descartado
  null, // no objeto → descartado
]);
check('normalizeItems: preserva section/feature/permissions', normalized.length === 2 && normalized[0]?.section === 'panel' && normalized[0]?.feature === 'core');
check('normalizeItems: permissions preservadas', Array.isArray(normalized[1]?.permissions) && normalized[1]?.permissions?.[0] === 'generated.read');
check('normalizeItems: descarta inválidos', normalized.every((i) => i.label !== '' && i.path !== ''));

// --- 2. sortByOrder -----------------------------------------------------
const sorted = sortByOrder([{ order: 3 }, { order: 1 }, { order: 2 }] as Array<{ order: number }>);
check('sortByOrder: orden ascendente', sorted[0]?.order === 1 && sorted[1]?.order === 2 && sorted[2]?.order === 3);

// --- 3. buildAdminMenu (source + dedup + defaults) ----------------------
pluginRegistry.registerAvailable({ id: 'blog', name: '@webs/plugin-blog', version: '1.0.0' } as never);
pluginRegistry.registerMenuItems('blog', [
  // path colisiona con un ítem core → debe descartarse
  { id: 'blog', label: { es: 'Blog' }, path: '/admin/plugins', target: 'admin' } as never,
  // path único → se incluye con source plugin
  { id: 'blog-admin', label: { es: 'Blog admin' }, path: '/admin/blog', target: 'admin', order: 5 } as never,
]);

const coreRaw = [
  { label: 'nav.dashboard', path: '/admin', section: 'panel', order: 1, feature: 'core', permissions: [] },
  { label: 'nav.plugins', path: '/admin/plugins', section: 'integraciones', order: 11, feature: 'core', permissions: ['plugin.read'] },
  { label: 'nav.generated', path: '/admin/generated', section: 'integraciones', order: 12, feature: 'generator', permissions: ['generated.read'] },
  // item core sin feature/permissions → defaults 'core' / []
  { label: 'nav.api', path: '/admin/api-tokens', section: 'integraciones', order: 13 },
];

const menu = buildAdminMenu(coreRaw, collectPluginMenuItems('admin'));
const byPath = new Map(menu.map((i) => [i.path, i]));
check('buildAdminMenu: core item source=core + id=null', byPath.get('/admin')?.source === 'core' && byPath.get('/admin')?.id === null);
check('buildAdminMenu: core sin feature default core', byPath.get('/admin/api-tokens')?.feature === 'core');
check('buildAdminMenu: core sin permissions default []', Array.isArray(byPath.get('/admin/api-tokens')?.permissions) && byPath.get('/admin/api-tokens')?.permissions?.length === 0);
check('buildAdminMenu: core preserva feature=generator', byPath.get('/admin/generated')?.feature === 'generator');
check('buildAdminMenu: core preserva permissions', byPath.get('/admin/plugins')?.permissions?.[0] === 'plugin.read');
check('buildAdminMenu: plugin item source=plugin', byPath.get('/admin/blog')?.source === 'plugin');
check('buildAdminMenu: dedup descarta plugin con path core', byPath.get('/admin/plugins')?.source === 'core' && menu.filter((i) => i.path === '/admin/plugins').length === 1);
check('buildAdminMenu: total = 4 core + 1 plugin (dedup -1)', menu.length === 5);

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed === 0 ? 0 : 1);
