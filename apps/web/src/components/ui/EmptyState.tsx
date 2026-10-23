import type { ReactNode } from 'react';
import { cn } from './cn';

/**
 * Estado vacío con icono, título, descripción y acción opcional.
 * Reemplaza los plugins "No tenés X" dispersos por una vista consistente.
 */
export function EmptyState({
  icon = 'bi-inbox',
  title,
  description,
  action,
  className,
}: {
  icon?: string;
  title: string;
  description?: string;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        'flex flex-col items-center justify-center gap-3 rounded-lg border border-dashed border-border bg-surface px-6 py-12 text-center',
        className,
      )}
    >
      <i className={cn('bi text-3xl text-subtle', icon)} aria-hidden="true" />
      <p className="font-medium text-text">{title}</p>
      {description && <p className="max-w-sm text-sm text-muted">{description}</p>}
      {action}
    </div>
  );
}
