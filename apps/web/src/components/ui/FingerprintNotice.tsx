import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { cn } from './cn';
import { Button } from './Button';
import { copyText } from './clipboard';

/**
 * Aviso de fingerprint de nodo (licencias ancladas al hardware/entorno).
 *
 * Muestra el identificador en monoespaciado con botón "Copiar" para enviarlo al
 * proveedor. Explica que la licencia queda vinculada a este nodo: si cambia el
 * hardware/entorno, el fingerprint cambia y la licencia deja de ser válida.
 * Es presentacional (la copia usa el portapapeles del navegador, no el backend).
 */
export function FingerprintNotice({
  fingerprint,
  algorithm = 'SHA-256',
  onCopy,
  className,
}: {
  fingerprint: string;
  algorithm?: string;
  /** Callback opcional al confirmar la copia (p. ej. para analytics/toast). */
  onCopy?: (text: string) => void;
  className?: string;
}) {
  const [copied, setCopied] = useState(false);
  const { t } = useTranslation();

  async function handleCopy() {
    const ok = await copyText(fingerprint);
    if (!ok) return;
    onCopy?.(fingerprint);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <div
      role="note"
      className={cn('flex flex-col gap-3 rounded-md border border-warning bg-warning-soft p-4 text-sm', className)}
    >
      <div className="flex items-start gap-2 text-warning">
        <i className="bi bi-fingerprint leading-none" aria-hidden="true" />
        <div className="flex flex-col gap-1">
          <p className="font-semibold">{t('license.fingerprintTitle')}</p>
          <p className="opacity-90">{t('license.fingerprintDesc')}</p>
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <code className="break-all rounded bg-surface px-2 py-1 font-mono text-xs">{fingerprint}</code>
        <Button type="button" variant="secondary" size="sm" onClick={handleCopy}>
          <i className={cn('bi', copied ? 'bi-check' : 'bi-copy')} aria-hidden="true" />
          {copied ? t('license.copied') : t('common.copy')}
        </Button>
      </div>
      {algorithm && <p className="text-xs text-muted">{t('license.algorithm', { algorithm })}</p>}
    </div>
  );
}
