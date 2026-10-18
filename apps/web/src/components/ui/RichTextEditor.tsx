import { useEffect, useRef } from 'react';

/**
 * Editor de texto enriquecido básico (contentEditable) que produce HTML.
 * Para producción se puede sustituir por TipTap/Quill; aquí se usa una solución
 * sin dependencias para la base.
 */
export function RichTextEditor({
  value,
  onChange,
}: {
  value: string;
  onChange: (html: string) => void;
}) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (ref.current && ref.current.innerHTML !== value) {
      ref.current.innerHTML = value;
    }
  }, [value]);

  const exec = (command: string, arg?: string) => {
    document.execCommand(command, false, arg);
    ref.current?.focus();
    onChange(ref.current?.innerHTML ?? '');
  };

  return (
    <div>
      <div className="row" style={{ gap: 4, marginBottom: 'var(--ws-space-2)', flexWrap: 'wrap' }}>
        <button type="button" className="btn ghost" onClick={() => exec('bold')} title="Negrita">
          <strong>B</strong>
        </button>
        <button type="button" className="btn ghost" onClick={() => exec('italic')} title="Cursiva">
          <em>I</em>
        </button>
        <button type="button" className="btn ghost" onClick={() => exec('underline')} title="Subrayado">
          <u>U</u>
        </button>
        <button type="button" className="btn ghost" onClick={() => exec('insertUnorderedList')}>
          • Lista
        </button>
        <button type="button" className="btn ghost" onClick={() => exec('insertOrderedList')}>
          1. Lista
        </button>
        <button type="button" className="btn ghost" onClick={() => exec('formatBlock', 'H2')}>
          Título
        </button>
        <button
          type="button"
          className="btn ghost"
          onClick={() => {
            const url = window.prompt('URL del enlace');
            if (url) exec('createLink', url);
          }}
        >
          Enlace
        </button>
      </div>
      <div
        ref={ref}
        contentEditable
        suppressContentEditableWarning
        onInput={(e) => onChange((e.target as HTMLDivElement).innerHTML)}
        className="input"
        style={{ minHeight: 220, overflowY: 'auto', whiteSpace: 'normal' }}
      />
    </div>
  );
}
