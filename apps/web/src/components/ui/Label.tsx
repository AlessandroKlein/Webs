import type { LabelHTMLAttributes } from 'react';
import { cn } from './cn';

/**
 * Etiqueta accesible para campos de formulario. Usá `htmlFor` para vincularla
 * al `id` del control (mejora lectores de pantalla y foco).
 */
export function Label({ className, ...props }: LabelHTMLAttributes<HTMLLabelElement>) {
  return <label className={cn('text-sm font-medium text-muted', className)} {...props} />;
}
