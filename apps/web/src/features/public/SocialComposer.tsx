import { useEffect, useMemo, useRef, useState, type ChangeEvent, type FormEvent } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { api, uploadFile } from '../../lib/api';
import { Button } from '../../components/ui/Button';

const SOCIAL_BASE = '/api/v1/plugins/social';
const MEDIA_UPLOAD = '/api/v1/media/upload';

/**
 * Largo máximo por defecto del plugin social (`settings.maxPostLength` = 500).
 * El backend aplica el límite configurado (`config.maxPostLength`) recortando el
 * texto, así que este contador es una guía visual coherente con el default.
 */
const MAX_POST_LENGTH = 500;
const DRAFT_KEY = 'webs.social.draft.v1';

type Visibility = 'public' | 'followers' | 'private';

interface MediaItem {
  url: string;
  type: 'image' | 'video';
  caption: string;
}

interface PollOption {
  id: string;
  label: string;
}

interface SocialUser {
  id: string;
  displayName: string | null;
  username: string | null;
  email: string;
}

interface ActiveToken {
  type: 'mention' | 'hashtag';
  trigger: string;
  query: string;
  triggerIndex: number;
}

interface Draft {
  text: string;
  mediaItems: MediaItem[];
  visibility: Visibility;
  pollQuestion: string;
  pollOptions: string[]; // labels (los ids se regeneran al restaurar)
}

const EMOJIS = [
  '😀', '😄', '😂', '🤣', '😊', '😍', '🥰', '😘', '😎', '🤩',
  '😢', '😭', '😡', '🤔', '🙄', '😴', '🥳', '😇', '🤗', '🤭',
  '👍', '👎', '👏', '🙌', '🤝', '💪', '🙏', '👀', '💯', '🔥',
  '❤️', '💔', '💖', '💙', '✨', '⭐', '🎉', '🎊', '🌹', '🌺',
  '🍕', '🍔', '☕', '⚽', '🏀', '🎮', '🚀', '🌍', '📷', '🎵',
];

const VISIBILITY_OPTIONS: { value: Visibility; label: string; icon: string; hint: string }[] = [
  { value: 'public', label: 'Público', icon: 'bi-globe2', hint: 'Visible para todos' },
  { value: 'followers', label: 'Seguidores', icon: 'bi-people', hint: 'Solo tus seguidores' },
  { value: 'private', label: 'Solo yo', icon: 'bi-lock', hint: 'Visible solo para ti' },
];

function newOptionId(): string {
  return `opt-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function normalizeTag(raw: string): string {
  return raw
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^\w-]/g, '');
}

function detectToken(text: string, cursor: number): ActiveToken | null {
  const before = text.slice(0, cursor);
  const m = before.match(/(?:^|\s)([@#])([\wÀ-ÿ.-]*)$/);
  if (!m) return null;
  const trigger = m[1] ?? '#';
  const query = m[2] ?? '';
  return {
    type: trigger === '@' ? 'mention' : 'hashtag',
    trigger,
    query,
    triggerIndex: cursor - query.length - 1,
  };
}

function firstUrl(text: string): string | null {
  const m = text.match(/https?:\/\/[^\s)]+/i);
  return m ? m[0] : null;
}

function loadDraft(): Draft {
  try {
    const raw = localStorage.getItem(DRAFT_KEY);
    if (!raw) return { text: '', mediaItems: [], visibility: 'public', pollQuestion: '', pollOptions: [] };
    const d = JSON.parse(raw) as Partial<Draft>;
    return {
      text: typeof d.text === 'string' ? d.text : '',
      mediaItems: Array.isArray(d.mediaItems) ? d.mediaItems : [],
      visibility: d.visibility === 'followers' || d.visibility === 'private' ? d.visibility : 'public',
      pollQuestion: typeof d.pollQuestion === 'string' ? d.pollQuestion : '',
      pollOptions: Array.isArray(d.pollOptions) ? d.pollOptions.map(String) : [],
    };
  } catch {
    return { text: '', mediaItems: [], visibility: 'public', pollQuestion: '', pollOptions: [] };
  }
}

/**
 * Compositor "Nueva publicación" enriquecido: galería multi-media (reordenar,
 * eliminar, caption), selector de emoji, contador de caracteres, autocompletado
 * de menciones/hashtags, selector de visibilidad, encuestas, vista previa de
 * enlace inline y autoguardado de borrador en localStorage.
 */
export function SocialComposer({
  userId,
  users,
  onClose,
}: {
  userId: string;
  users: SocialUser[];
  onClose: () => void;
}) {
  const qc = useQueryClient();
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const [initial] = useState<Draft>(() => loadDraft());
  const [text, setText] = useState(initial.text);
  const [mediaItems, setMediaItems] = useState<MediaItem[]>(initial.mediaItems);
  const [visibility, setVisibility] = useState<Visibility>(initial.visibility);
  const [pollMode, setPollMode] = useState(initial.pollQuestion.length > 0 || initial.pollOptions.length > 0);
  const [pollQuestion, setPollQuestion] = useState(initial.pollQuestion);
  const [pollOptions, setPollOptions] = useState<PollOption[]>(() =>
    (initial.pollOptions.length >= 2 ? initial.pollOptions : ['', '']).map((label) => ({
      id: newOptionId(),
      label,
    })),
  );

  const [showEmoji, setShowEmoji] = useState(false);
  const [activeToken, setActiveToken] = useState<ActiveToken | null>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState('');

  // Autoguardado de borrador (debounced ligero vía microtask no es necesario;
  // escribir en localStorage es barato para este tamaño).
  useEffect(() => {
    try {
      localStorage.setItem(
        DRAFT_KEY,
        JSON.stringify({
          text,
          mediaItems,
          visibility,
          pollQuestion,
          pollOptions: pollOptions.map((o) => o.label),
        } satisfies Draft),
      );
    } catch {
      /* storage lleno/deshabilitado: ignorar */
    }
  }, [text, mediaItems, visibility, pollQuestion, pollOptions]);

  useEffect(() => {
    const ta = textareaRef.current;
    if (ta) ta.focus();
  }, []);

  const publish = useMutation({
    mutationFn: (payload: {
      author: string;
      text: string;
      mediaUrls: { url: string; type: string; caption?: string }[];
      visibility: Visibility;
      poll?: { question: string; options: PollOption[] };
    }) => api.post(`${SOCIAL_BASE}/posts`, payload),
    onSuccess: () => {
      try {
        localStorage.removeItem(DRAFT_KEY);
      } catch {
        /* ignorar */
      }
      setText('');
      setMediaItems([]);
      setVisibility('public');
      setPollMode(false);
      setPollQuestion('');
      setPollOptions([
        { id: newOptionId(), label: '' },
        { id: newOptionId(), label: '' },
      ]);
      qc.invalidateQueries({ queryKey: ['social-posts'] });
      onClose();
    },
  });

  const link = firstUrl(text);
  const overLimit = text.length > MAX_POST_LENGTH;
  const validPollOptions = pollOptions.filter((o) => o.label.trim().length > 0);
  const canPublish =
    !overLimit &&
    (text.trim().length > 0 ||
      mediaItems.length > 0 ||
      (pollMode && pollQuestion.trim().length > 0 && validPollOptions.length >= 2));

  const mentionSuggestions = useMemo(() => {
    if (!activeToken || activeToken.type !== 'mention') return [] as SocialUser[];
    const q = activeToken.query.toLowerCase();
    return users
      .filter(
        (u) =>
          (u.username ?? '').toLowerCase().includes(q) ||
          (u.displayName ?? '').toLowerCase().includes(q),
      )
      .slice(0, 6);
  }, [activeToken, users]);

  const hashtagSuggestion = useMemo(() => {
    if (!activeToken || activeToken.type !== 'hashtag') return null;
    const norm = normalizeTag(activeToken.query);
    return norm.length > 0 ? norm : null;
  }, [activeToken]);

  function onTextChange(e: ChangeEvent<HTMLTextAreaElement>) {
    const value = e.target.value;
    setText(value);
    const cursor = e.target.selectionStart ?? value.length;
    setActiveToken(detectToken(value, cursor));
  }

  function replaceToken(completion: string) {
    if (!activeToken) return;
    const before = text.slice(0, activeToken.triggerIndex);
    const after = text.slice(activeToken.triggerIndex + activeToken.query.length + 1);
    setText(`${before}${activeToken.trigger}${completion} ${after}`);
    setActiveToken(null);
    requestAnimationFrame(() => textareaRef.current?.focus());
  }

  function pickMention(u: SocialUser) {
    const name = u.username ?? '';
    if (name) replaceToken(name);
  }

  function pickHashtag(tag: string) {
    replaceToken(tag);
  }

  function insertEmoji(emoji: string) {
    const ta = textareaRef.current;
    const cursor = ta?.selectionStart ?? text.length;
    const next = text.slice(0, cursor) + emoji + text.slice(cursor);
    setText(next);
    setShowEmoji(false);
    requestAnimationFrame(() => {
      if (ta) {
        ta.focus();
        const pos = cursor + emoji.length;
        ta.setSelectionRange(pos, pos);
      }
    });
  }

  async function onFiles(e: ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? []);
    if (files.length === 0) return;
    setUploading(true);
    setUploadError('');
    try {
      for (const file of files) {
        const up = await uploadFile<{ url: string }>(MEDIA_UPLOAD, file);
        setMediaItems((prev) => [
          ...prev,
          { url: up.url, type: file.type.startsWith('video/') ? 'video' : 'image', caption: '' },
        ]);
      }
    } catch {
      setUploadError('No se pudo subir uno o más archivos.');
    } finally {
      setUploading(false);
      e.target.value = '';
    }
  }

  function moveMedia(i: number, dir: -1 | 1) {
    setMediaItems((prev) => {
      const j = i + dir;
      if (j < 0 || j >= prev.length) return prev;
      const next = [...prev];
      const a = next[i] as MediaItem;
      const b = next[j] as MediaItem;
      next[i] = b;
      next[j] = a;
      return next;
    });
  }

  function removeMedia(i: number) {
    setMediaItems((prev) => prev.filter((_, idx) => idx !== i));
  }

  function setCaption(i: number, caption: string) {
    setMediaItems((prev) => prev.map((m, idx) => (idx === i ? { ...m, caption } : m)));
  }

  function addOption() {
    setPollOptions((prev) => (prev.length >= 20 ? prev : [...prev, { id: newOptionId(), label: '' }]));
  }

  function removeOption(i: number) {
    setPollOptions((prev) => (prev.length <= 2 ? prev : prev.filter((_, idx) => idx !== i)));
  }

  function setOption(i: number, label: string) {
    setPollOptions((prev) => prev.map((o, idx) => (idx === i ? { ...o, label } : o)));
  }

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (!canPublish || publish.isPending) return;
    publish.mutate({
      author: userId,
      text: text.trim(),
      mediaUrls: mediaItems.map((m) => ({
        url: m.url,
        type: m.type,
        caption: m.caption.trim() || undefined,
      })),
      visibility,
      poll:
        pollMode && pollQuestion.trim() && validPollOptions.length >= 2
          ? {
              question: pollQuestion.trim(),
              options: validPollOptions.map((o) => ({ id: o.id, label: o.label.trim() })),
            }
          : undefined,
    });
  }

  const row = { display: 'flex', alignItems: 'center', gap: 'var(--ws-space-2)' } as const;

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(0,0,0,0.5)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 1000,
        padding: 'var(--ws-space-4)',
      }}
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Nueva publicación"
        style={{
          background: 'var(--ws-surface)',
          border: '1px solid var(--ws-border)',
          borderRadius: 'var(--ws-radius-lg)',
          boxShadow: 'var(--ws-shadow-lg)',
          padding: 'var(--ws-space-6)',
          width: '100%',
          maxWidth: 560,
          maxHeight: '90vh',
          overflowY: 'auto',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="row" style={{ justifyContent: 'space-between', marginBottom: 'var(--ws-space-3)' }}>
          <h3 style={{ margin: 0 }}>Nueva publicación</h3>
          <Button variant="ghost" onClick={onClose} aria-label="Cerrar">
            <i className="bi bi-x-lg" />
          </Button>
        </div>

        <form className="stack" onSubmit={onSubmit} style={{ gap: 'var(--ws-space-3)' }}>
          {/* Selector de visibilidad */}
          <div
            role="radiogroup"
            aria-label="Visibilidad"
            className="row"
            style={{ gap: 'var(--ws-space-1)', flexWrap: 'wrap' }}
          >
            {VISIBILITY_OPTIONS.map((opt) => {
              const active = visibility === opt.value;
              return (
                <button
                  key={opt.value}
                  type="button"
                  role="radio"
                  aria-checked={active}
                  onClick={() => setVisibility(opt.value)}
                  title={opt.hint}
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 'var(--ws-space-1)',
                    padding: 'var(--ws-space-1) var(--ws-space-2)',
                    borderRadius: 'var(--ws-radius-md)',
                    border: `1px solid ${active ? 'var(--ws-primary)' : 'var(--ws-border)'}`,
                    background: active ? 'var(--ws-primary-soft)' : 'transparent',
                    color: active ? 'var(--ws-primary)' : 'var(--ws-text-muted)',
                    cursor: 'pointer',
                    fontSize: 'var(--ws-font-size-sm)',
                  }}
                >
                  <i className={`bi ${opt.icon}`} aria-hidden="true" />
                  {opt.label}
                </button>
              );
            })}
          </div>

          {/* Texto con contador + autocompletado */}
          <div style={{ position: 'relative' }}>
            <textarea
              ref={textareaRef}
              className="input"
              rows={4}
              placeholder="¿Qué estás pensando?"
              value={text}
              onChange={onTextChange}
              aria-label="Contenido de la publicación"
            />
            <span
              style={{
                display: 'block',
                textAlign: 'right',
                fontSize: 'var(--ws-font-size-xs)',
                marginTop: 'var(--ws-space-1)',
                color: overLimit ? 'var(--ws-danger)' : 'var(--ws-text-muted)',
              }}
              aria-live="polite"
            >
              {text.length}/{MAX_POST_LENGTH}
            </span>

            {/* Dropdown de menciones */}
            {activeToken?.type === 'mention' && mentionSuggestions.length > 0 && (
              <div
                style={{
                  position: 'absolute',
                  left: 0,
                  right: 0,
                  top: '100%',
                  marginTop: 'var(--ws-space-1)',
                  background: 'var(--ws-surface)',
                  border: '1px solid var(--ws-border)',
                  borderRadius: 'var(--ws-radius-md)',
                  boxShadow: 'var(--ws-shadow-md)',
                  zIndex: 10,
                  maxHeight: 220,
                  overflowY: 'auto',
                }}
              >
                {mentionSuggestions.map((u) => (
                  <button
                    key={u.id}
                    type="button"
                    onClick={() => pickMention(u)}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 'var(--ws-space-2)',
                      width: '100%',
                      padding: 'var(--ws-space-2)',
                      border: 'none',
                      background: 'none',
                      cursor: 'pointer',
                      textAlign: 'left',
                      color: 'var(--ws-text)',
                    }}
                  >
                    <strong>@{u.username ?? ''}</strong>
                    <span style={{ color: 'var(--ws-text-muted)', fontSize: 'var(--ws-font-size-sm)' }}>
                      {u.displayName ?? u.email}
                    </span>
                  </button>
                ))}
              </div>
            )}

            {/* Dropdown de hashtag */}
            {activeToken?.type === 'hashtag' && hashtagSuggestion && (
              <div
                style={{
                  position: 'absolute',
                  left: 0,
                  right: 0,
                  top: '100%',
                  marginTop: 'var(--ws-space-1)',
                  background: 'var(--ws-surface)',
                  border: '1px solid var(--ws-border)',
                  borderRadius: 'var(--ws-radius-md)',
                  boxShadow: 'var(--ws-shadow-md)',
                  zIndex: 10,
                }}
              >
                <button
                  type="button"
                  onClick={() => pickHashtag(hashtagSuggestion)}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 'var(--ws-space-2)',
                    width: '100%',
                    padding: 'var(--ws-space-2)',
                    border: 'none',
                    background: 'none',
                    cursor: 'pointer',
                    textAlign: 'left',
                    color: 'var(--ws-primary)',
                  }}
                >
                  <i className="bi bi-hash" aria-hidden="true" />
                  {hashtagSuggestion}
                </button>
              </div>
            )}
          </div>

          {/* Vista previa de enlace inline */}
          {link && (
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 'var(--ws-space-2)',
                padding: 'var(--ws-space-2) var(--ws-space-3)',
                border: '1px solid var(--ws-border)',
                borderRadius: 'var(--ws-radius-md)',
                background: 'var(--ws-surface-2)',
              }}
            >
              <i className="bi bi-link-45deg" aria-hidden="true" style={{ color: 'var(--ws-primary)' }} />
              <span
                style={{
                  flex: 1,
                  minWidth: 0,
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                  color: 'var(--ws-primary)',
                  fontSize: 'var(--ws-font-size-sm)',
                }}
              >
                {link}
              </span>
              <span style={{ color: 'var(--ws-text-muted)', fontSize: 'var(--ws-font-size-xs)', whiteSpace: 'nowrap' }}>
                vista previa al publicar
              </span>
            </div>
          )}

          {/* Galería multi-media */}
          {mediaItems.map((m, i) => (
            <div
              key={`${m.url}-${i}`}
              style={{
                border: '1px solid var(--ws-border)',
                borderRadius: 'var(--ws-radius-md)',
                padding: 'var(--ws-space-2)',
                display: 'flex',
                flexDirection: 'column',
                gap: 'var(--ws-space-2)',
              }}
            >
              {m.type === 'video' ? (
                <video
                  src={m.url}
                  controls
                  style={{ width: '100%', maxHeight: 300, borderRadius: 'var(--ws-radius-md)', background: '#000', display: 'block' }}
                />
              ) : (
                <img
                  src={m.url}
                  alt={m.caption || `Medio ${i + 1}`}
                  style={{ width: '100%', maxHeight: 300, objectFit: 'cover', borderRadius: 'var(--ws-radius-md)', display: 'block' }}
                />
              )}
              <div style={row}>
                <Button variant="ghost" type="button" onClick={() => moveMedia(i, -1)} disabled={i === 0} aria-label="Subir">
                  <i className="bi bi-arrow-up" />
                </Button>
                <Button
                  variant="ghost"
                  type="button"
                  onClick={() => moveMedia(i, 1)}
                  disabled={i === mediaItems.length - 1}
                  aria-label="Bajar"
                >
                  <i className="bi bi-arrow-down" />
                </Button>
                <Button variant="ghost" type="button" onClick={() => removeMedia(i)} aria-label="Eliminar">
                  <i className="bi bi-trash" />
                </Button>
                <input
                  className="input"
                  style={{ flex: 1, minWidth: 0 }}
                  placeholder="Pie de foto (opcional)"
                  value={m.caption}
                  onChange={(e) => setCaption(i, e.target.value)}
                  aria-label={`Pie del medio ${i + 1}`}
                />
              </div>
            </div>
          ))}

          {/* Encuesta */}
          {pollMode ? (
            <div
              className="stack"
              style={{
                gap: 'var(--ws-space-2)',
                padding: 'var(--ws-space-3)',
                border: '1px solid var(--ws-border)',
                borderRadius: 'var(--ws-radius-md)',
              }}
            >
              <input
                className="input"
                placeholder="Pregunta de la encuesta"
                value={pollQuestion}
                onChange={(e) => setPollQuestion(e.target.value)}
                aria-label="Pregunta de la encuesta"
              />
              {pollOptions.map((o, i) => (
                <div key={o.id} style={row}>
                  <input
                    className="input"
                    style={{ flex: 1, minWidth: 0 }}
                    placeholder={`Opción ${i + 1}`}
                    value={o.label}
                    onChange={(e) => setOption(i, e.target.value)}
                    aria-label={`Opción ${i + 1}`}
                  />
                  <Button
                    variant="ghost"
                    type="button"
                    onClick={() => removeOption(i)}
                    disabled={pollOptions.length <= 2}
                    aria-label={`Quitar opción ${i + 1}`}
                  >
                    <i className="bi bi-x-lg" />
                  </Button>
                </div>
              ))}
              <div style={row}>
                <Button variant="secondary" type="button" onClick={addOption} disabled={pollOptions.length >= 20}>
                  <i className="bi bi-plus" /> Añadir opción
                </Button>
                <Button variant="ghost" type="button" onClick={() => setPollMode(false)}>
                  Quitar encuesta
                </Button>
              </div>
            </div>
          ) : (
            <div style={row}>
              <Button variant="ghost" type="button" onClick={() => setPollMode(true)}>
                <i className="bi bi-bar-chart" /> Encuesta
              </Button>
            </div>
          )}

          {/* Barra de acciones */}
          <div className="row" style={{ alignItems: 'center', gap: 'var(--ws-space-2)', flexWrap: 'wrap' }}>
            <label className="btn secondary" style={{ cursor: 'pointer', whiteSpace: 'nowrap' }}>
              {uploading ? 'Subiendo…' : 'Foto / video'}
              <input
                type="file"
                accept="image/*,video/*"
                multiple
                style={{ display: 'none' }}
                onChange={onFiles}
                disabled={uploading}
              />
            </label>

            <div style={{ position: 'relative' }}>
              <Button variant="ghost" type="button" onClick={() => setShowEmoji((v) => !v)} aria-label="Emoji">
                <i className="bi bi-emoji-smile" />
              </Button>
              {showEmoji && (
                <div
                  style={{
                    position: 'absolute',
                    bottom: '100%',
                    left: 0,
                    marginBottom: 'var(--ws-space-2)',
                    background: 'var(--ws-surface)',
                    border: '1px solid var(--ws-border)',
                    borderRadius: 'var(--ws-radius-md)',
                    boxShadow: 'var(--ws-shadow-lg)',
                    padding: 'var(--ws-space-2)',
                    zIndex: 20,
                    display: 'grid',
                    gridTemplateColumns: 'repeat(6, 1fr)',
                    gap: 'var(--ws-space-1)',
                    maxHeight: 260,
                    overflowY: 'auto',
                  }}
                >
                  {EMOJIS.map((emo) => (
                    <button
                      key={emo}
                      type="button"
                      onClick={() => insertEmoji(emo)}
                      style={{
                        background: 'none',
                        border: 'none',
                        cursor: 'pointer',
                        fontSize: '1.25rem',
                        padding: 'var(--ws-space-1)',
                        borderRadius: 'var(--ws-radius-md)',
                        lineHeight: 1,
                      }}
                      aria-label={`Insertar emoji ${emo}`}
                    >
                      {emo}
                    </button>
                  ))}
                </div>
              )}
            </div>

            <div style={{ flex: 1 }} />

            <Button type="submit" disabled={publish.isPending || !canPublish}>
              {publish.isPending ? 'Publicando…' : 'Publicar'}
            </Button>
          </div>

          {uploadError && <p style={{ color: 'var(--ws-danger)', margin: 0 }}>{uploadError}</p>}
          {publish.error && <p style={{ color: 'var(--ws-danger)', margin: 0 }}>{publish.error.message}</p>}
        </form>
      </div>
    </div>
  );
}
