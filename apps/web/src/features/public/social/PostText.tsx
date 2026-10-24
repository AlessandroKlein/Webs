import type { ReactNode } from 'react';

const TOKEN_RE = /([@#][\wÀ-ÿ.-]+)/g;

/**
 * Texto de publicación con menciones (@usuario) y hashtags (#tema) clickeables.
 * Los tokens se resaltan con el color primario y, al hacer clic, disparan el
 * callback correspondiente (navegar al perfil / filtrar el feed por tag).
 */
export function PostText({
  text,
  onMention,
  onHashtag,
  className,
}: {
  text: string;
  onMention: (username: string) => void;
  onHashtag: (tag: string) => void;
  className?: string;
}) {
  const parts = text.split(TOKEN_RE);
  const nodes: ReactNode[] = parts.map((part, i) => {
    if (part.startsWith('@') && part.length > 1) {
      return (
        <button
          key={i}
          type="button"
          onClick={() => onMention(part.slice(1))}
          style={{
            background: 'none',
            border: 'none',
            padding: 0,
            margin: 0,
            color: 'var(--ws-primary)',
            fontWeight: 600,
            cursor: 'pointer',
            fontSize: 'inherit',
            fontFamily: 'inherit',
          }}
        >
          {part}
        </button>
      );
    }
    if (part.startsWith('#') && part.length > 1) {
      return (
        <button
          key={i}
          type="button"
          onClick={() => onHashtag(part.slice(1))}
          style={{
            background: 'none',
            border: 'none',
            padding: 0,
            margin: 0,
            color: 'var(--ws-primary)',
            cursor: 'pointer',
            fontSize: 'inherit',
            fontFamily: 'inherit',
          }}
        >
          {part}
        </button>
      );
    }
    return <span key={i}>{part}</span>;
  });

  return (
    <span className={className} style={{ whiteSpace: 'pre-wrap' }}>
      {nodes}
    </span>
  );
}
