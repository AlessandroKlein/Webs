/* eslint-disable */
// Smoke test ADR-0018 (t86): catálogo canónico de permisos + endpoint agrupado.
// Ejecutar: pnpm --filter @webs/api exec tsx scripts/test-permissions-catalog.ts
import {
  PERMISSION_AREAS,
  PERMISSION_CATALOG,
  flattenPermissionCatalog,
  groupPermissionCatalog,
  Permission,
} from '@webs/core';

let pass = 0;
let fail = 0;
function check(name: string, cond: boolean) {
  if (cond) { pass++; console.log(`PASS ${name}`); }
  else { fail++; console.log(`FAIL ${name}`); }
}

const baseKeys = PERMISSION_CATALOG.map((p) => p.key);
// `Permission` incluye aliases @deprecated (BlockRead/BlockManage) que duplican
// plugin.read/plugin.manage → comparar contra las claves ÚNICAS.
const permissionValues = [...new Set(Object.values(Permission))];

// 1. Sin drift: el catálogo base cubre exactamente las claves únicas de `Permission`.
check(
  `catalog covers all unique Permission keys (${permissionValues.length} = ${baseKeys.length})`,
  permissionValues.length === baseKeys.length
    && permissionValues.every((k) => baseKeys.includes(k))
    && baseKeys.every((k) => permissionValues.includes(k)),
);

// 2. Agrupación por defecto: todas las áreas presentes y sin claves huérfanas.
{
  const catalog = groupPermissionCatalog([]);
  const flat = catalog.areas.flatMap((a) => a.permissions.map((p) => p.key));
  check(`grouped has ${catalog.areas.length} areas`, catalog.areas.length > 0);
  check(`grouped contains all ${baseKeys.length} base keys`, baseKeys.every((k) => flat.includes(k)));
  check('areas are from the canonical set', catalog.areas.every((a) => PERMISSION_AREAS.includes(a.area)));
}

// 3. Mapeos de área específicos.
{
  const areaOf = (key: string) => PERMISSION_CATALOG.find((p) => p.key === key)?.area;
  check('plugin.read → plugins', areaOf('plugin.read') === 'plugins');
  check('license.manage → license', areaOf('license.manage') === 'license');
  check('organization.manage → organization', areaOf('organization.manage') === 'organization');
  check('sales.manage → sales', areaOf('sales.manage') === 'sales');
  check('inventory.read → inventory', areaOf('inventory.read') === 'inventory');
  check('content.publish → content', areaOf('content.publish') === 'content');
}

// 4. Permisos de plugins se unen al área 'plugins' y la base gana ante colisión.
{
  const catalog = groupPermissionCatalog([
    { key: 'custom.permission.x', description: null },
    { key: 'plugin.read', description: 'NO debe pisar la base' },
  ]);
  const pluginsArea = catalog.areas.find((a) => a.area === 'plugins');
  const keys = pluginsArea?.permissions.map((p) => p.key) ?? [];
  check('plugin permission merged into plugins area', keys.includes('custom.permission.x'));
  check('base key not duplicated (plugin.read once)', keys.filter((k) => k === 'plugin.read').length === 1);
  const pluginRead = pluginsArea?.permissions.find((p) => p.key === 'plugin.read');
  check('base description wins', pluginRead?.description === 'Ver plugins');
}

// 5. Variante plana (retrocompat) devuelve {key, description} plano.
{
  const flat = flattenPermissionCatalog([]);
  check(`flat has ${baseKeys.length} entries`, flat.length === baseKeys.length);
  check('flat entries have key+description', flat.every((p) => typeof p.key === 'string' && typeof p.description === 'string'));
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
