import { useEffect, useState, type ReactNode } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api, ApiClientError } from '../../lib/api';
import { useAuthStore } from '../../lib/auth-store';
import { Button } from '../../components/ui/Button';
import { UpdateStatus, type UpdatePhase } from '../../components/ui/UpdateStatus';
import { Changelog, type ReleaseNote } from '../../components/ui/Changelog';
import { RawUpdateView } from './RawUpdateView';
import { useTranslation } from 'react-i18next';
import {
  appPhaseToUi,
  isBusyAppPhase,
  type AppUpdateInfo,
  type AppUpdateRecord,
} from './updates-api';

/** Convierte el changelog markdown del release de GitHub en notas de UI. */
function toReleases(info: AppUpdateInfo): ReleaseNote[] {
  if (!info.changelog) return [];
  const notes = info.changelog
    .split('\n')
    .map((line) => line.replace(/^#+\s*/, '').replace(/^[-*]\s+/, '').trim())
    .filter((line) => line.length > 0);
  if (notes.length === 0) return [];
  return [
    {
      id: info.tag ?? info.latest,
      version: info.latest,
      date: info.publishedAt ? new Date(info.publishedAt).toLocaleDateString() : undefined,
      notes,
      latest: true,
    },
  ];
}

/**
 * Actualizador de la APP (t29). Reusa el contrato ADR-0010 y los componentes
 * de t24 (`UpdateStatus` + `Changelog`). Hace polling del estado mientras la
 * actualización está en curso y ofrece rollback cuando hay una versión previa
 * preservada. `compact` oculta el changelog (para la sección de Ajustes).
 */
export function AppUpdater({ compact = false }: { compact?: boolean }) {
  const qc = useQueryClient();
  const canWrite = useAuthStore((s) => s.hasPermission)('setting.write');
  const canRaw = useAuthStore((s) => s.hasPermission)('update.manage');
  const [activeId, setActiveId] = useState<string | null>(null);
  const [rollingBack, setRollingBack] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [showRaw, setShowRaw] = useState(false);
  const { t } = useTranslation();

  const { data: info, isFetching } = useQuery({
    queryKey: ['app-update-check'],
    queryFn: () =>
      api.post<{ app: AppUpdateInfo }>('/api/v1/system/update/check').then((r) => r.app),
  });

  const { data: record } = useQuery({
    queryKey: ['app-update-status', activeId],
    queryFn: () =>
      api.get<AppUpdateRecord>(`/api/v1/system/update/status?updateId=${activeId}`),
    enabled: !!activeId,
    refetchInterval: (query) => {
      const d = query.state.data as AppUpdateRecord | undefined;
      return d && !isBusyAppPhase(d.phase) ? false : 2000;
    },
  });

  const apply = useMutation({
    mutationFn: () => api.post<AppUpdateRecord>('/api/v1/system/update/apply', { target: 'app' }),
    onSuccess: (r) => {
      setActionError(null);
      setRollingBack(false);
      setActiveId(r.updateId);
    },
    onError: (e) => setActionError(errorMessage(e)),
  });

  const rollback = useMutation({
    mutationFn: () => api.post<AppUpdateRecord>('/api/v1/system/update/rollback'),
    onSuccess: (r) => {
      setActionError(null);
      setRollingBack(true);
      setActiveId(r.updateId);
    },
    onError: (e) => setActionError(errorMessage(e)),
  });

  // Cuando la operación alcanza un estado terminal, refrescamos el check para
  // reflejar la nueva versión instalada.
  useEffect(() => {
    if (record && !isBusyAppPhase(record.phase)) {
      void qc.invalidateQueries({ queryKey: ['app-update-check'] });
    }
  }, [record, qc]);

  const busy = record && isBusyAppPhase(record.phase) ? record : null;
  const terminal = record && !isBusyAppPhase(record.phase) ? record : null;

  let phase: UpdatePhase;
  let currentVersion: string | undefined;
  let targetVersion: string | undefined;
  let message: string | undefined;

  if (busy) {
    phase = rollingBack ? 'rolling-back' : appPhaseToUi(busy.phase);
    currentVersion = busy.fromVersion;
    targetVersion = busy.toVersion;
    if (rollingBack) {
      message = 'Restaurando la versión anterior sin interrupción…';
    }
  } else if (terminal) {
    phase = terminal.phase === 'failed' ? 'error' : 'success';
    currentVersion = terminal.fromVersion;
    targetVersion = terminal.toVersion;
    message =
      terminal.phase === 'failed'
        ? terminal.error
        : terminal.phase === 'rolled_back'
          ? 'Versión anterior restaurada.'
          : 'Actualización aplicada sin interrupción.';
  } else if (isFetching && !info) {
    phase = 'checking';
  } else if (info?.hasUpdate) {
    phase = 'available';
    currentVersion = info.version;
    targetVersion = info.latest;
  } else {
    phase = 'up-to-date';
    currentVersion = info?.version;
  }

  const action: ReactNode[] = [];
  if (!busy) {
    action.push(
      <Button
        key="check"
        variant="secondary"
        loading={isFetching}
        onClick={() => void qc.invalidateQueries({ queryKey: ['app-update-check'] })}
      >
        {isFetching ? 'Buscando…' : 'Buscar actualizaciones'}
      </Button>,
    );
    if (info?.hasUpdate && canWrite) {
      action.push(
        <Button key="apply" loading={apply.isPending} onClick={() => apply.mutate()}>
          Actualizar app
        </Button>,
      );
    }
    if (info && canRaw) {
      action.push(
        <Button key="raw" variant="ghost" size="sm" onClick={() => setShowRaw((v) => !v)}>
          {showRaw ? t('updates.rawHide') : t('updates.rawView')}
        </Button>,
      );
    }
    if (terminal?.phase === 'done' && canWrite) {
      action.push(
        <Button key="rollback" variant="secondary" loading={rollback.isPending} onClick={() => rollback.mutate()}>
          Restaurar versión anterior
        </Button>,
      );
    }
  }

  return (
    <div className="flex flex-col gap-3">
      <UpdateStatus
        phase={phase}
        currentVersion={currentVersion}
        targetVersion={targetVersion}
        message={message ?? actionError ?? undefined}
        action={action.length > 0 ? action : undefined}
      />
      {(phase === 'available' || phase === 'installing' || phase === 'rolling-back') && (
        <p className="text-sm text-muted" role="note">
          <i className="bi bi-shield-check" aria-hidden="true" /> Actualización zero-downtime: el
          servicio se actualiza sin interrupción del tráfico.
        </p>
      )}
      {!compact && info && toReleases(info).length > 0 && (
        <Changelog releases={toReleases(info)} />
      )}
      {showRaw && info && (
        <RawUpdateView target="app" version={info.latest || info.version} />
      )}
    </div>
  );
}

function errorMessage(e: unknown): string {
  return e instanceof ApiClientError ? e.message : e instanceof Error ? e.message : 'Error inesperado';
}
