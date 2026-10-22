import { useId, type ReactNode } from 'react';
import { cn } from './cn';

export interface TabItem {
  value: string;
  label: ReactNode;
  icon?: string;
}

/**
 * Navegación por pestañas accesible (patrón ARIA tablist). Pensada para
 * alternar secciones en dashboards (por rol) sin perder el foco/teclado.
 */
export function Tabs({
  items,
  value,
  onChange,
  ariaLabel,
  className,
}: {
  items: TabItem[];
  value: string;
  onChange: (value: string) => void;
  ariaLabel?: string;
  className?: string;
}) {
  const base = useId();
  return (
    <div
      role="tablist"
      aria-label={ariaLabel}
      className={cn('inline-flex flex-wrap items-center gap-1 rounded-lg bg-surface-2 p-1', className)}
    >
      {items.map((item) => {
        const selected = item.value === value;
        return (
          <button
            key={item.value}
            type="button"
            role="tab"
            id={`${base}-tab-${item.value}`}
            aria-selected={selected}
            aria-controls={`${base}-panel-${item.value}`}
            onClick={() => onChange(item.value)}
            className={cn(
              'inline-flex items-center gap-2 rounded-md px-3 py-1.5 text-sm font-medium transition-colors',
              selected ? 'bg-surface text-text shadow-sm' : 'text-muted hover:text-text',
            )}
          >
            {item.icon && <i className={cn('bi', item.icon)} aria-hidden="true" />}
            {item.label}
          </button>
        );
      })}
    </div>
  );
}
