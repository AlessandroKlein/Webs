import type { HTMLAttributes } from 'react';
import { cn } from './cn';

type BadgeVariant = 'neutral' | 'primary' | 'success' | 'warning' | 'danger' | 'info';

const VARIANTS: Record<BadgeVariant, string> = {
  neutral: 'bg-surface-2 text-muted',
  primary: 'bg-primary-soft text-primary',
  success: 'bg-success-soft text-success',
  warning: 'bg-warning-soft text-warning',
  danger: 'bg-danger-soft text-danger',
  info: 'bg-info-soft text-info',
};

/**
 * Etiqueta de estado. Los fondos "suaves" consumen los tokens `--ws-*-soft`,
 * por lo que el administrador puede re-tematizarlos desde Apariencia.
 */
export function Badge({
  variant = 'neutral',
  className,
  ...props
}: HTMLAttributes<HTMLSpanElement> & { variant?: BadgeVariant }) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-sm font-medium',
        VARIANTS[variant],
        className,
      )}
      {...props}
    />
  );
}
