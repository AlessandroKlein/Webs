import { useCallback, useReducer, useRef, useState } from 'react';

/**
 * Historial undo/redo en memoria (máx 100 pasos) para el array de secciones
 * del editor de páginas. La fuente de verdad vive en `present`; `past`/`future`
 * guardan snapshots por referencia (todas las mutaciones crean arrays nuevos).
 */
export function useBlockHistory<T>(initial: T) {
  const [present, setPresent] = useState<T>(initial);
  const presentRef = useRef<T>(initial);
  const pastRef = useRef<T[]>([]);
  const futureRef = useRef<T[]>([]);
  // Force re-render para refrescar canUndo/canRedo (los refs no disparan render).
  const [, force] = useReducer((x: number) => x + 1, 0);

  const commit = useCallback((next: T) => {
    presentRef.current = next;
    setPresent(next);
    force();
  }, []);

  const push = useCallback(
    (updater: T | ((prev: T) => T)) => {
      const prev = presentRef.current;
      const next = typeof updater === 'function' ? (updater as (p: T) => T)(prev) : updater;
      if (Object.is(next, prev)) return;
      pastRef.current.push(prev);
      if (pastRef.current.length > 100) pastRef.current.shift();
      futureRef.current = [];
      commit(next);
    },
    [commit],
  );

  const undo = useCallback(() => {
    const last = pastRef.current.pop();
    if (last === undefined) return;
    futureRef.current.push(presentRef.current);
    commit(last);
  }, [commit]);

  const redo = useCallback(() => {
    const next = futureRef.current.pop();
    if (next === undefined) return;
    pastRef.current.push(presentRef.current);
    commit(next);
  }, [commit]);

  const reset = useCallback(
    (next: T) => {
      pastRef.current = [];
      futureRef.current = [];
      commit(next);
    },
    [commit],
  );

  return {
    present,
    push,
    undo,
    redo,
    reset,
    canUndo: pastRef.current.length > 0,
    canRedo: futureRef.current.length > 0,
  };
}
