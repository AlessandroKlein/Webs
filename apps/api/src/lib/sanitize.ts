import sanitizeHtml from 'sanitize-html';

/**
 * Sanitiza HTML aportado por el usuario (plantillas de correo, contenido,
 * bloques) para mitigar XSS. Elimina scripts/iframes/event handlers y permite
 * solo etiquetas y atributos seguros. Para email se permiten estilos inline.
 */
export function sanitize(html: string): string {
  return sanitizeHtml(html, {
    allowedTags: [
      ...sanitizeHtml.defaults.allowedTags,
      'h1',
      'h2',
      'h3',
      'h4',
      'span',
      'div',
      'img',
      'table',
      'thead',
      'tbody',
      'tr',
      'th',
      'td',
    ],
    allowedAttributes: {
      ...sanitizeHtml.defaults.allowedAttributes,
      a: ['href', 'name', 'target', 'rel'],
      img: ['src', 'alt', 'width', 'height'],
      '*': ['style', 'class', 'align'],
    },
    allowedSchemes: ['http', 'https', 'mailto'],
    // Fuerza rel="noopener noreferrer" en enlaces target="_blank".
    transformTags: {
      a: sanitizeHtml.simpleTransform('a', { rel: 'noopener noreferrer' }),
    },
  });
}

/** Sanitiza un objeto de textos localizados (clave locale → HTML). */
export function sanitizeLocalized(
  obj: Record<string, string> | undefined,
): Record<string, string> | undefined {
  if (!obj) return undefined;
  const out: Record<string, string> = {};
  for (const [key, value] of Object.entries(obj)) {
    out[key] = sanitize(value);
  }
  return out;
}
