import { useId, useRef, type KeyboardEvent, type ReactNode } from 'react';
import { cn } from './cn';

export interface TabItem {
  value: string;
  label: ReactNode;
  icon?: string;
}

/**
 * Navegación por pestañas accesible (patrón ARIA tablist). Pensada para
 * alternar secciones en dashboards (por rol) sin perder el foco/teclado.
 *
 * Navegación con flechas (roving tabindex): la pestaña seleccionada queda en
 * el tab-order (`tabIndex=0`), el resto en `-1`; ←/→/Home/End mueven foco y
 * selección. Si se pasa `children`, se renderiza un `role="tabpanel"` enlazado
 * por `aria-labelledby`/`aria-controls` (variante de panel único controlado).
 */
export function Tabs({
  items,
  value,
  onChange,
  ariaLabel,
  className,
  children,
}: {
  items: TabItem[];
  value: string;
  onChange: (value: string) => void;
  ariaLabel?: string;
  className?: string;
  children?: ReactNode;
}) {
  const base = useId();
  const tabRefs = useRef<(HTMLButtonElement | null)[]>([]);
  const activeIndex = items.findIndex((item) => item.value === value);
  const panelId = `${base}-panel`;

  const onKeyDown = (event: KeyboardEvent<HTMLButtonElement>) => {
    const count = items.length;
    if (count === 0 || activeIndex < 0) return;
    let nextIndex: number | null = null;
    if (event.key === 'ArrowRight') nextIndex = (activeIndex + 1) % count;
    else if (event.key === 'ArrowLeft') nextIndex = (activeIndex - 1 + count) % count;
    else if (event.key === 'Home') nextIndex = 0;
    else if (event.key === 'End') nextIndex = count - 1;
    if (nextIndex == null) return;
    const nextItem = items[nextIndex];
    if (!nextItem) return;
    event.preventDefault();
    onChange(nextItem.value);
    tabRefs.current[nextIndex]?.focus();
  };

  return (
    <>
      <div
        role="tablist"
        aria-label={ariaLabel}
        className={cn('inline-flex flex-wrap items-center gap-1 rounded-lg bg-surface-2 p-1', className)}
      >
        {items.map((item, index) => {
          const selected = item.value === value;
          return (
            <button
              key={item.value}
              ref={(el) => {
                tabRefs.current[index] = el;
              }}
              type="button"
              role="tab"
              id={`${base}-tab-${item.value}`}
              aria-selected={selected}
              aria-controls={children != null ? panelId : undefined}
              tabIndex={selected ? 0 : -1}
              onClick={() => onChange(item.value)}
              onKeyDown={onKeyDown}
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
      {children != null && (
        <div
          role="tabpanel"
          id={panelId}
          aria-labelledby={`${base}-tab-${value}`}
          tabIndex={0}
        >
          {children}
        </div>
      )}
    </>
  );
}
