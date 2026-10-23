import type { ReactNode } from 'react';
import { cn } from './cn';

export interface SegmentedOption {
  value: string;
  label: ReactNode;
  icon?: string;
  /** Descripción breve que se muestra como tooltip (p. ej. alcance de la vista). */
  description?: string;
}

/**
 * Selector segmentado de una sola opción (patrón ARIA `radiogroup`).
 *
 * A diferencia de `Tabs` (tablist para alternar paneles), esto representa una
 * elección persistente y excluyente —por ejemplo "Casa matriz (consolidado) /
 * Sucursal" en la gestión de cadenas—. Reutiliza la misma estética segmented
 * del design system.
 */
export function SegmentedControl({
  options,
  value,
  onChange,
  ariaLabel,
  className,
}: {
  options: SegmentedOption[];
  value: string;
  onChange: (value: string) => void;
  ariaLabel: string;
  className?: string;
}) {
  return (
    <div
      role="radiogroup"
      aria-label={ariaLabel}
      className={cn('inline-flex flex-wrap items-center gap-1 rounded-lg bg-surface-2 p-1', className)}
    >
      {options.map((option) => {
        const selected = option.value === value;
        return (
          <button
            key={option.value}
            type="button"
            role="radio"
            aria-checked={selected}
            title={option.description}
            onClick={() => onChange(option.value)}
            className={cn(
              'inline-flex items-center gap-2 rounded-md px-3 py-1.5 text-sm font-medium transition-colors',
              selected ? 'bg-surface text-text shadow-sm' : 'text-muted hover:text-text',
            )}
          >
            {option.icon && <i className={cn('bi', option.icon)} aria-hidden="true" />}
            {option.label}
          </button>
        );
      })}
    </div>
  );
}
