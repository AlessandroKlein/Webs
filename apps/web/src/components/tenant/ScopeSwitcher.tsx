import { SegmentedControl } from '../ui/SegmentedControl';
import { cn } from '../ui/cn';
import { useTenantStore } from '../../lib/tenant-store';

/**
 * Selector de scope multi-tenant para el shell de administración.
 *
 * Muestra "Casa matriz (consolidado)" + una opción por sucursal. La elección
 * se refleja en `tenant-store` → `tenant-scope` → cabeceras `X-Org-Id` /
 * `X-Chain-Id` de cada petición posterior.
 *
 * Si el tenant no es una cadena (sin sucursales) no se renderiza.
 */
export function ScopeSwitcher({ className }: { className?: string }) {
  const root = useTenantStore((s) => s.root);
  const branches = useTenantStore((s) => s.branches);
  const mode = useTenantStore((s) => s.mode);
  const selectedOrganizationId = useTenantStore((s) => s.selectedOrganizationId);
  const selectMode = useTenantStore((s) => s.selectMode);
  const selectBranch = useTenantStore((s) => s.selectBranch);

  if (!root || branches.length === 0) return null;

  const value = mode === 'branch' && selectedOrganizationId ? selectedOrganizationId : 'consolidated';

  const options = [
    {
      value: 'consolidated',
      label: 'Casa matriz',
      icon: 'bi-diagram-3',
      description: 'Vista consolidada: agrega todas las sucursales',
    },
    ...branches.map((b) => ({
      value: b.id,
      label: b.name,
      icon: 'bi-shop',
      description: 'Operar solo sobre esta sucursal',
    })),
  ];

  return (
    <SegmentedControl
      options={options}
      value={value}
      onChange={(next) => (next === 'consolidated' ? selectMode('consolidated') : selectBranch(next))}
      ariaLabel="Ámbito de operación"
      className={className}
    />
  );
}

/**
 * Indicador visual del scope actual ("en qué organización estás operando").
 * Pensado para cabeceras de páginas (finanzas, sucursales) y lectores de pantalla.
 */
export function ScopeBadge({ className }: { className?: string }) {
  const root = useTenantStore((s) => s.root);
  const branches = useTenantStore((s) => s.branches);
  const mode = useTenantStore((s) => s.mode);
  const selectedOrganizationId = useTenantStore((s) => s.selectedOrganizationId);

  if (!root || branches.length === 0) return null;

  const branch = branches.find((b) => b.id === selectedOrganizationId);
  const label = mode === 'branch' && branch ? `Sucursal · ${branch.name}` : 'Casa matriz · consolidado';
  const icon = mode === 'branch' ? 'bi-shop' : 'bi-diagram-3';

  return (
    <span
      className={cn('inline-flex items-center gap-1.5 rounded-full bg-surface-2 px-2.5 py-1 text-xs text-muted', className)}
      aria-live="polite"
    >
      <i className={cn('bi', icon)} aria-hidden="true" />
      {label}
    </span>
  );
}
