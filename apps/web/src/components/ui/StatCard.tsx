import type { ReactNode } from 'react';
import { cn } from './cn';

type StatTone = 'neutral' | 'primary' | 'success' | 'warning' | 'danger' | 'info';

const TONE_TEXT: Record<StatTone, string> = {
  neutral: 'text-text',
  primary: 'text-primary',
  success: 'text-success',
  warning: 'text-warning',
  danger: 'text-danger',
  info: 'text-info',
};

/**
 * Métrica de dashboard: etiqueta, valor destacado e indicador opcional.
 * Reutiliza `.card` y los tokens del tema; el color del valor refleja el tono
 * semántico (recaudación, pendientes, stock, etc.).
 */
export function StatCard({
  label,
  value,
  icon,
  hint,
  tone = 'neutral',
  className,
}: {
  label: string;
  value: ReactNode;
  icon?: ReactNode;
  hint?: ReactNode;
  tone?: StatTone;
  className?: string;
}) {
  return (
    <div className={cn('card flex flex-col gap-3', className)}>
      <div className="flex items-center justify-between gap-2">
        <span className="text-sm text-muted">{label}</span>
        {icon && (
          <span className={cn('text-lg', TONE_TEXT[tone])} aria-hidden="true">
            {icon}
          </span>
        )}
      </div>
      <div className={cn('text-2xl font-semibold leading-none', TONE_TEXT[tone])}>{value}</div>
      {hint && <div className="text-sm text-muted">{hint}</div>}
    </div>
  );
}
