import { cn } from './cn';
import { Badge } from './Badge';

export type LicenseState = 'licensed' | 'trial' | 'expired' | 'unlicensed' | 'grace';

type Tone = 'neutral' | 'primary' | 'success' | 'warning' | 'danger' | 'info';

interface StateMeta {
  label: string;
  tone: Tone;
  icon: string;
}

const STATES: Record<LicenseState, StateMeta> = {
  licensed: { label: 'Licenciado', tone: 'success', icon: 'bi-patch-check' },
  trial: { label: 'Prueba', tone: 'warning', icon: 'bi-hourglass-split' },
  expired: { label: 'Vencida', tone: 'danger', icon: 'bi-x-octagon' },
  unlicensed: { label: 'Sin licencia', tone: 'neutral', icon: 'bi-dash-circle' },
  grace: { label: 'Periodo de gracia', tone: 'info', icon: 'bi-clock-history' },
};

/**
 * Estado de la licencia (sin lógica de backend): insignia semántica con icono
 * y detalle opcional (p. ej. "vence el 2026-12-31" o "quedan 4 días de prueba").
 */
export function LicenseStatus({
  state,
  detail,
  className,
}: {
  state: LicenseState;
  detail?: string;
  className?: string;
}) {
  const meta = STATES[state];
  return (
    <span className={cn('inline-flex flex-wrap items-center gap-2', className)}>
      <Badge variant={meta.tone}>
        <i className={cn('bi', meta.icon)} aria-hidden="true" />
        {meta.label}
      </Badge>
      {detail && <span className="text-sm text-muted">{detail}</span>}
    </span>
  );
}
