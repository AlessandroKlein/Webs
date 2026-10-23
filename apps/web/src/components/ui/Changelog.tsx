import { cn } from './cn';
import { Badge } from './Badge';

export interface ReleaseNote {
  id: string;
  version: string;
  date?: string;
  /** Notas del release, una por entrada de la lista. */
  notes: string[];
  /** Marca esta versión como la actualmente instalada. */
  current?: boolean;
  /** Marca esta versión como la última disponible para actualizar. */
  latest?: boolean;
}

/**
 * Changelog de releases (flujo de actualización). Lista versiones con su
 * fecha, notas y las etiquetas "Instalada"/"Disponible" para que el usuario
 * entienda qué va a cambiar antes de aceptar la actualización.
 */
export function Changelog({ releases, className }: { releases: ReleaseNote[]; className?: string }) {
  return (
    <ol className={cn('flex flex-col gap-4', className)} aria-label="Cambios de la versión">
      {releases.map((release) => (
        <li key={release.id} className="flex flex-col gap-2">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-mono text-sm font-semibold text-text">v{release.version}</span>
            {release.date && <span className="text-sm text-subtle">{release.date}</span>}
            {release.current && <Badge variant="neutral">Instalada</Badge>}
            {release.latest && <Badge variant="success">Disponible</Badge>}
          </div>
          {release.notes.length > 0 && (
            <ul className="flex flex-col gap-1 pl-4 text-sm text-muted">
              {release.notes.map((note, index) => (
                <li key={`${release.id}-${index}`} className="list-disc">
                  {note}
                </li>
              ))}
            </ul>
          )}
        </li>
      ))}
    </ol>
  );
}
