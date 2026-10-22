import type { ReactNode } from 'react';
import { cn } from './cn';

type AlertVariant = 'info' | 'success' | 'warning' | 'danger';

const ICONS: Record<AlertVariant, string> = {
  info: 'bi-info-circle-fill',
  success: 'bi-check-circle-fill',
  warning: 'bi-exclamation-triangle-fill',
  danger: 'bi-x-octagon-fill',
};

const STYLES: Record<AlertVariant, string> = {
  info: 'bg-info-soft text-info',
  success: 'bg-success-soft text-success',
  warning: 'bg-warning-soft text-warning',
  danger: 'bg-danger-soft text-danger',
};

/**
 * Mensaje de estado con icono semántico. Usá `role="alert"` solo para los
 * errores que requieren anuncio inmediato; para info/success conviene
 * `role="status"` (el componente expone `role` por props, p. ej. pasando
 * `role="status"`).
 */
export function Alert({
  variant = 'info',
  title,
  children,
  className,
  role = 'alert',
}: {
  variant?: AlertVariant;
  title?: string;
  children?: ReactNode;
  className?: string;
  role?: 'alert' | 'status';
}) {
  return (
    <div role={role} className={cn('flex items-start gap-3 rounded-md border border-transparent p-4 text-sm', STYLES[variant], className)}>
      <i className={cn('bi leading-none', ICONS[variant])} aria-hidden="true" />
      <div className="flex flex-col gap-1">
        {title && <p className="font-semibold">{title}</p>}
        {children && <div className="opacity-90">{children}</div>}
      </div>
    </div>
  );
}
