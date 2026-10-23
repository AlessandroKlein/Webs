import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api, ApiClientError } from '../../lib/api';
import { useAuthStore } from '../../lib/auth-store';
import { Button } from '../../components/ui/Button';
import { Badge } from '../../components/ui/Badge';
import { Card } from '../../components/ui/Card';
import { Spinner } from '../../components/ui/Spinner';
import {
  isBusyPluginPhase,
  pluginPhaseLabel,
  type PluginUpdateInfo,
  type PluginUpdateRecord,
} from './updates-api';

/**
 * Actualizador de PLUGINS (t28). Lista las actualizaciones disponibles por
 * plugin instalado (versión instalada vs disponible), permite aplicar la
 * actualización, sigue el progreso por polling y ofrece rollback cuando hay
 * una versión previa preservada.
 */
export function PluginUpdater() {
  const qc = useQueryClient();
  const canWrite = useAuthStore((s) => s.hasPermission)('setting.write');
  const [actionError, setActionError] = useState<string | null>(null);

  const { data: plugins, isFetching } = useQuery({
    queryKey: ['plugin-updates-check'],
    queryFn: () => api.post<PluginUpdateInfo[]>('/api/v1/system/plugins/update/check', {}),
  });

  const { data: records } = useQuery({
    queryKey: ['plugin-updates-status'],
    queryFn: () => api.get<PluginUpdateRecord[]>('/api/v1/system/plugins/update/status'),
    refetchInterval: (query) => {
      const d = query.state.data as PluginUpdateRecord[] | undefined;
      return d && d.some((r) => isBusyPluginPhase(r.phase)) ? 2000 : 10_000;
    },
  });

  const apply = useMutation({
    mutationFn: (pluginId: string) =>
      api.post<PluginUpdateRecord>('/api/v1/system/plugins/update/apply', { pluginId }),
    onSuccess: () => {
      setActionError(null);
      refresh(qc);
    },
    onError: (e) => setActionError(errorMessage(e)),
  });

  const rollback = useMutation({
    mutationFn: (pluginId: string) =>
      api.post<PluginUpdateRecord>('/api/v1/system/plugins/update/rollback', { pluginId }),
    onSuccess: () => {
      setActionError(null);
      refresh(qc);
    },
    onError: (e) => setActionError(errorMessage(e)),
  });

  const recordByPlugin = new Map((records ?? []).map((r) => [r.pluginId, r]));

  return (
    <Card>
      <Card.Header>
        <Card.Title>Plugins</Card.Title>
        <Card.Description>Actualizaciones disponibles por plugin instalado.</Card.Description>
      </Card.Header>
      <Card.Content className="flex flex-col gap-3">
        <div className="flex items-center gap-2">
          <Button
            variant="secondary"
            loading={isFetching}
            onClick={() => void qc.invalidateQueries({ queryKey: ['plugin-updates-check'] })}
          >
            {isFetching ? 'Buscando…' : 'Buscar actualizaciones'}
          </Button>
        </div>

        {actionError && (
          <p className="text-sm text-danger" role="alert" style={{ margin: 0 }}>
            {actionError}
          </p>
        )}

        {isFetching && !plugins ? (
          <Spinner />
        ) : (plugins ?? []).length === 0 ? (
          <p className="muted" style={{ margin: 0 }}>
            No hay plugins instalados.
          </p>
        ) : (
          <ul className="flex flex-col gap-3" style={{ listStyle: 'none', margin: 0, padding: 0 }}>
            {(plugins ?? []).map((p) => {
              const record = recordByPlugin.get(p.pluginId);
              const busy = record && isBusyPluginPhase(record.phase);
              return (
                <li
                  key={p.pluginId}
                  className="flex flex-col gap-2"
                  style={{ borderTop: '1px solid var(--ws-border)', paddingTop: 'var(--ws-space-3)' }}
                >
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-medium text-text">{p.name || p.pluginId}</span>
                    <span className="font-mono text-sm text-subtle">
                      v{p.installedVersion}
                      {p.latestVersion && p.latestVersion !== p.installedVersion
                        ? ` → v${p.latestVersion}`
                        : ''}
                    </span>
                    {busy ? (
                      <Badge variant="info">{pluginPhaseLabel(record.phase)}</Badge>
                    ) : record?.phase === 'failed' ? (
                      <Badge variant="danger">Falló</Badge>
                    ) : record?.phase === 'done' ? (
                      <Badge variant="success">Actualizado</Badge>
                    ) : p.hasUpdate ? (
                      <Badge variant="warning">Actualización disponible</Badge>
                    ) : (
                      <Badge variant="neutral">Al día</Badge>
                    )}
                  </div>

                  {record?.error && (
                    <p className="text-sm text-danger" style={{ margin: 0 }}>
                      {record.error}
                    </p>
                  )}

                  {p.hasUpdate && !record && canWrite && (
                    <div className="flex flex-wrap gap-2">
                      <Button size="sm" loading={apply.isPending} onClick={() => apply.mutate(p.pluginId)}>
                        Actualizar
                      </Button>
                    </div>
                  )}
                  {record?.phase === 'done' && canWrite && (
                    <div className="flex flex-wrap gap-2">
                      <Button
                        size="sm"
                        variant="secondary"
                        loading={rollback.isPending}
                        onClick={() => rollback.mutate(p.pluginId)}
                      >
                        Restaurar versión anterior
                      </Button>
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </Card.Content>
    </Card>
  );
}

function refresh(qc: ReturnType<typeof useQueryClient>): void {
  void qc.invalidateQueries({ queryKey: ['plugin-updates-status'] });
  void qc.invalidateQueries({ queryKey: ['plugin-updates-check'] });
  void qc.invalidateQueries({ queryKey: ['plugins'] });
  void qc.invalidateQueries({ queryKey: ['plugins-catalog'] });
}

function errorMessage(e: unknown): string {
  return e instanceof ApiClientError ? e.message : e instanceof Error ? e.message : 'Error inesperado';
}
