/**
 * Saneado defensivo del bloque `html` en el renderer.
 *
 * La API ya sanea al guardar (`apps/api/src/modules/pages/routes.ts` →
 * `sanitizeLayout`), pero el renderer también muestra cambios sin guardar en la
 * previsualización del editor y layouts históricos. Esta segunda barrera impide
 * ejecutar scripts aunque algo entre por otra vía (seed, plantilla, SQL directo).
 *
 * Denylist: los vectores ejecutables conocidos; el contenido seguro se conserva.
 */
const BLOCKED_TAGS = [
  'script', 'iframe', 'object', 'embed', 'link', 'meta', 'style',
  'base', 'form', 'svg', 'math',
].join(',');

const URL_ATTRS = new Set(['href', 'src', 'srcset', 'poster', 'action', 'formaction', 'xlink:href']);
/**
 * `java\nscript:` es un esquema válido para el navegador (stripéa los
 * caracteres de control): hay que quitarlos, junto con los espacios, antes de
 * mirar el esquema. La regex vieja no detectaba `java\tscript:` ni variantes.
 */
const DANGEROUS_SCHEME = /^(?:javascript|vbscript|data):/;

/** Quita espacios y caracteres de control: `java\nscript:` es un esquema válido. */
function stripInvisible(value: string): string {
  let out = '';
  for (const ch of value) {
    const code = ch.charCodeAt(0);
    if (code > 0x20 && !(code >= 0x7f && code <= 0x9f)) out += ch;
  }
  return out;
}

function isDangerousUrl(value: string): boolean {
  const normalized = stripInvisible(value).toLowerCase();
  return DANGEROUS_SCHEME.test(normalized);
}

export function sanitizeHtml(html: string): string {
  if (!html) return '';
  if (typeof DOMParser === 'undefined') return '';
  const doc = new DOMParser().parseFromString(html, 'text/html');
  doc.querySelectorAll(BLOCKED_TAGS).forEach((el) => el.remove());
  doc.querySelectorAll('*').forEach((el) => {
    for (const attr of Array.from(el.attributes)) {
      const name = attr.name.toLowerCase();
      if (name.startsWith('on') || name === 'srcdoc') {
        el.removeAttribute(attr.name);
      } else if (URL_ATTRS.has(name) && isDangerousUrl(attr.value)) {
        el.removeAttribute(attr.name);
      }
    }
  });
  return doc.body.innerHTML;
}
