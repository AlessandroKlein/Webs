/**
 * Copia texto al portapapeles con degradado elegante.
 *
 * Prioriza la API asíncrona (`navigator.clipboard.writeText`, disponible en
 * contextos seguros) y cae a `document.execCommand('copy')` para hosts sin
 * HTTPS o contextos embebidos. Devuelve `true` solo si la copia se confirmó.
 */
export async function copyText(text: string): Promise<boolean> {
  if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch {
      return legacyCopy(text);
    }
  }
  return legacyCopy(text);
}

function legacyCopy(text: string): boolean {
  try {
    const textarea = document.createElement('textarea');
    textarea.value = text;
    textarea.setAttribute('readonly', '');
    textarea.style.position = 'fixed';
    textarea.style.opacity = '0';
    document.body.appendChild(textarea);
    textarea.select();
    const ok = document.execCommand('copy');
    document.body.removeChild(textarea);
    return ok;
  } catch {
    return false;
  }
}
