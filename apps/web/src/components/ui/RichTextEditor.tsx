import { useEffect, useRef } from 'react';
import Quill from 'quill';
import 'quill/dist/quill.snow.css';

/**
 * Editor WYSIWYG basado en Quill (dependencia descargada/bundled, sin CDN).
 * Produce HTML; se usa en plantillas de correo y contenido enriquecido.
 */
export function RichTextEditor({
  value,
  onChange,
}: {
  value: string;
  onChange: (html: string) => void;
}) {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!containerRef.current) return;
    const editor = new Quill(containerRef.current, {
      theme: 'snow',
      modules: {
        toolbar: [
          [{ header: [2, 3, false] }],
          ['bold', 'italic', 'underline', 'strike'],
          [{ list: 'ordered' }, { list: 'bullet' }],
          ['link', 'blockquote'],
          ['clean'],
        ],
      },
    });
    // Valor inicial (después el editor es la fuente de verdad vía onChange).
    if (value) editor.root.innerHTML = value;
    editor.on('text-change', () => onChange(editor.root.innerHTML));

    return () => {
      editor.off('text-change');
      containerRef.current!.innerHTML = '';
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return <div ref={containerRef} className="wysiwyg" />;
}
