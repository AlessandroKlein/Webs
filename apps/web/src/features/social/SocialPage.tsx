import { useState, type FormEvent } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../../lib/api';
import { Button } from '../../components/ui/Button';
import { Card } from '../../components/ui/Card';
import { Spinner } from '../../components/ui/Spinner';
import { TextField } from '../../components/ui/TextField';
import { ConfirmDialog } from '../../components/ui/ConfirmDialog';

const SOCIAL_BASE = '/api/v1/blocks/social';
const COMMENTS_BASE = '/api/v1/blocks/comments';

interface SocialPost {
  id: string;
  author: string;
  text: string;
  mediaUrl: string | null;
  mediaType: string | null;
  likes: number;
  createdAt: string;
}

interface Comment {
  id: string;
  author: string;
  body: string;
  rating: number;
  createdAt: string;
}

type View = 'feed' | 'comments';

export function SocialPage() {
  const qc = useQueryClient();
  const [view, setView] = useState<View>('feed');

  const [author, setAuthor] = useState('');
  const [text, setText] = useState('');
  const [mediaUrl, setMediaUrl] = useState('');
  const [mediaType, setMediaType] = useState('');

  const [confirmDeletePost, setConfirmDeletePost] = useState<SocialPost | null>(null);
  const [confirmDeleteComment, setConfirmDeleteComment] = useState<Comment | null>(null);

  const { data: posts, isLoading } = useQuery({
    queryKey: ['social-posts'],
    queryFn: () => api.get<SocialPost[]>(`${SOCIAL_BASE}/posts`),
  });

  const { data: comments } = useQuery({
    queryKey: ['social-comments'],
    queryFn: () => api.get<Comment[]>(`${COMMENTS_BASE}/comments`),
    enabled: view === 'comments',
  });

  const publish = useMutation({
    mutationFn: (payload: Record<string, unknown>) => api.post(`${SOCIAL_BASE}/posts`, payload),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['social-posts'] });
      setAuthor('');
      setText('');
      setMediaUrl('');
      setMediaType('');
    },
  });

  const like = useMutation({
    mutationFn: (id: string) => api.patch(`${SOCIAL_BASE}/posts/${id}/like`, {}),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['social-posts'] }),
  });

  const removePost = useMutation({
    mutationFn: (id: string) => api.del(`${SOCIAL_BASE}/posts/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['social-posts'] }),
  });

  const removeComment = useMutation({
    mutationFn: (id: string) => api.del(`${COMMENTS_BASE}/comments/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['social-comments'] }),
  });

  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    const payload: Record<string, unknown> = {
      author: author.trim(),
      text: text.trim(),
      mediaUrl: mediaUrl.trim() || undefined,
      mediaType: mediaType || undefined,
    };
    publish.mutate(payload);
  };

  if (isLoading) return <Spinner />;

  const postList = posts ?? [];
  const commentList = comments ?? [];

  return (
    <div className="row" style={{ alignItems: 'flex-start', gap: 'var(--ws-space-6)' }}>
      <aside className="stack" style={{ minWidth: 220, maxWidth: 220 }}>
        <h1 style={{ fontSize: 'var(--ws-font-size-lg)', margin: 0 }}>Social</h1>
        <button
          className={`nav-link ${view === 'feed' ? 'active' : ''}`}
          style={{ textAlign: 'left', background: 'none', border: 'none', cursor: 'pointer' }}
          onClick={() => setView('feed')}
        >
          Feed
        </button>
        <button
          className={`nav-link ${view === 'comments' ? 'active' : ''}`}
          style={{ textAlign: 'left', background: 'none', border: 'none', cursor: 'pointer' }}
          onClick={() => setView('comments')}
        >
          Comentarios
        </button>
      </aside>

      <div className="stack" style={{ flex: 1, minWidth: 0 }}>
        {view === 'feed' && (
          <>
            <Card>
              <h3 style={{ marginTop: 0 }}>Publicar</h3>
              <form className="stack" onSubmit={onSubmit}>
                <div className="row" style={{ alignItems: 'flex-end', flexWrap: 'wrap', gap: 'var(--ws-space-2)' }}>
                  <TextField label="Autor" value={author} onChange={(e) => setAuthor(e.target.value)} required />
                  <TextField label="URL de medio" value={mediaUrl} onChange={(e) => setMediaUrl(e.target.value)} placeholder="Opcional" />
                  <div className="field">
                    <label>Tipo de medio</label>
                    <select className="input" style={{ width: 'auto' }} value={mediaType} onChange={(e) => setMediaType(e.target.value)}>
                      <option value="">Ninguno</option>
                      <option value="image">Imagen</option>
                      <option value="video">Video</option>
                    </select>
                  </div>
                </div>
                <div className="field">
                  <label>Texto</label>
                  <textarea className="input" rows={3} value={text} onChange={(e) => setText(e.target.value)} required />
                </div>
                <div className="row">
                  <Button type="submit" disabled={publish.isPending}>Publicar</Button>
                  {publish.isSuccess && <span style={{ color: 'var(--ws-success)' }}>Publicado ✓</span>}
                </div>
                {publish.error && <p style={{ color: 'var(--ws-danger)', margin: 0 }}>{publish.error.message}</p>}
              </form>
            </Card>

            <div className="stack">
              {postList.map((p) => (
                <Card key={p.id}>
                  <div className="row" style={{ justifyContent: 'space-between', alignItems: 'flex-start' }}>
                    <div className="stack" style={{ minWidth: 0 }}>
                      <strong>{p.author}</strong>
                      {p.mediaUrl && (
                        <span className="muted">
                          {p.mediaType === 'video' ? 'Video' : 'Imagen'}:{' '}
                          <a href={p.mediaUrl} target="_blank" rel="noreferrer">{p.mediaUrl}</a>
                        </span>
                      )}
                      <p style={{ margin: 'var(--ws-space-2) 0' }}>{p.text}</p>
                    </div>
                    <Button variant="ghost" onClick={() => setConfirmDeletePost(p)}>Eliminar</Button>
                  </div>
                  <div className="row" style={{ justifyContent: 'space-between', alignItems: 'center' }}>
                    <Button variant="secondary" onClick={() => like.mutate(p.id)} disabled={like.isPending}>
                      👍 Me gusta · {p.likes}
                    </Button>
                    <span className="muted">{new Date(p.createdAt).toLocaleString()}</span>
                  </div>
                </Card>
              ))}
              {postList.length === 0 && (
                <Card>
                  <p className="muted">No hay publicaciones.</p>
                </Card>
              )}
            </div>
          </>
        )}

        {view === 'comments' && (
          <Card>
            <h3 style={{ marginTop: 0 }}>Comentarios</h3>
            <table className="table">
              <thead>
                <tr>
                  <th>Autor</th>
                  <th>Comentario</th>
                  <th>Valoración</th>
                  <th>Fecha</th>
                  <th>Acciones</th>
                </tr>
              </thead>
              <tbody>
                {commentList.map((c) => (
                  <tr key={c.id}>
                    <td>{c.author}</td>
                    <td>{c.body}</td>
                    <td>{c.rating}</td>
                    <td>{new Date(c.createdAt).toLocaleString()}</td>
                    <td>
                      <Button variant="ghost" onClick={() => setConfirmDeleteComment(c)}>Eliminar</Button>
                    </td>
                  </tr>
                ))}
                {commentList.length === 0 && (
                  <tr>
                    <td colSpan={5}>
                      <p className="muted">No hay comentarios.</p>
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </Card>
        )}

        <ConfirmDialog
          open={confirmDeletePost !== null}
          title="Eliminar publicación"
          confirmLabel="Eliminar"
          danger
          onConfirm={() => {
            if (confirmDeletePost) removePost.mutate(confirmDeletePost.id);
            setConfirmDeletePost(null);
          }}
          onCancel={() => setConfirmDeletePost(null)}
        >
          ¿Eliminar la publicación de <strong>{confirmDeletePost?.author}</strong>? Esta acción es irreversible.
        </ConfirmDialog>

        <ConfirmDialog
          open={confirmDeleteComment !== null}
          title="Eliminar comentario"
          confirmLabel="Eliminar"
          danger
          onConfirm={() => {
            if (confirmDeleteComment) removeComment.mutate(confirmDeleteComment.id);
            setConfirmDeleteComment(null);
          }}
          onCancel={() => setConfirmDeleteComment(null)}
        >
          ¿Eliminar el comentario de <strong>{confirmDeleteComment?.author}</strong>? Esta acción es irreversible.
        </ConfirmDialog>
      </div>
    </div>
  );
}
