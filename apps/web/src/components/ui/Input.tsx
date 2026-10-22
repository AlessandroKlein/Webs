import type { ComponentProps } from 'react';
import { cn } from './cn';

/**
 * Campo de texto base (sin etiqueta). Reutiliza la clase `.input` del design
 * system, por lo que sigue automáticamente el tema claro/oscuro.
 *
 * En React 19, `ref` es una prop común: se reenvía explícitamente al <input>.
 */
export function Input({ className, ref, ...props }: ComponentProps<'input'>) {
  return <input ref={ref} className={cn('input', className)} {...props} />;
}
