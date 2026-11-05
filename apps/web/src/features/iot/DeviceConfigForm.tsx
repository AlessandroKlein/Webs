import { useState, type FormEvent } from 'react';
import { useMutation } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { Alert } from '../../components/ui/Alert';
import { Button } from '../../components/ui/Button';
import { TextField } from '../../components/ui/TextField';
import {
  AUTH_MODES,
  DEVICE_KINDS,
  createDevice,
  testDevice,
  updateDevice,
  type DeviceInput,
  type IotAuthMode,
  type IotDevice,
  type IotDeviceKind,
  type TestResult,
} from './iot-api';

type TestState = 'idle' | 'connecting' | 'connected' | 'error';

/**
 * Formulario de conexión de un dispositivo IoT (alta/edición).
 *
 * Campos mínimos de conexión (URL/IP + token con toggle de visibilidad) más los
 * metadatos necesarios para registrar el dispositivo. "Probar conexión" sólo se
 * habilita al editar (el test del plugin requiere un dispositivo ya guardado).
 */
export function DeviceConfigForm({
  basePath,
  device,
  onSaved,
  onCancel,
}: {
  basePath: string;
  device?: IotDevice;
  onSaved?: (device: IotDevice) => void;
  onCancel?: () => void;
}) {
  const { t } = useTranslation();
  const [name, setName] = useState(device?.name ?? '');
  const [baseUrl, setBaseUrl] = useState(device?.baseUrl ?? '');
  const [kind, setKind] = useState<IotDeviceKind>(device?.kind ?? 'invernadero');
  const [authMode, setAuthMode] = useState<IotAuthMode>(device?.authMode ?? 'bearer');
  const [token, setToken] = useState('');
  const [showToken, setShowToken] = useState(false);
  const [pollIntervalMs, setPollIntervalMs] = useState(String(device?.pollIntervalMs ?? 30000));
  const [enabled, setEnabled] = useState(device?.enabled ?? true);
  const [testState, setTestState] = useState<TestState>('idle');
  const [testError, setTestError] = useState('');

  const save = useMutation({
    mutationFn: (input: DeviceInput) =>
      device ? updateDevice(basePath, device.id, input) : createDevice(basePath, input),
    onSuccess: (saved) => onSaved?.(saved),
  });

  const test = useMutation({
    mutationFn: () => testDevice(basePath, device!.id),
    onMutate: () => {
      setTestState('connecting');
      setTestError('');
    },
    onSuccess: (res: TestResult) => {
      if (res.ok) setTestState('connected');
      else {
        setTestState('error');
        setTestError(res.error ?? t('iot.testFailed'));
      }
    },
    onError: () => {
      setTestState('error');
      setTestError(t('common.error'));
    },
  });

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    save.mutate({
      name: name.trim(),
      baseUrl: baseUrl.trim(),
      kind,
      authMode,
      token: token || undefined,
      pollIntervalMs: Number(pollIntervalMs) || undefined,
      enabled,
    });
  }

  const testStatus =
    testState === 'connecting'
      ? t('iot.connecting')
      : testState === 'connected'
        ? t('iot.connected')
        : testState === 'error'
          ? t('iot.connectionError')
          : '';

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4">
      <TextField
        label={t('iot.name')}
        value={name}
        onChange={(e) => setName(e.target.value)}
        required
      />
      <TextField
        label={t('iot.baseUrl')}
        placeholder="http://192.168.1.50"
        hint={t('iot.baseUrlHint')}
        value={baseUrl}
        onChange={(e) => setBaseUrl(e.target.value)}
        required
      />

      <div className="grid-2">
        <label className="field">
          <span className="form-label">{t('iot.kind')}</span>
          <select
            className="form-select"
            value={kind}
            onChange={(e) => setKind(e.target.value as IotDeviceKind)}
          >
            {DEVICE_KINDS.map((k) => (
              <option key={k} value={k}>
                {t(`iot.kind.${k}`)}
              </option>
            ))}
          </select>
        </label>
        <label className="field">
          <span className="form-label">{t('iot.authMode')}</span>
          <select
            className="form-select"
            value={authMode}
            onChange={(e) => setAuthMode(e.target.value as IotAuthMode)}
          >
            {AUTH_MODES.map((m) => (
              <option key={m} value={m}>
                {t(`iot.auth.${m}`)}
              </option>
            ))}
          </select>
        </label>
      </div>

      <div className="field">
        <span className="form-label">{t('iot.token')}</span>
        <div className="flex items-center gap-2">
          <input
            type={showToken ? 'text' : 'password'}
            className="input form-control"
            value={token}
            placeholder={device ? t('iot.tokenKeep') : t('iot.tokenPlaceholder')}
            onChange={(e) => setToken(e.target.value)}
            autoComplete="off"
            spellCheck={false}
          />
          <Button
            type="button"
            variant="secondary"
            onClick={() => setShowToken((s) => !s)}
            aria-label={t('iot.toggleToken')}
            title={t('iot.toggleToken')}
          >
            <i className={`bi ${showToken ? 'bi-eye-slash' : 'bi-eye'}`} aria-hidden="true" />
          </Button>
        </div>
      </div>

      <div className="grid-2">
        <TextField
          label={t('iot.pollIntervalMs')}
          type="number"
          min={1000}
          step={1000}
          hint={t('iot.pollIntervalHint')}
          value={pollIntervalMs}
          onChange={(e) => setPollIntervalMs(e.target.value)}
        />
        <label className="field" style={{ justifyContent: 'flex-end' }}>
          <span className="inline-flex items-center gap-2">
            <input
              type="checkbox"
              className="form-check-input"
              checked={enabled}
              onChange={(e) => setEnabled(e.target.checked)}
            />
            <span className="form-label">{t('common.enabled')}</span>
          </span>
        </label>
      </div>

      {device && (
        <div className="flex flex-wrap items-center gap-3">
          <Button
            type="button"
            variant="secondary"
            onClick={() => test.mutate()}
            disabled={test.isPending}
          >
            {test.isPending ? t('iot.connecting') : t('iot.testConnection')}
          </Button>
          {testStatus && (
            <span
              aria-live="polite"
              className={`text-sm ${
                testState === 'connected'
                  ? 'text-success'
                  : testState === 'error'
                    ? 'text-danger'
                    : 'text-muted'
              }`}
            >
              {testStatus}
            </span>
          )}
        </div>
      )}
      {testState === 'error' && testError && (
        <Alert variant="danger">{testError}</Alert>
      )}

      <div className="flex items-center gap-2">
        <Button type="submit" loading={save.isPending}>
          {device ? t('common.save') : t('common.create')}
        </Button>
        {onCancel && (
          <Button type="button" variant="ghost" onClick={onCancel}>
            {t('common.cancel')}
          </Button>
        )}
      </div>
    </form>
  );
}
