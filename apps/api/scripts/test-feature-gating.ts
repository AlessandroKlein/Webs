/* Smoke test t97 (ADR-0019 feature-gating):
 * verifica que la licencia core vs premium cambia menú y catálogo,
 * y que el feature de un item se resuelve menu[].feature > manifest.feature > 'core'.
 * Corre con: pnpm --filter @webs/api exec tsx scripts/test-feature-gating.ts
 */
import { resolveFeature, isLicensed } from '../src/lib/feature-gating';
import { buildCatalog } from '../src/plugins/catalog';
import { pluginRegistry } from '../src/plugins/registry';
import { collectPluginMenuItems } from '../src/lib/plugin-menu';

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

// --- 1. resolveFeature -------------------------------------------------
check('resolveFeature(undefined) => core', resolveFeature(undefined) === 'core');
check('resolveFeature(null) => core', resolveFeature(null) === 'core');
check('resolveFeature(payments) => payments', resolveFeature('payments') === 'payments');

// --- 2. isLicensed (core vs premium) -----------------------------------
const licenseCore = { license: { hasFeature: (f: string) => f === 'core' } } as never;
const licensePremium = { license: { hasFeature: (f: string) => f === 'core' || f === 'payments' } } as never;
check('core license: isLicensed(core)=true', isLicensed(licenseCore, 'core') === true);
check('core license: isLicensed(payments)=false', isLicensed(licenseCore, 'payments') === false);
check('core license: isLicensed(undefined)=true', isLicensed(licenseCore, undefined) === true);
check('premium license: isLicensed(payments)=true', isLicensed(licensePremium, 'payments') === true);

// --- 3. buildCatalog feature + enrich (licensed) -----------------------
const localManifests = [
  { id: 'blog', name: '@webs/plugin-blog', version: '1.0.0' },
  { id: 'ecommerce', name: '@webs/plugin-ecommerce', version: '1.0.0', feature: 'payments' },
] as never[];
const catalog = buildCatalog(localManifests, [], new Map<string, string>());
const blogItem = catalog.local.find((i) => i.id === 'blog');
const ecomItem = catalog.local.find((i) => i.id === 'ecommerce');
check('catalog: blog feature=core', blogItem?.feature === 'core');
check('catalog: ecommerce feature=payments', ecomItem?.feature === 'payments');

const enrich = (has: (f: string) => boolean) =>
  catalog.local.map((i) => ({ ...i, licensed: has(resolveFeature(i.feature)) }));
check('catalog core: ecommerce licensed=false', enrich((f) => f === 'core').find((i) => i.id === 'ecommerce')?.licensed === false);
check('catalog premium: ecommerce licensed=true', enrich((f) => f === 'core' || f === 'payments').find((i) => i.id === 'ecommerce')?.licensed === true);

// --- 4. collectPluginMenuItems resuelve feature (menu > manifest > core)
pluginRegistry.registerAvailable({ id: 'blog', name: '@webs/plugin-blog', version: '1.0.0' } as never);
pluginRegistry.registerAvailable({ id: 'ecommerce', name: '@webs/plugin-ecommerce', version: '1.0.0', feature: 'payments' } as never);
pluginRegistry.registerMenuItems('blog', [{ id: 'blog', label: { es: 'Blog' }, path: '/admin/blog', target: 'admin' } as never]);
pluginRegistry.registerMenuItems('ecommerce', [
  { id: 'ecommerce', label: { es: 'Comercio' }, path: '/admin/commerce', target: 'admin' } as never,
]);
// override a nivel de item: plugin core con item feature premium
pluginRegistry.registerMenuItems('organizaciones', [
  { id: 'organizaciones', label: { es: 'Org' }, path: '/admin/orgs', target: 'admin', feature: 'multitenant' } as never,
]);

const adminItems = collectPluginMenuItems('admin');
const byId = new Map(adminItems.map((i) => [i.id, i]));
check('menu: blog (core) feature=core', byId.get('blog')?.feature === 'core');
check('menu: ecommerce (manifest payments) feature=payments', byId.get('ecommerce')?.feature === 'payments');
check('menu: item feature override > manifest', byId.get('organizaciones')?.feature === 'multitenant');

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed === 0 ? 0 : 1);
