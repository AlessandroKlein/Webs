/**
 * Combina nombres de clase condicionalmente.
 *
 * Versión mínima y sin dependencias del patrón `cn()` de shadcn/ui. No
 * resuelve conflictos de utilidades (tailwind-merge); ante dos utilidades que
 * compiten, gana la última en el DOM, por lo que conviene evitar pares en
 * conflicto en un mismo `cn(...)`.
 */
export type ClassValue = string | false | null | undefined;

export function cn(...classes: ClassValue[]): string {
  return classes.filter(Boolean).join(' ');
}
