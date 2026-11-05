import { useEffect } from 'react';

/**
 * Fija `document.title` a "<page> · Webs" y restaura el título previo al desmontar.
 * Pensado para llamarse una sola vez por página (desde el layout de admin).
 */
export function useDocumentTitle(pageName?: string | null): void {
  useEffect(() => {
    if (!pageName) return;
    const prev = document.title;
    document.title = `${pageName} · Webs`;
    return () => {
      document.title = prev;
    };
  }, [pageName]);
}
