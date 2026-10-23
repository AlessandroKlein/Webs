/**
 * Renderer Markdown mínimo y seguro, pensado para los documentos legales de la
 * plataforma. Cubre únicamente el subconjunto presente en las plantillas de
 * `docs/legal/`: títulos (`#`…`###`), negrita (`**…**`), cursiva (`*…*`), listas
 * de viñetas (`- `), enlaces `[texto](url)`, reglas horizontales (`---`), tablas
 * de tuberías (`| … |`) y código inline (`` `…` ``).
 *
 * Seguridad: todo el HTML del Markdown se escapa antes de aplicar cualquier
 * transformación, por lo que el contenido administrado por un editor no puede
 * inyectar etiquetas. Las URLs de los enlaces se validan (http/https/mailto,
 * rutas relativas `/…`, anclas y consultas) y se les añade
 * `rel="noopener noreferrer"`.
 */

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/** Devuelve la URL si es segura para un `href`, o `null` si debe descartarse. */
function safeHref(url: string): string | null {
  const value = url.trim();
  if (/^(?:https?|mailto):/i.test(value)) return value;
  if (value.startsWith('/') && !value.startsWith('//')) return value;
  if (value.startsWith('#') || value.startsWith('?')) return value;
  return null;
}

function renderInline(text: string): string {
  // 0. Escapar el HTML del Markdown antes de aplicar cualquier transformación.
  text = escapeHtml(text);

  // 1. Proteger el código inline para que `**`/`*`/`[]()` no lo alteren.
  const codeTokens: string[] = [];
  let output = text.replace(/`([^`]+)`/g, (_match, code: string) => {
    codeTokens.push(code);
    return `\uE000C${codeTokens.length - 1}\uE000`;
  });

  // 2. Enlaces [texto](url).
  output = output.replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, (_match, label: string, url: string) => {
    const href = safeHref(url);
    if (!href) return label;
    return `<a href="${href}" rel="noopener noreferrer">${label}</a>`;
  });

  // 3. Negrita **…** (antes que la cursiva para que `**` no se divida).
  output = output.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');

  // 4. Cursiva *…*.
  output = output.replace(/\*([^*]+)\*/g, '<em>$1</em>');

  // 5. Restaurar el código inline.
  output = output.replace(/\uE000C(\d+)\uE000/g, (_match, index: string) => {
    const code = codeTokens[Number(index)] ?? '';
    return `<code>${code}</code>`;
  });

  return output;
}

function parseTableRow(line: string): string[] {
  let value = line.trim();
  if (value.startsWith('|')) value = value.slice(1);
  if (value.endsWith('|')) value = value.slice(0, -1);
  return value.split('|').map((cell) => cell.trim());
}

function isSeparatorRow(cells: string[]): boolean {
  return cells.length > 0 && cells.every((cell) => /^:?-{3,}:?$/.test(cell));
}

function renderTable(lines: string[]): string {
  const rows = lines.map(parseTableRow).filter((row) => row.length > 0);
  if (rows.length === 0) return '';

  const header = rows[0]!;
  const bodyStart = rows[1] && isSeparatorRow(rows[1]) ? 2 : 1;
  const body = rows.slice(bodyStart);

  const head = `<tr>${header.map((cell) => `<th>${renderInline(cell)}</th>`).join('')}</tr>`;
  const cells = body
    .map((row) => `<tr>${row.map((cell) => `<td>${renderInline(cell)}</td>`).join('')}</tr>`)
    .join('');

  return `<table class="table"><thead>${head}</thead><tbody>${cells}</tbody></table>`;
}

function isBlockStart(line: string): boolean {
  const trimmed = line.trim();
  return (
    trimmed.startsWith('|') ||
    /^#{1,6}\s+/.test(trimmed) ||
    /^-{3,}$/.test(trimmed) ||
    /^[-*]\s+/.test(trimmed)
  );
}

/** Convierte Markdown (subconjunto soportado) a HTML seguro. */
export function renderMarkdown(markdown: string): string {
  const lines = markdown.replace(/\r\n?/g, '\n').split('\n');
  const blocks: string[] = [];
  let index = 0;

  while (index < lines.length) {
    const line = lines[index]!;
    const trimmed = line.trim();

    if (trimmed === '') {
      index += 1;
      continue;
    }

    // Tabla de tuberías.
    if (trimmed.startsWith('|')) {
      const tableLines: string[] = [];
      while (index < lines.length && lines[index]!.trim().startsWith('|')) {
        tableLines.push(lines[index]!.trim());
        index += 1;
      }
      blocks.push(renderTable(tableLines));
      continue;
    }

    // Título.
    const heading = /^(#{1,6})\s+(.*)$/.exec(trimmed);
    if (heading) {
      const level = heading[1]!.length;
      blocks.push(`<h${level}>${renderInline(heading[2]!)}</h${level}>`);
      index += 1;
      continue;
    }

    // Regla horizontal.
    if (/^-{3,}$/.test(trimmed)) {
      blocks.push('<hr/>');
      index += 1;
      continue;
    }

    // Lista de viñetas.
    if (/^[-*]\s+/.test(trimmed)) {
      const items: string[] = [];
      while (index < lines.length && /^[-*]\s+/.test(lines[index]!.trim())) {
        const content = lines[index]!.trim().replace(/^[-*]\s+/, '');
        items.push(`<li>${renderInline(content)}</li>`);
        index += 1;
      }
      blocks.push(`<ul>${items.join('')}</ul>`);
      continue;
    }

    // Párrafo: acumula líneas hasta una línea en blanco o el inicio de otro bloque.
    const paragraph: string[] = [];
    while (index < lines.length && lines[index]!.trim() !== '' && !isBlockStart(lines[index]!.trim())) {
      paragraph.push(lines[index]!.trim());
      index += 1;
    }
    blocks.push(`<p>${renderInline(paragraph.join(' '))}</p>`);
  }

  return blocks.join('\n');
}
