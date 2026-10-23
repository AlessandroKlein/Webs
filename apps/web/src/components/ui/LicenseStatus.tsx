import { useTranslation } from 'react-i18next';
import { cn } from './cn';
import { Badge } from './Badge';

export type LicenseState = 'licensed' | 'trial' | 'expired' | 'unlicensed' | 'grace';

type Tone = 'neutral' | 'primary' | 'success' | 'warning' | 'danger' | 'info';

interface StateMeta {
  labelKey: string;
  tone: Tone;
  icon: string;
}

const STATES: Record<LicenseState, StateMeta> = {
  licensed: { labelKey: 'license.statusLicensed', tone: 'success', icon: 'bi-patch-check' },
  trial: { labelKey: 'license.statusTrial', tone: 'warning', icon: 'bi-hourglass-split' },
  expired: { labelKey: 'license.statusExpired', tone: 'danger', icon: 'bi-x-octagon' },
  unlicensed: { labelKey: 'license.statusUnlicensed', tone: 'neutral', icon: 'bi-dash-circle' },
  grace: { labelKey: 'license.statusGrace', tone: 'info', icon: 'bi-clock-history' },
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
  const { t } = useTranslation();
  const meta = STATES[state];
  return (
    <span className={cn('inline-flex flex-wrap items-center gap-2', className)}>
      <Badge variant={meta.tone}>
        <i className={cn('bi', meta.icon)} aria-hidden="true" />
        {t(meta.labelKey)}
      </Badge>
      {detail && <span className="text-sm text-muted">{detail}</span>}
    </span>
  );
}
