import type { ReactNode } from 'react';

interface PageHeaderProps {
  title: string;
  description?: string;
  actions?: ReactNode;
  children?: ReactNode;
}

/**
 * Encabezado de página estándar del panel: `<h1>` accesible + descripción opcional,
 * acciones alineadas a la derecha y un slot inferior para filtros/Tabs/SegmentedControl.
 * Reemplaza las variantes de encabezado ad-hoc (V1/V2/V3/V5) dispersas por `features/**`.
 */
export function PageHeader({ title, description, actions, children }: PageHeaderProps) {
  return (
    <header className="flex flex-col gap-3">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex flex-col gap-1">
          <h1 className="text-xl font-semibold leading-none">{title}</h1>
          {description && <p className="text-sm text-muted">{description}</p>}
        </div>
        {actions && <div className="flex items-center gap-2">{actions}</div>}
      </div>
      {children}
    </header>
  );
}
