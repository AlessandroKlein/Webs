import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api, downloadFile, getText } from '../../lib/api';
import { Button } from '../../components/ui/Button';
import { Badge } from '../../components/ui/Badge';
import { SegmentedControl } from '../../components/ui/SegmentedControl';
import { Spinner } from '../../components/ui/Spinner';
import { copyText } from '../../components/ui/clipboard';
import { CodeBlock, type RawFormat } from './SyntaxHighlight';
import type { RawUpdatePayload } from './updates-api';
import { useTranslation } from 'react-i18next';

/**
 * Panel RAW/Code (ADR-0026) para una actualización disponible (app o plugin).
 *
 * Muestra el payload crudo VERIFICADO y redactado que devuelve
 * `GET /api/v1/system/update/raw` (manifiesto, changelog, archivos, sha256,
 * firma y clave pública) con toggle JSON/YAML, botones Copiar y Descargar.
 * La vista resumida de cada actualizador sigue siendo la default; este panel
 * es un complemento secundario que se abre/cierra con un botón.
 */
export function RawUpdateView({
  target,
  id,
  version,
}: {
  target: 'app' | 'plugin';
  id?: string;
  version?: string;
}) {
  const [format, setFormat] = useState<RawFormat>('json');
  const [copied, setCopied] = useState(false);
  const { t } = useTranslation();

  const jsonQuery = `target=${target}${id ? `&id=${encodeURIComponent(id)}` : ''}${
    version ? `&version=${encodeURIComponent(version)}` : ''
  }&format=json`;
  const yamlQuery = `target=${target}${id ? `&id=${encodeURIComponent(id)}` : ''}${
    version ? `&version=${encodeURIComponent(version)}` : ''
  }&format=yaml`;

  const { data, isFetching, error } = useQuery({
    queryKey: ['update-raw', target, id ?? null, version ?? null],
    queryFn: () => api.get<RawUpdatePayload>(`/api/v1/system/update/raw?${jsonQuery}`),
  });

  const { data: yaml } = useQuery({
    queryKey: ['update-raw-yaml', target, id ?? null, version ?? null],
    queryFn: () => getText(`/api/v1/system/update/raw?${yamlQuery}`),
    enabled: format === 'yaml',
  });

  const code = format === 'json' ? (data ? JSON.stringify(data, null, 2) : '') : (yaml ?? '');

  async function onCopy() {
    if (!code) return;
    const ok = await copyText(code);
    setCopied(ok);
    if (ok) setTimeout(() => setCopied(false), 1600);
  }

  function onDownload() {
    const ext = format === 'json' ? 'json' : 'yaml';
    const filename = `update-raw-${target}.${ext}`;
    const query = format === 'json' ? jsonQuery : yamlQuery;
    void downloadFile(`/api/v1/system/update/raw?${query}`, filename).catch(() => {
      /* el error ya se muestra en el panel */
    });
  }

  if (isFetching && !data) {
    return (
      <div className="flex items-center gap-2" style={{ padding: 'var(--ws-space-3)' }}>
        <Spinner />
        <span className="text-sm text-muted">{t('updates.rawLoading')}</span>
      </div>
    );
  }

  if (error) {
    return (
      <p className="text-sm text-danger" role="alert" style={{ margin: 'var(--ws-space-3)' }}>
        {t('updates.rawError', { message: (error as Error).message })}
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-2" style={{ paddingTop: 'var(--ws-space-3)' }}>
      <div className="flex flex-wrap items-center gap-2">
        {data && (
          <Badge variant="info">
            {data.kind === 'app' ? t('updates.rawApp') : t('updates.rawPlugin')} · v{data.version}
          </Badge>
        )}
        {data?.integrity?.sha256 && (
          <span className="font-mono text-xs text-subtle" title={t('updates.rawShaTitle')}>
            sha256:{data.integrity.sha256.slice(0, 12)}…
          </span>
        )}
        <SegmentedControl
          ariaLabel={t('updates.rawFormatLabel')}
          value={format}
          onChange={(v) => setFormat(v as RawFormat)}
          options={[
            { value: 'json', label: 'JSON' },
            { value: 'yaml', label: 'YAML' },
          ]}
        />
        <Button size="sm" variant="secondary" onClick={() => void onCopy()}>
          {copied ? t('updates.rawCopied') : t('updates.rawCopy')}
        </Button>
        <Button size="sm" variant="secondary" onClick={onDownload}>
          {t('updates.rawDownload', { format })}
        </Button>
      </div>
      <CodeBlock code={code} format={format} />
    </div>
  );
}
