import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { useAuthStore } from '../../lib/auth-store';
import { Alert } from '../../components/ui/Alert';
import { Badge } from '../../components/ui/Badge';
import { Button } from '../../components/ui/Button';
import { Card } from '../../components/ui/Card';
import { EmptyState } from '../../components/ui/EmptyState';
import { Spinner } from '../../components/ui/Spinner';
import { formatDate } from '../../lib/format';
import {
  fetchDeviceConfig,
  getConfigVersion,
  listConfigVersions,
  publishConfigVersion,
  saveDeviceConfig,
  type IotConfigVersionStatus,
} from './iot-api';

// ponytail: editor JSON plano en <textarea>. Un formulario schema-driven para
// network/system/sensors/rules/gpio es otro proyecto (si el firmware expone /config/schema).
const pretty = (v: unknown): string => JSON.stringify(v, null, 2);

// Ordena claves recursivamente: la comparación de dirty no debe depender del orden de claves.
const stableStringify = (v: unknown): string => {
  if (v === null || typeof v !== 'object') return JSON.stringify(v);
  if (Array.isArray(v)) return `[${v.map(stableStringify).join(',')}]`;
  return `{${Object.entries(v as Record<string, unknown>)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([k, val]) => `${JSON.stringify(k)}:${stableStringify(val)}`)
    .join(',')}}`;
};

const STATUS_TONE: Record<IotConfigVersionStatus, 'success' | 'danger' | 'neutral'> = {
  applied: 'success',
  failed: 'danger',
  draft: 'neutral',
};

type ParseResult =
  | { ok: true; value: unknown; error: null }
  | { ok: false; value: undefined; error: string };

/** Panel de configuración versionada del dispositivo (task-34). */
export function DeviceConfigPanel({
  basePath,
  deviceId,
}: {
  basePath: string;
  deviceId: string;
}) {
  const { t } = useTranslation();
  const canWrite = useAuthStore((s) => s.hasPermission)('iot.write');
  const qc = useQueryClient();

  const [editorText, setEditorText] = useState('');
  const [loadedText, setLoadedText] = useState('');
  const [result, setResult] = useState<{ ok: boolean; message: string } | null>(null);

  const versionsQuery = useQuery({
    queryKey: ['iot-config-versions', basePath, deviceId],
    queryFn: () => listConfigVersions(basePath, deviceId),
    enabled: canWrite,
    retry: 1,
  });

  const readMutation = useMutation({
    mutationFn: () => fetchDeviceConfig(basePath, deviceId),
    onSuccess: (config) => {
      if (isDirty && !window.confirm(t('iot.config.discardConfirm'))) return;
      const text = pretty(config);
      setEditorText(text);
      setLoadedText(text);
      setResult(null);
    },
  });

  const saveMutation = useMutation({
    mutationFn: ({ config, publish }: { config: unknown; publish: boolean }) =>
      saveDeviceConfig(basePath, deviceId, { config, publish }),
    onSuccess: (res) => {
      void qc.invalidateQueries({ queryKey: ['iot-config-versions', basePath, deviceId] });
      const v = res.version;
      if (v.status === 'failed') {
        setResult({ ok: false, message: v.error ?? t('iot.config.failed') });
      } else if (v.status === 'applied') {
        setResult({ ok: true, message: t('iot.config.applied') });
      } else {
        setResult({ ok: true, message: t('iot.config.draftSaved') });
      }
      if (v.status !== 'failed') setLoadedText(editorText);
    },
  });

  const publishMutation = useMutation({
    mutationFn: (version: number) => publishConfigVersion(basePath, deviceId, version),
    onSuccess: (res) => {
      void qc.invalidateQueries({ queryKey: ['iot-config-versions', basePath, deviceId] });
      const v = res.version;
      if (v.status === 'failed') {
        setResult({ ok: false, message: v.error ?? t('iot.config.failed') });
      } else {
        setResult({ ok: true, message: t('iot.config.applied') });
      }
    },
  });

  const viewMutation = useMutation({
    mutationFn: (version: number) => getConfigVersion(basePath, deviceId, version),
    onSuccess: (v) => {
      if (isDirty && !window.confirm(t('iot.config.discardConfirm'))) return;
      const text = pretty(v.config);
      setEditorText(text);
      setLoadedText(text);
      setResult(null);
    },
  });

  const parsed = useMemo<ParseResult>(() => {
    if (!editorText.trim()) return { ok: false, value: undefined, error: '' };
    try {
      return { ok: true, value: JSON.parse(editorText), error: null };
    } catch (e) {
      return { ok: false, value: undefined, error: e instanceof Error ? e.message : String(e) };
    }
  }, [editorText]);

  // Compara normalizado (JSON.stringify de ambos) para ignorar diferencias de whitespace.
  const normalizedLoaded = useMemo(() => {
    if (!loadedText.trim()) return null;
    try {
      return stableStringify(JSON.parse(loadedText));
    } catch {
      return null;
    }
  }, [loadedText]);

  const isDirty = parsed.ok && stableStringify(parsed.value) !== normalizedLoaded;
  const lastVersion = versionsQuery.data?.[0];

  if (!canWrite) return null;

  const statusLabel = (s: IotConfigVersionStatus) =>
    s === 'draft'
      ? t('iot.config.status.draft')
      : s === 'applied'
        ? t('iot.config.status.applied')
        : t('iot.config.status.failed');

  return (
    <Card>
      <Card.Header>
        <Card.Title className="flex flex-wrap items-center gap-2">
          <i className="bi bi-sliders text-primary" aria-hidden="true" />
          {t('iot.config.title')}
          {lastVersion && <Badge variant={STATUS_TONE[lastVersion.status]}>{statusLabel(lastVersion.status)}</Badge>}
        </Card.Title>
      </Card.Header>
      <Card.Content>
        <div className="flex flex-col gap-3">
          <div className="flex flex-wrap items-center gap-2">
            <Button
              variant="secondary"
              onClick={() => readMutation.mutate()}
              loading={readMutation.isPending}
            >
              <i className="bi bi-arrow-repeat" aria-hidden="true" /> {t('iot.config.read')}
            </Button>
          </div>

          {readMutation.isError && (
            <Alert variant="danger">
              {readMutation.error instanceof Error ? readMutation.error.message : t('common.error')}
            </Alert>
          )}

          <textarea
            className="font-mono text-xs w-full rounded-md border border-border bg-surface p-3"
            rows={16}
            spellCheck={false}
            value={editorText}
            onChange={(e) => {
              setEditorText(e.target.value);
              setResult(null);
            }}
            aria-label={t('iot.config.title')}
          />

          {!parsed.ok && parsed.error && (
            <Alert variant="danger" role="alert" title={t('iot.config.invalidJson')}>
              {parsed.error}
            </Alert>
          )}

          {result && (
            <Alert variant={result.ok ? 'success' : 'danger'} role="status">
              {result.message}
            </Alert>
          )}

          {canWrite && (
            <div className="flex flex-wrap gap-2">
              <Button
                variant="secondary"
                disabled={!parsed.ok || !isDirty}
                loading={saveMutation.isPending}
                onClick={() => parsed.ok && saveMutation.mutate({ config: parsed.value, publish: false })}
              >
                {t('iot.config.saveDraft')}
              </Button>
              <Button
                variant="primary"
                disabled={!parsed.ok || !isDirty}
                loading={saveMutation.isPending}
                onClick={() => parsed.ok && saveMutation.mutate({ config: parsed.value, publish: true })}
              >
                {t('iot.config.publish')}
              </Button>
            </div>
          )}

          <div className="flex items-center gap-2 text-sm text-muted">
            <i className="bi bi-clock-history" aria-hidden="true" />
            {t('iot.config.history')}
          </div>

          {versionsQuery.isLoading ? (
            <div className="flex justify-center py-6">
              <Spinner />
            </div>
          ) : (versionsQuery.data ?? []).length === 0 ? (
            <EmptyState icon="bi-files" title={t('iot.config.empty')} />
          ) : (
            <ul className="flex flex-col gap-2">
              {(versionsQuery.data ?? []).map((v) => (
                <li
                  key={v.id}
                  className="flex flex-wrap items-center gap-2 rounded-md border border-border bg-surface p-2 text-sm"
                >
                  <span className="font-mono text-muted">v{v.version}</span>
                  <Badge variant={STATUS_TONE[v.status]}>{statusLabel(v.status)}</Badge>
                  <span className="text-xs text-muted">{formatDate(v.createdAt)}</span>
                  <span className="font-mono text-xs text-muted" title={v.hash}>
                    {v.hash.slice(0, 8)}
                  </span>
                  {v.status === 'failed' && v.error ? (
                    <span className="min-w-0 flex-1 truncate text-xs text-danger" title={v.error}>
                      {v.error}
                    </span>
                  ) : (
                    <span className="flex-1" />
                  )}
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => viewMutation.mutate(v.version)}
                    loading={viewMutation.isPending}
                  >
                    <i className="bi bi-eye" aria-hidden="true" /> {t('iot.config.view')}
                  </Button>
                  {canWrite && (v.status === 'draft' || v.status === 'failed') && (
                    <Button
                      variant="secondary"
                      size="sm"
                      onClick={() => publishMutation.mutate(v.version)}
                      loading={publishMutation.isPending}
                    >
                      {t('iot.config.publish')}
                    </Button>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>
      </Card.Content>
    </Card>
  );
}
