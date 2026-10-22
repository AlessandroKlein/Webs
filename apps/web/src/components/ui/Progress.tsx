import type { HTMLAttributes } from 'react';
import { cn } from './cn';

type ProgressTone = 'primary' | 'success' | 'warning' | 'danger' | 'info';

const TONES: Record<ProgressTone, string> = {
  primary: 'bg-primary',
  success: 'bg-success',
  warning: 'bg-warning',
  danger: 'bg-danger',
  info: 'bg-info',
};

/**
 * Barra de progreso accesible. Útil para el stepper de checkout, la
 * distribución de recaudación y estados de carga deterministas.
 */
export function Progress({
  value,
  max = 100,
  tone = 'primary',
  label,
  className,
  ...props
}: HTMLAttributes<HTMLDivElement> & {
  value: number;
  max?: number;
  tone?: ProgressTone;
  label?: string;
}) {
  const pct = max > 0 ? Math.min(100, Math.max(0, (value / max) * 100)) : 0;
  return (
    <div
      role="progressbar"
      aria-valuemin={0}
      aria-valuemax={max}
      aria-valuenow={value}
      aria-label={label}
      className={cn('h-2 w-full overflow-hidden rounded-full bg-surface-2', className)}
      {...props}
    >
      <div
        className={cn('h-full rounded-full transition-[width] duration-300', TONES[tone])}
        style={{ width: `${pct}%` }}
      />
    </div>
  );
}
