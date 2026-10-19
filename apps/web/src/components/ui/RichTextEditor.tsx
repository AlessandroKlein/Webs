import { useEffect } from 'react';
import { EditorContent, useEditor } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Link from '@tiptap/extension-link';
import Image from '@tiptap/extension-image';

/**
 * Editor WYSIWYG basado en Tiptap (sin CDN, sin react-quill).
 * Produce HTML; se usa en plantillas de correo y contenido enriquecido.
 * Misma API que el componente anterior: `value` (HTML) y `onChange(html)`.
 */
export function RichTextEditor({
  value,
  onChange,
}: {
  value: string;
  onChange: (html: string) => void;
}) {
  const editor = useEditor({
    extensions: [
      StarterKit,
      Link.configure({ openOnClick: false }),
      Image,
    ],
    content: value,
    onUpdate: ({ editor }) => onChange(editor.getHTML()),
  });

  // Sincroniza cambios externos de `value` (p. ej. carga asíncrona) sin pisar
  // lo que el usuario está escribiendo en ese momento.
  useEffect(() => {
    if (editor.getHTML() !== value && !editor.isFocused) {
      editor.commands.setContent(value);
    }
  }, [value, editor]);

  const btnClass = (name: string, attrs?: Record<string, unknown>) =>
    `wysiwyg-btn${editor.isActive(name, attrs) ? ' active' : ''}`;

  function setLink() {
    const previous = (editor.getAttributes('link') as { href?: string }).href ?? '';
    const url = window.prompt('URL del enlace:', previous || 'https://');
    if (url === null) return; // cancelado
    if (url.trim() === '') {
      editor.chain().focus().extendMarkRange('link').unsetLink().run();
      return;
    }
    editor.chain().focus().extendMarkRange('link').setLink({ href: url.trim() }).run();
  }

  function addImage() {
    const url = window.prompt('URL de la imagen:');
    if (url && url.trim()) {
      editor.chain().focus().setImage({ src: url.trim() }).run();
    }
  }

  return (
    <div className="wysiwyg">
      <div className="wysiwyg-toolbar">
        <button type="button" className={btnClass('bold')} onClick={() => editor.chain().focus().toggleBold().run()} title="Negrita">
          <i className="bi bi-type-bold" />
        </button>
        <button type="button" className={btnClass('italic')} onClick={() => editor.chain().focus().toggleItalic().run()} title="Cursiva">
          <i className="bi bi-type-italic" />
        </button>
        <button type="button" className={btnClass('underline')} onClick={() => editor.chain().focus().toggleUnderline().run()} title="Subrayado">
          <i className="bi bi-type-underline" />
        </button>
        <button type="button" className={btnClass('strike')} onClick={() => editor.chain().focus().toggleStrike().run()} title="Tachado">
          <i className="bi bi-type-strikethrough" />
        </button>
        <span className="wysiwyg-sep" />
        <button type="button" className={btnClass('heading', { level: 2 })} onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()} title="Título">
          H2
        </button>
        <button type="button" className={btnClass('heading', { level: 3 })} onClick={() => editor.chain().focus().toggleHeading({ level: 3 }).run()} title="Subtítulo">
          H3
        </button>
        <span className="wysiwyg-sep" />
        <button type="button" className={btnClass('bulletList')} onClick={() => editor.chain().focus().toggleBulletList().run()} title="Lista">
          <i className="bi bi-list-ul" />
        </button>
        <button type="button" className={btnClass('orderedList')} onClick={() => editor.chain().focus().toggleOrderedList().run()} title="Lista numerada">
          <i className="bi bi-list-ol" />
        </button>
        <button type="button" className={btnClass('blockquote')} onClick={() => editor.chain().focus().toggleBlockquote().run()} title="Cita">
          <i className="bi bi-quote" />
        </button>
        <span className="wysiwyg-sep" />
        <button type="button" className={btnClass('link')} onClick={setLink} title="Enlace">
          <i className="bi bi-link-45deg" />
        </button>
        <button type="button" className="wysiwyg-btn" onClick={addImage} title="Imagen">
          <i className="bi bi-image" />
        </button>
        <span className="wysiwyg-sep" />
        <button type="button" className="wysiwyg-btn" onClick={() => editor.chain().focus().undo().run()} title="Deshacer">
          <i className="bi bi-arrow-counterclockwise" />
        </button>
        <button type="button" className="wysiwyg-btn" onClick={() => editor.chain().focus().redo().run()} title="Rehacer">
          <i className="bi bi-arrow-clockwise" />
        </button>
        <button type="button" className="wysiwyg-btn" onClick={() => editor.chain().focus().unsetAllMarks().clearNodes().run()} title="Limpiar formato">
          <i className="bi bi-eraser" />
        </button>
      </div>
      <EditorContent editor={editor} className="wysiwyg-content" />
    </div>
  );
}
