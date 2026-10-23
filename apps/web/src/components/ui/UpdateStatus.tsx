import type { ReactNode } from 'react';
import { cn } from './cn';
import { Badge } from './Badge';
import { Progress } from './Progress';

export type UpdatePhase =
  | 'checking'
  | 'up-to-date'
  | 'available'
  | 'downloading'
  | 'installing'
  | 'success'
  | 'error'
  | 'rolling-back';

type Tone = 'neutral' | 'primary' | 'success' | 'warning' | 'danger' | 'info';

interface PhaseMeta {
  label: string;
  tone: Tone;
  icon: string;
}

const PHASES: Record<UpdatePhase, PhaseMeta> = {
  checking: { label: 'Buscando actualizaciones…', tone: 'info', icon: 'bi-search' },
  'up-to-date': { label: 'Estás al día', tone: 'success', icon: 'bi-check-circle' },
  available: { label: 'Actualización disponible', tone: 'primary', icon: 'bi-cloud-arrow-down' },
  downloading: { label: 'Descargando…', tone: 'info', icon: 'bi-cloud-download' },
  installing: { label: 'Actualizando sin interrupción…', tone: 'info', icon: 'bi-arrow-repeat' },
  success: { label: 'Actualización aplicada', tone: 'success', icon: 'bi-check-circle' },
  error: { label: 'No se pudo actualizar', tone: 'danger', icon: 'bi-x-octagon' },
  'rolling-back': { label: 'Restaurando versión anterior…', tone: 'warning', icon: 'bi-arrow-counterclockwise' },
};

const BUSY: ReadonlySet<UpdatePhase> = new Set(['checking', 'downloading', 'installing', 'rolling-back']);

/**
 * Estado del ciclo de actualización (sin lógica de backend).
 *
 * Mapea una fase (`checking → available → downloading → installing → success`,
 * con `error`/`rolling-back` como ramas) a una insignia + barra de progreso
 * opcional + mensaje. El slot `action` deja que el consumidor cablee los
 * botones ("Buscar actualizaciones", "Instalar", "Restaurar versión anterior").
 * Durante `installing` la actualización es **sin interrupción**: se muestra
 * como aviso persistente, no como modal bloqueante.
 */
export function UpdateStatus({
  phase,
  progress,
  currentVersion,
  targetVersion,
  message,
  action,
  className,
}: {
  phase: UpdatePhase;
  /** 0–100, solo relevante durante `downloading`/`installing`. */
  progress?: number;
  currentVersion?: string;
  targetVersion?: string;
  /** Detalle libre (p. ej. texto de error accionable). */
  message?: string;
  action?: ReactNode;
  className?: string;
}) {
  const meta = PHASES[phase];
  const busy = BUSY.has(phase);
  const showProgress = progress !== undefined && (phase === 'downloading' || phase === 'installing');

  return (
    <div
      role={phase === 'error' ? 'alert' : 'status'}
      aria-live="polite"
      className={cn('flex flex-col gap-3', className)}
    >
      <div className="flex flex-wrap items-center gap-2">
        {busy && <span className="spinner spinner-sm" aria-hidden="true" />}
        <Badge variant={meta.tone}>
          <i className={cn('bi', meta.icon)} aria-hidden="true" />
          {meta.label}
        </Badge>
        {currentVersion && <span className="font-mono text-sm text-subtle">v{currentVersion}</span>}
        {targetVersion && targetVersion !== currentVersion && (
          <span className="font-mono text-sm text-subtle">→ v{targetVersion}</span>
        )}
      </div>

      {showProgress && (
        <Progress
          value={progress ?? 0}
          max={100}
          tone={phase === 'installing' ? 'info' : 'primary'}
          label="Progreso de la actualización"
        />
      )}

      {message && (
        <p className={cn('text-sm', phase === 'error' ? 'text-danger' : 'text-muted')}>{message}</p>
      )}

      {action && <div className="flex flex-wrap gap-2">{action}</div>}
    </div>
  );
}
