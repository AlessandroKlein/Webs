import type { HTMLAttributes } from 'react';
import { cn } from './cn';

/**
 * Placeholder de carga. Usá `className` para darle tamaño concreto
 * (p. ej. `h-4 w-40`, `h-12 w-12 rounded-full`).
 */
export function Skeleton({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('animate-pulse rounded-md bg-surface-2', className)} {...props} />;
}
