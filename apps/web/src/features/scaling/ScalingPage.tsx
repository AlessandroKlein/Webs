import { useEffect, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { api, downloadFile, ApiClientError } from '../../lib/api';
import { useAuthStore } from '../../lib/auth-store';
import { Card } from '../../components/ui/Card';
import { Button } from '../../components/ui/Button';
import { Badge } from '../../components/ui/Badge';
import { Spinner } from '../../components/ui/Spinner';
import { TextField } from '../../components/ui/TextField';
import { SegmentedControl } from '../../components/ui/SegmentedControl';

type ScalingMode = 'horizontal' | 'vertical';
type VpaUpdateMode = 'Auto' | 'Off' | 'Initial';

interface ScalingHpa {
  min: number;
  max: number;
  cpuTargetPct: number;
  memTargetPct: number;
}

interface ScalingVpa {
  updateMode: VpaUpdateMode;
  minAllowed: { cpu: string; memory: string };
  maxAllowed: { cpu: string; memory: string };
}

interface ScalingWorkload {
  name: string;
  mode: ScalingMode;
  hpa: ScalingHpa;
  vpa: ScalingVpa;
}

interface ScalingRecommendation {
  workload?: string;
  container?: string;
  cpu?: string;
  memory?: string;
}

interface ScalingResponse {
  workloads: ScalingWorkload[];
  updatedAt: string;
  /** Recomendaciones VPA (opcional; el backend las expone cuando las hay). */
  recommendations?: ScalingRecommendation[];
}

const cloneWorkload = (w: ScalingWorkload): ScalingWorkload => ({
  name: w.name,
  mode: w.mode,
  hpa: { ...w.hpa },
  vpa: {
    updateMode: w.vpa.updateMode,
    minAllowed: { ...w.vpa.minAllowed },
    maxAllowed: { ...w.vpa.maxAllowed },
  },
});

/** Espejo client-side de la guarda de exclusión 422 del backend (ADR-0025 #4). */
function workloadConflict(w: ScalingWorkload): 'horizontal' | 'vertical' | null {
  if (w.mode === 'horizontal') {
    if (w.vpa.updateMode === 'Auto' || w.vpa.updateMode === 'Initial') {
      return 'horizontal';
    }
    return null;
  }
  if (w.hpa.cpuTargetPct > 0 || w.hpa.memTargetPct > 0) {
    return 'vertical';
  }
  return null;
}

export function ScalingPage() {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const hasPermission = useAuthStore((s) => s.hasPermission);
  const canWrite = hasPermission('scaling.write');

  const { data, isLoading, isError, error } = useQuery({
    queryKey: ['system-scaling'],
    queryFn: () => api.get<ScalingResponse>('/api/v1/system/scaling'),
    retry: 1,
  });

  const [draft, setDraft] = useState<ScalingWorkload[] | null>(null);
  const [toast, setToast] = useState<{ kind: 'success' | 'error'; msg: string } | null>(null);
  const toastTimer = useRef<number | null>(null);

  useEffect(() => {
    if (data?.workloads) setDraft(data.workloads.map(cloneWorkload));
  }, [data]);

  useEffect(() => {
    return () => {
      if (toastTimer.current) window.clearTimeout(toastTimer.current);
    };
  }, []);

  const notify = (kind: 'success' | 'error', msg: string) => {
    setToast({ kind, msg });
    if (toastTimer.current) window.clearTimeout(toastTimer.current);
    toastTimer.current = window.setTimeout(() => setToast(null), 4000);
  };

  const save = useMutation({
    mutationFn: (workloads: ScalingWorkload[]) => api.put('/api/v1/system/scaling', { workloads }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['system-scaling'] });
      notify('success', t('scaling.saved'));
    },
    onError: (err: unknown) => {
      const msg = err instanceof ApiClientError ? err.message : t('scaling.saveError');
      notify('error', msg);
    },
  });

  const exportYaml = async (workload: string) => {
    try {
      await downloadFile(`/api/v1/system/scaling/export?workload=${workload}&format=yaml`, `${workload}-scaling.yaml`);
    } catch {
      notify('error', t('scaling.exportError'));
    }
  };

  const updateWorkload = (name: string, patch: (w: ScalingWorkload) => ScalingWorkload) => {
    setDraft((prev) => (prev ? prev.map((w) => (w.name === name ? patch(w) : w)) : prev));
  };

  const conflicts = (draft ?? []).map((w) => ({ name: w.name, kind: workloadConflict(w) }));
  const hasConflict = conflicts.some((c) => c.kind !== null);

  const recommendations = data?.recommendations ?? [];
  const recsFor = (name: string) => recommendations.filter((r) => !r.workload || r.workload === name);

  if (isLoading) {
    return (
      <div className="stack" style={{ padding: 'var(--ws-space-6)' }}>
        <Spinner label={t('common.loading')} />
      </div>
    );
  }

  if (isError) {
    return (
      <div className="stack" style={{ padding: 'var(--ws-space-6)', gap: 'var(--ws-space-3)' }}>
        <h1 style={{ margin: 0 }}>{t('scaling.title')}</h1>
        <Badge variant="danger">{t('scaling.loadError')}</Badge>
        <p className="muted" style={{ margin: 0 }}>
          {error instanceof ApiClientError ? error.message : String(error)}
        </p>
      </div>
    );
  }

  return (
    <div className="stack" style={{ gap: 'var(--ws-space-4)' }}>
      <div className="row" style={{ justifyContent: 'space-between', alignItems: 'flex-end', gap: 'var(--ws-space-3)' }}>
        <div className="stack" style={{ gap: 2 }}>
          <h1 style={{ margin: 0 }}>{t('scaling.title')}</h1>
          <p className="muted" style={{ margin: 0 }}>{t('scaling.subtitle')}</p>
        </div>
        {data?.updatedAt && (
          <span className="muted" style={{ fontSize: 'var(--ws-font-size-sm)' }}>
            {t('scaling.updatedAt')}: {new Date(data.updatedAt).toLocaleString()}
          </span>
        )}
      </div>

      {toast && (
        <div
          role={toast.kind === 'error' ? 'alert' : 'status'}
          aria-live="polite"
          className="row"
          style={{
            alignItems: 'center',
            gap: 'var(--ws-space-2)',
            padding: 'var(--ws-space-2) var(--ws-space-3)',
            borderRadius: 'var(--ws-radius-md)',
            border: '1px solid var(--ws-border)',
            background: toast.kind === 'error' ? 'var(--ws-danger-soft, rgba(239,68,68,0.12))' : 'var(--ws-success-soft, rgba(34,197,94,0.12))',
          }}
        >
          <i className={`bi ${toast.kind === 'error' ? 'bi-x-octagon text-danger' : 'bi-check-circle text-success'}`} />
          <span className="text-sm">{toast.msg}</span>
        </div>
      )}

      {(draft ?? []).map((w) => {
        const conflictKind = conflicts.find((c) => c.name === w.name)?.kind ?? null;
        const recs = recsFor(w.name);
        return (
          <WorkloadCard
            key={w.name}
            workload={w}
            conflict={conflictKind}
            canWrite={canWrite}
            recommendations={recs}
            onChange={(patch) => updateWorkload(w.name, patch)}
            onExport={() => void exportYaml(w.name)}
          />
        );
      })}

      <div className="row" style={{ justifyContent: 'flex-end', gap: 'var(--ws-space-2)' }}>
        {hasConflict && (
          <span className="text-sm text-danger" style={{ display: 'inline-flex', alignItems: 'center', gap: 'var(--ws-space-2)' }}>
            <i className="bi bi-exclamation-triangle" /> {t('scaling.conflictSummary')}
          </span>
        )}
        <Button
          variant="primary"
          loading={save.isPending}
          disabled={!canWrite || hasConflict || !draft}
          onClick={() => draft && save.mutate(draft)}
        >
          <i className="bi bi-check-lg" /> {t('common.save')}
        </Button>
      </div>
    </div>
  );
}

function WorkloadCard({
  workload,
  conflict,
  canWrite,
  recommendations,
  onChange,
  onExport,
}: {
  workload: ScalingWorkload;
  conflict: 'horizontal' | 'vertical' | null;
  canWrite: boolean;
  recommendations: ScalingRecommendation[];
  onChange: (patch: (w: ScalingWorkload) => ScalingWorkload) => void;
  onExport: () => void;
}) {
  const { t } = useTranslation();

  const setMode = (mode: ScalingMode) => onChange((w) => ({ ...w, mode }));
  const setVpaMode = (updateMode: VpaUpdateMode) => onChange((w) => ({ ...w, vpa: { ...w.vpa, updateMode } }));

  const setHpa = (patch: Partial<ScalingHpa>) =>
    onChange((w) => ({ ...w, hpa: { ...w.hpa, ...patch } }));
  const setVpaLimit = (which: 'minAllowed' | 'maxAllowed', field: 'cpu' | 'memory', value: string) =>
    onChange((w) => ({ ...w, vpa: { ...w.vpa, [which]: { ...w.vpa[which], [field]: value } } }));

  return (
    <Card>
      <Card.Header>
        <div className="row" style={{ justifyContent: 'space-between', gap: 'var(--ws-space-2)' }}>
          <div className="row" style={{ gap: 'var(--ws-space-2)' }}>
            <Card.Title>{workload.name}</Card.Title>
            <Badge variant={workload.mode === 'horizontal' ? 'primary' : 'info'}>
              {workload.mode === 'horizontal' ? t('scaling.modeHorizontal') : t('scaling.modeVertical')}
            </Badge>
          </div>
          <Button variant="secondary" size="sm" onClick={onExport}>
            <i className="bi bi-download" /> {t('scaling.exportYaml')}
          </Button>
        </div>
      </Card.Header>
      <Card.Content>
        <div className="stack" style={{ gap: 'var(--ws-space-4)' }}>
          <div className="field">
            <label className="form-label">{t('scaling.mode')}</label>
            <SegmentedControl
              ariaLabel={t('scaling.mode')}
              value={workload.mode}
              onChange={(v) => setMode(v as ScalingMode)}
              options={[
                { value: 'horizontal', label: t('scaling.modeHorizontal'), icon: 'bi-arrow-left-right' },
                { value: 'vertical', label: t('scaling.modeVertical'), icon: 'bi-arrow-up-down' },
              ]}
            />
          </div>

          {workload.mode === 'horizontal' ? (
            <div className="grid-2">
              <TextField
                label={t('scaling.hpaMin')}
                type="number"
                min={1}
                value={workload.hpa.min}
                disabled={!canWrite}
                onChange={(e) => setHpa({ min: Number(e.target.value) })}
              />
              <TextField
                label={t('scaling.hpaMax')}
                type="number"
                min={1}
                value={workload.hpa.max}
                disabled={!canWrite}
                onChange={(e) => setHpa({ max: Number(e.target.value) })}
              />
              <TextField
                label={t('scaling.cpuTarget')}
                type="number"
                min={0}
                max={100}
                value={workload.hpa.cpuTargetPct}
                disabled={!canWrite}
                onChange={(e) => setHpa({ cpuTargetPct: Number(e.target.value) })}
              />
              <TextField
                label={t('scaling.memTarget')}
                type="number"
                min={0}
                max={100}
                value={workload.hpa.memTargetPct}
                disabled={!canWrite}
                onChange={(e) => setHpa({ memTargetPct: Number(e.target.value) })}
              />
            </div>
          ) : (
            <div className="stack" style={{ gap: 'var(--ws-space-3)' }}>
              <div className="field">
                <label className="form-label">{t('scaling.vpaMode')}</label>
                <SegmentedControl
                  ariaLabel={t('scaling.vpaMode')}
                  value={workload.vpa.updateMode}
                  onChange={(v) => setVpaMode(v as VpaUpdateMode)}
                  options={[
                    { value: 'Auto', label: t('scaling.vpaAuto'), description: t('scaling.vpaAutoDesc') },
                    { value: 'Off', label: t('scaling.vpaRecommender'), description: t('scaling.vpaRecommenderDesc') },
                    { value: 'Initial', label: t('scaling.vpaInitial'), description: t('scaling.vpaInitialDesc') },
                  ]}
                />
              </div>
              <div className="grid-2">
                <TextField
                  label={t('scaling.minCpu')}
                  placeholder="250m"
                  value={workload.vpa.minAllowed.cpu}
                  disabled={!canWrite}
                  onChange={(e) => setVpaLimit('minAllowed', 'cpu', e.target.value)}
                />
                <TextField
                  label={t('scaling.maxCpu')}
                  placeholder="1000m"
                  value={workload.vpa.maxAllowed.cpu}
                  disabled={!canWrite}
                  onChange={(e) => setVpaLimit('maxAllowed', 'cpu', e.target.value)}
                />
                <TextField
                  label={t('scaling.minMem')}
                  placeholder="128Mi"
                  value={workload.vpa.minAllowed.memory}
                  disabled={!canWrite}
                  onChange={(e) => setVpaLimit('minAllowed', 'memory', e.target.value)}
                />
                <TextField
                  label={t('scaling.maxMem')}
                  placeholder="1Gi"
                  value={workload.vpa.maxAllowed.memory}
                  disabled={!canWrite}
                  onChange={(e) => setVpaLimit('maxAllowed', 'memory', e.target.value)}
                />
              </div>
            </div>
          )}

          {conflict && (
            <div
              role="alert"
              className="row"
              style={{
                alignItems: 'center',
                gap: 'var(--ws-space-2)',
                padding: 'var(--ws-space-2) var(--ws-space-3)',
                borderRadius: 'var(--ws-radius-md)',
                background: 'var(--ws-danger-soft, rgba(239,68,68,0.12))',
                color: 'var(--ws-danger)',
              }}
            >
              <i className="bi bi-exclamation-triangle" />
              <span className="text-sm">{conflict === 'horizontal' ? t('scaling.conflictHorizontal') : t('scaling.conflictVertical')}</span>
            </div>
          )}

          {recommendations.length > 0 && (
            <div className="stack" style={{ gap: 'var(--ws-space-2)' }}>
              <span className="muted text-sm" style={{ display: 'inline-flex', alignItems: 'center', gap: 'var(--ws-space-2)' }}>
                <i className="bi bi-magic" /> {t('scaling.recommendations')}
              </span>
              <div className="row" style={{ gap: 'var(--ws-space-2)', flexWrap: 'wrap' }}>
                {recommendations.map((r, i) => (
                  <Badge key={i} variant="info">
                    {r.cpu ? `CPU ${r.cpu}` : ''}
                    {r.cpu && r.memory ? ' · ' : ''}
                    {r.memory ? `Mem ${r.memory}` : ''}
                  </Badge>
                ))}
              </div>
            </div>
          )}
        </div>
      </Card.Content>
    </Card>
  );
}
