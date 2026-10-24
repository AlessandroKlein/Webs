import type { ReactNode } from 'react';

/**
 * Resaltado de sintaxis mínimo, autocontenido y sin dependencias (ADR-0026:
 * "componente propio ligero o lib MIT vendored, sin CDN ni SaaS de pago").
 *
 * Colorea JSON y el subconjunto YAML que emite el backend (`toYaml`, que es
 * JSON-compatible: claves `k:`, strings entre comillas, números, `true/false/
 * null`, listas `- `, comentarios `#`). Cada token se mapea a una clase
 * `.tok-*` (estilos en `apps/web/src/styles.css`).
 */

type TokenKind =
  | 'key'
  | 'string'
  | 'number'
  | 'keyword'
  | 'punct'
  | 'comment'
  | 'plain';

function tok(key: string, kind: TokenKind, text: string): ReactNode {
  return (
    <span key={key} className={kind === 'plain' ? undefined : `tok-${kind}`}>
      {text}
    </span>
  );
}

// JSON: strings (con detección de clave `"k":`), números, booleanos/null,
// puntuación `{ } [ ] , :`.
const JSON_RE =
  /("(?:[^"\\]|\\.)*")(\s*:)?|\b(true|false|null)\b|(-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?)|([{}[\],:])/g;

function highlightJson(code: string): ReactNode[] {
  const out: ReactNode[] = [];
  let last = 0;
  for (const m of code.matchAll(JSON_RE)) {
    const start = m.index ?? 0;
    if (start > last) out.push(code.slice(last, start));
    const [, str, colon, kw, num, punct] = m;
    let kind: TokenKind = 'plain';
    if (str !== undefined) kind = colon !== undefined ? 'key' : 'string';
    else if (kw !== undefined) kind = 'keyword';
    else if (num !== undefined) kind = 'number';
    else if (punct !== undefined) kind = 'punct';
    out.push(tok(`j${start}`, kind, m[0]));
    last = start + m[0].length;
  }
  if (last < code.length) out.push(code.slice(last));
  return out;
}

// YAML (subconjunto del backend): strings, comentarios `#…`, guiones de lista,
// claves `k:`, booleanos/null, números.
const YAML_RE =
  /("(?:[^"\\\n]|\\.)*"|'[^'\n]*')|(#[^\n]*)|(^[ \t]*-[ \t]?)|([A-Za-z_][\w./-]*)(\s*:)|(\btrue\b|\bfalse\b|\bnull\b)|(-?\d+(?:\.\d+)?)/gm;

function highlightYaml(code: string): ReactNode[] {
  const out: ReactNode[] = [];
  let last = 0;
  for (const m of code.matchAll(YAML_RE)) {
    const start = m.index ?? 0;
    if (start > last) out.push(code.slice(last, start));
    const [, str, comment, dash, key, , kw, num] = m;
    let kind: TokenKind = 'plain';
    if (str !== undefined) kind = 'string';
    else if (comment !== undefined) kind = 'comment';
    else if (dash !== undefined) kind = 'punct';
    else if (key !== undefined) kind = 'key';
    else if (kw !== undefined) kind = 'keyword';
    else if (num !== undefined) kind = 'number';
    out.push(tok(`y${start}`, kind, m[0]));
    last = start + m[0].length;
  }
  if (last < code.length) out.push(code.slice(last));
  return out;
}

export type RawFormat = 'json' | 'yaml';

/** Colorea `code` según el formato y lo envuelve en un `<pre><code>`. */
export function CodeBlock({ code, format }: { code: string; format: RawFormat }) {
  const nodes = format === 'json' ? highlightJson(code) : highlightYaml(code);
  return (
    <pre className="raw-code" role="region" aria-label={`Datos crudos (${format.toUpperCase()})`}>
      <code>{nodes}</code>
    </pre>
  );
}
