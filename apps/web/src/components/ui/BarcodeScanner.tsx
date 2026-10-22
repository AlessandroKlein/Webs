import { useEffect, useRef, useState, type FormEvent } from 'react';
import { cn } from './cn';
import { Button } from './Button';
import { Input } from './Input';

export type BarcodeStatus = 'idle' | 'listening' | 'processing' | 'error';

export interface BarcodeScannerProps {
  /** Se invoca una única vez por código leído/escrito, ya normalizado. */
  onCode: (code: string) => void;
  placeholder?: string;
  label?: string;
  autoFocus?: boolean;
  /** Habilita un acceso alternativo por cámara (el cliente decide cómo abrirlo). */
  allowCamera?: boolean;
  onRequestCamera?: () => void;
  /** Ms sin pulsaciones que se consideran "fin de lectura" de un lector HID. */
  settleMs?: number;
  disabled?: boolean;
  className?: string;
}

/**
 * Normaliza códigos de lectores externos (HID/keyboard-wedge, serial, cámara):
 * quita saltos de línea/tabulaciones y prefijos AIM/GS1 (p. ej. `]C0`, `]E0`).
 */
export function normalizeBarcode(raw: string): string {
  return raw
    .replace(/[\r\n\t]/g, '')
    .replace(/^\]\w\d/, '')
    .trim();
}

/**
 * Entrada de código de barras para lectores externos.
 *
 * Diseño: un lector HID se comporta como teclado (tipea el código + Enter muy
 * rápido). Este componente mantiene el foco en el input, detecta el Enter y,
 * si no llega, usa un temporizador de "asentamiento" (`settleMs`) para lectores
 * que no envían Enter. También permite escritura manual como fallback.
 *
 * Estados accesibles (aria-live): idle → listening → processing → error.
 */
export function BarcodeScanner({
  onCode,
  placeholder = 'Escaneá o escribí un código…',
  label = 'Lector de código',
  autoFocus = true,
  allowCamera = false,
  onRequestCamera,
  settleMs = 120,
  disabled = false,
  className,
}: BarcodeScannerProps) {
  const [value, setValue] = useState('');
  const [status, setStatus] = useState<BarcodeStatus>('idle');
  const [message, setMessage] = useState('');
  const settleRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (autoFocus) inputRef.current?.focus();
  }, [autoFocus]);

  useEffect(() => {
    return () => {
      if (settleRef.current) clearTimeout(settleRef.current);
    };
  }, []);

  function emit(raw: string) {
    if (settleRef.current) {
      clearTimeout(settleRef.current);
      settleRef.current = null;
    }
    const code = normalizeBarcode(raw);
    if (!code) {
      setStatus('error');
      setMessage('El código está vacío. Escaneá o escribí un código válido.');
      return;
    }
    setStatus('processing');
    setMessage('');
    setValue('');
    onCode(code);
    // Devuelve el foco para encadenar la próxima lectura.
    inputRef.current?.focus();
  }

  function handleChange(next: string) {
    setValue(next);
    if (settleRef.current) clearTimeout(settleRef.current);
    if (!next.trim()) {
      setStatus('idle');
      return;
    }
    setStatus('listening');
    settleRef.current = setTimeout(() => {
      settleRef.current = null;
      emit(next);
    }, settleMs);
  }

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    emit(value);
  }

  const statusText =
    status === 'error'
      ? message
      : status === 'processing'
        ? 'Procesando código…'
        : status === 'listening'
          ? 'Lector externo activo…'
          : 'Lector externo listo.';

  return (
    <form onSubmit={handleSubmit} className={cn('flex flex-col gap-2', className)}>
      {label && <span className="text-sm text-muted">{label}</span>}
      <div className="flex items-center gap-2">
        <div className="relative flex-1">
          <i
            className="bi bi-upc-scan pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-subtle"
            aria-hidden="true"
          />
          <Input
            ref={inputRef}
            value={value}
            onChange={(e) => handleChange(e.target.value)}
            placeholder={placeholder}
            disabled={disabled}
            autoComplete="off"
            spellCheck={false}
            aria-label={label}
            aria-invalid={status === 'error' || undefined}
            className="pl-9"
          />
        </div>
        {allowCamera && onRequestCamera && (
          <Button type="button" variant="secondary" onClick={onRequestCamera} aria-label="Escanear con cámara">
            <i className="bi bi-camera" aria-hidden="true" />
          </Button>
        )}
        <Button type="submit" disabled={disabled || !value.trim()}>
          Buscar
        </Button>
      </div>
      <p
        aria-live="polite"
        className={cn(
          'min-h-4 text-sm',
          status === 'error'
            ? 'text-danger'
            : status === 'processing'
              ? 'text-info'
              : 'text-subtle',
        )}
      >
        {statusText}
      </p>
    </form>
  );
}
