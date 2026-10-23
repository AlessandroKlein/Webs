import { useId, type FormEvent } from 'react';
import { cn } from './cn';
import { Button } from './Button';
import { Input } from './Input';
import { Label } from './Label';

/**
 * Campo de clave de activación de licencia (presentacional, sin backend).
 *
 * Normaliza la entrada (mayúsculas, sin caracteres inválidos, agrupación
 * opcional en bloques) y expone un submit controlado por Enter o por el botón
 * "Activar". El consumidor recibe `onChange` (valor normalizado) y `onSubmit`
 * (disparo de la activación) para conectar su lógica.
 */
export function ActivationKeyField({
  value,
  onChange,
  onSubmit,
  loading = false,
  disabled = false,
  error,
  hint,
  label = 'Clave de activación',
  placeholder = 'XXXX-XXXX-XXXX-XXXX',
  groupSize = 4,
  className,
}: {
  value: string;
  onChange: (value: string) => void;
  onSubmit?: () => void;
  loading?: boolean;
  disabled?: boolean;
  error?: string;
  hint?: string;
  label?: string;
  placeholder?: string;
  /** Tamaño de bloque para agrupar con guiones; `0` desactiva la agrupación. */
  groupSize?: number;
  className?: string;
}) {
  const inputId = useId();
  const describedBy = error ? `${inputId}-error` : hint ? `${inputId}-hint` : undefined;

  function normalize(next: string): string {
    const cleaned = next.toUpperCase().replace(/[^A-Z0-9]/g, '');
    if (!groupSize || groupSize <= 0) return cleaned;
    return cleaned.match(new RegExp(`.{1,${groupSize}}`, 'g'))?.join('-') ?? cleaned;
  }

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!loading && !disabled && value.trim()) onSubmit?.();
  }

  return (
    <form onSubmit={handleSubmit} className={cn('flex flex-col gap-1', className)}>
      <Label htmlFor={inputId}>{label}</Label>
      <div className="flex items-center gap-2">
        <Input
          id={inputId}
          value={value}
          onChange={(e) => onChange(normalize(e.target.value))}
          placeholder={placeholder}
          disabled={disabled || loading}
          autoComplete="off"
          spellCheck={false}
          aria-invalid={error ? true : undefined}
          aria-describedby={describedBy}
          className="font-mono uppercase tracking-wider"
        />
        <Button type="submit" loading={loading} disabled={disabled || !value.trim()}>
          Activar
        </Button>
      </div>
      {hint && !error && (
        <p id={`${inputId}-hint`} className="field-hint">
          {hint}
        </p>
      )}
      {error && (
        <p id={`${inputId}-error`} className="field-error" role="alert">
          {error}
        </p>
      )}
    </form>
  );
}
