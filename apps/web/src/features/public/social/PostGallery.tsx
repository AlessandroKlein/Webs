import { useState } from 'react';
import type { MediaItem } from './types';

/**
 * Galería multi-media de una publicación: carrusel con flechas, indicador
 * `n/total` y caption por ítem. Al hacer clic se abre un lightbox simple a
 * pantalla completa.
 */
export function PostGallery({ media, alt }: { media: MediaItem[]; alt: string }) {
  const [index, setIndex] = useState(0);
  const [open, setOpen] = useState(false);

  if (media.length === 0) return null;

  const current = media[index] ?? media[0]!;

  const go = (dir: -1 | 1) => {
    setIndex((i) => (i + dir + media.length) % media.length);
  };

  const mediaNode = (item: MediaItem, lightbox: boolean) =>
    item.type === 'video' ? (
      <video
        key={item.url}
        src={item.url}
        controls
        style={{
          width: '100%',
          maxHeight: lightbox ? '100vh' : 520,
          background: '#000',
          display: 'block',
          objectFit: lightbox ? 'contain' : undefined,
        }}
      />
    ) : (
      <img
        key={item.url}
        src={item.url}
        alt={item.caption ?? alt}
        style={{
          width: '100%',
          maxHeight: lightbox ? '100vh' : 520,
          objectFit: lightbox ? 'contain' : 'cover',
          display: 'block',
          background: '#000',
        }}
      />
    );

  return (
    <>
      <div style={{ position: 'relative', background: '#000' }}>
        <button
          type="button"
          onClick={() => setOpen(true)}
          style={{ display: 'block', width: '100%', padding: 0, border: 'none', cursor: 'zoom-in', background: '#000' }}
          aria-label="Ampliar imagen"
        >
          {mediaNode(current, false)}
        </button>

        {media.length > 1 && (
          <>
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                go(-1);
              }}
              aria-label="Anterior"
              style={{
                position: 'absolute',
                left: 'var(--ws-space-2)',
                top: '50%',
                transform: 'translateY(-50%)',
                width: 36,
                height: 36,
                borderRadius: '50%',
                background: 'rgba(0,0,0,0.55)',
                color: '#fff',
                border: 'none',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <i className="bi bi-chevron-left" />
            </button>
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                go(1);
              }}
              aria-label="Siguiente"
              style={{
                position: 'absolute',
                right: 'var(--ws-space-2)',
                top: '50%',
                transform: 'translateY(-50%)',
                width: 36,
                height: 36,
                borderRadius: '50%',
                background: 'rgba(0,0,0,0.55)',
                color: '#fff',
                border: 'none',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <i className="bi bi-chevron-right" />
            </button>
          </>
        )}

        {media.length > 1 && (
          <span
            style={{
              position: 'absolute',
              top: 'var(--ws-space-2)',
              right: 'var(--ws-space-2)',
              background: 'rgba(0,0,0,0.55)',
              color: '#fff',
              padding: '2px 8px',
              borderRadius: 'var(--ws-radius-md)',
              fontSize: 'var(--ws-font-size-sm)',
            }}
          >
            {index + 1}/{media.length}
          </span>
        )}

        {current.caption && (
          <div
            style={{
              position: 'absolute',
              left: 0,
              right: 0,
              bottom: 0,
              padding: 'var(--ws-space-3)',
              color: '#fff',
              fontSize: 'var(--ws-font-size-sm)',
              background: 'linear-gradient(transparent, rgba(0,0,0,0.7))',
            }}
          >
            {current.caption}
          </div>
        )}
      </div>

      {open && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            zIndex: 3000,
            background: 'rgba(0,0,0,0.94)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
          onClick={() => setOpen(false)}
        >
          <button
            type="button"
            onClick={() => setOpen(false)}
            aria-label="Cerrar"
            style={{
              position: 'absolute',
              top: 'var(--ws-space-4)',
              right: 'var(--ws-space-4)',
              width: 40,
              height: 40,
              borderRadius: '50%',
              background: 'rgba(255,255,255,0.15)',
              color: '#fff',
              border: 'none',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              zIndex: 2,
            }}
          >
            <i className="bi bi-x-lg" />
          </button>

          {media.length > 1 && (
            <>
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  go(-1);
                }}
                aria-label="Anterior"
                style={{
                  position: 'absolute',
                  left: 'var(--ws-space-3)',
                  top: '50%',
                  transform: 'translateY(-50%)',
                  width: 44,
                  height: 44,
                  borderRadius: '50%',
                  background: 'rgba(255,255,255,0.15)',
                  color: '#fff',
                  border: 'none',
                  cursor: 'pointer',
                }}
              >
                <i className="bi bi-chevron-left" style={{ fontSize: '1.25rem' }} />
              </button>
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  go(1);
                }}
                aria-label="Siguiente"
                style={{
                  position: 'absolute',
                  right: 'var(--ws-space-3)',
                  top: '50%',
                  transform: 'translateY(-50%)',
                  width: 44,
                  height: 44,
                  borderRadius: '50%',
                  background: 'rgba(255,255,255,0.15)',
                  color: '#fff',
                  border: 'none',
                  cursor: 'pointer',
                }}
              >
                <i className="bi bi-chevron-right" style={{ fontSize: '1.25rem' }} />
              </button>
            </>
          )}

          <div onClick={(e) => e.stopPropagation()} style={{ maxWidth: '96vw', maxHeight: '96vh' }}>
            {mediaNode(current, true)}
            <div
              style={{
                textAlign: 'center',
                color: '#fff',
                padding: 'var(--ws-space-2)',
                fontSize: 'var(--ws-font-size-sm)',
              }}
            >
              {current.caption && <div>{current.caption}</div>}
              {media.length > 1 && <div style={{ opacity: 0.7 }}>{index + 1} / {media.length}</div>}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
