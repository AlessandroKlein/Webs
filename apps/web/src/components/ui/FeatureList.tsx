import { cn } from './cn';

export interface FeatureListItem {
  id: string;
  label: string;
  description?: string;
  /** `true` = activo/habilitado; `false` = deshabilitado (se muestra atenuado). */
  enabled: boolean;
}

/**
 * Lista de capacidades activas/deshabilitadas.
 *
 * Sirve para los features de la licencia (p. ej. "Módulo POS", "Multi-tenant")
 * y también para los permisos visuales de una cadena (qué ve/edita una
 * sucursal frente a la casa matriz). Es presentacional: el estado viene por
 * `enabled` y no consulta ningún backend.
 */
export function FeatureList({
  features,
  ariaLabel = 'Funcionalidades',
  className,
}: {
  features: FeatureListItem[];
  ariaLabel?: string;
  className?: string;
}) {
  return (
    <ul className={cn('flex flex-col gap-1', className)} aria-label={ariaLabel}>
      {features.map((feature) => (
        <li
          key={feature.id}
          className={cn(
            'flex items-start gap-3 rounded-md px-2 py-1.5',
            feature.enabled ? 'text-text' : 'text-muted',
          )}
        >
          <span
            className={cn(
              'mt-0.5 inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full',
              feature.enabled ? 'bg-success-soft text-success' : 'bg-surface-2 text-subtle',
            )}
            aria-hidden="true"
          >
            <i className={cn('bi text-xs', feature.enabled ? 'bi-check' : 'bi-dash')} />
          </span>
          <span className="flex flex-col gap-0.5">
            <span className="text-sm font-medium">{feature.label}</span>
            {feature.description && <span className="text-sm text-muted">{feature.description}</span>}
          </span>
        </li>
      ))}
    </ul>
  );
}
