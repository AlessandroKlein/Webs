import { cn } from './cn';

export interface CheckoutStep {
  id: string;
  label: string;
}

/**
 * Indicador de pasos del checkout (Carrito → Envío → Pago → Confirmación).
 * Refuerza dónde está la persona y cuánto falta; los estados son
 * completado/actual/pendiente.
 */
export function StepIndicator({
  steps,
  current,
  className,
}: {
  steps: CheckoutStep[];
  current: number;
  className?: string;
}) {
  return (
    <ol className={cn('flex items-center gap-2', className)} aria-label="Progreso del pago">
      {steps.map((step, index) => {
        const state = index < current ? 'done' : index === current ? 'current' : 'todo';
        return (
          <li
            key={step.id}
            className="flex flex-1 items-center gap-2"
            aria-current={state === 'current' ? 'step' : undefined}
          >
            <span
              className={cn(
                'flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-semibold',
                state === 'done'
                  ? 'bg-primary text-on-primary'
                  : state === 'current'
                    ? 'bg-primary-soft text-primary ring-1 ring-primary'
                    : 'bg-surface-2 text-muted',
              )}
            >
              {state === 'done' ? <i className="bi bi-check" aria-hidden="true" /> : index + 1}
            </span>
            <span
              className={cn(
                'hidden text-sm sm:inline',
                state === 'current' ? 'font-medium text-text' : state === 'done' ? 'text-muted' : 'text-subtle',
              )}
            >
              {step.label}
            </span>
            {index < steps.length - 1 && (
              <span className={cn('h-px flex-1', state === 'done' ? 'bg-primary' : 'bg-border')} aria-hidden="true" />
            )}
          </li>
        );
      })}
    </ol>
  );
}
