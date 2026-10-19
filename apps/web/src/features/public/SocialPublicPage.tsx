import { useState, type ChangeEvent, type FormEvent } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api, uploadFile } from '../../lib/api';
import { useAuthStore } from '../../lib/auth-store';
import { Button } from '../../components/ui/Button';
import { Card } from '../../components/ui/Card';
import { Spinner } from '../../components/ui/Spinner';
import { ConfirmDialog } from '../../components/ui/ConfirmDialog';
import { SiteLayout } from '../../components/SiteLayout';

const SOCIAL_BASE = '/api/v1/blocks/social';
const MEDIA_UPLOAD = '/api/v1/media/upload';

interface SocialPost {
  id: string;
  author: string;
  text: string;
  mediaUrl: string | null;
  mediaType: string | null;
  likes: number;
  createdAt: string;
}

interface SocialUser {
  id: string;
  displayName: string | null;
  username: string | null;
  email: string;
}

interface Follow {
  id: string;
  followerId: string;
  followingId: string;
}

/**
 * Red social pública (`/social`): feed estilo Instagram visible para todos.
 * Los visitantes solo ven el feed; los usuarios logueados pueden publicar
 * (con foto/video), dar me gusta, seguir a otros y eliminar sus propios posts.
 */
export function SocialPublicPage() {
  const qc = useQueryClient();
  const user = useAuthStore((s) => s.user);
  const myId = user?.id ?? null;

  const [text, setText] = useState('');
  const [mediaUrl, setMediaUrl] = useState('');
  const [mediaType, setMediaType] = useState<'image' | 'video' | ''>('');
  const [liked, setLiked] = useState<Set<string>>(new Set());
  const [confirmDeletePost, setConfirmDeletePost] = useState<SocialPost | null>(null);

  const { data: posts, isLoading } = useQuery({
    queryKey: ['public-social-posts'],
    queryFn: () => api.get<SocialPost[]>(`${SOCIAL_BASE}/posts`),
  });

  const { data: users } = useQuery({
    queryKey: ['public-social-users'],
    queryFn: () => api.get<SocialUser[]>(`${SOCIAL_BASE}/users`),
  });

  const { data: follows } = useQuery({
    queryKey: ['public-social-follows', myId],
    queryFn: () => api.get<Follow[]>(`${SOCIAL_BASE}/follow?followerId=${encodeURIComponent(myId ?? '')}`),
    enabled: !!myId,
  });

  const publish = useMutation({
    mutationFn: (payload: Record<string, unknown>) => api.post(`${SOCIAL_BASE}/posts`, payload),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['public-social-posts'] });
      setText('');
      setMediaUrl('');
      setMediaType('');
    },
  });

  const like = useMutation({
    mutationFn: ({ id, value }: { id: string; value: boolean }) =>
      api.patch(`${SOCIAL_BASE}/posts/${id}/like`, { like: value }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['public-social-posts'] }),
  });

  const removePost = useMutation({
    mutationFn: (id: string) => api.del(`${SOCIAL_BASE}/posts/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['public-social-posts'] }),
  });

  const follow = useMutation({
    mutationFn: (targetId: string) =>
      api.post(`${SOCIAL_BASE}/follow`, { followerId: myId, followingId: targetId }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['public-social-follows'] }),
  });

  const unfollow = useMutation({
    mutationFn: (targetId: string) =>
      api.del(
        `${SOCIAL_BASE}/follow?followerId=${encodeURIComponent(myId ?? '')}&followingId=${encodeURIComponent(targetId)}`,
      ),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['public-social-follows'] }),
  });

  const uploadMedia = useMutation({
    mutationFn: (file: File) => uploadFile<{ url: string }>(MEDIA_UPLOAD, file),
    onSuccess: (r) => setMediaUrl(r.url),
    onError: () => setMediaUrl(''),
  });

  const postList = posts ?? [];
  const userList = users ?? [];
  const nameById = new Map<string, string>(
    userList.map((u) => [u.id, u.displayName ?? u.username ?? u.email]),
  );
  const displayName = (id: string) => nameById.get(id) ?? id;

  const myFollowing = new Set(
    (follows ?? []).filter((f) => f.followerId === myId).map((f) => f.followingId),
  );

  const myInitial = (user?.displayName ?? user?.email ?? '?').charAt(0).toUpperCase();

  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    if (!text.trim() || !myId) return;
    publish.mutate({
      author: myId,
      text: text.trim(),
      mediaUrl: mediaUrl.trim() || null,
      mediaType: mediaUrl.trim() ? mediaType || 'image' : null,
    });
  };

  const onFile = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setMediaType(file.type.startsWith('video/') ? 'video' : 'image');
    uploadMedia.mutate(file);
  };

  const toggleLike = (p: SocialPost) => {
    const isLiked = liked.has(p.id);
    setLiked((prev) => {
      const next = new Set(prev);
      if (isLiked) next.delete(p.id);
      else next.add(p.id);
      return next;
    });
    like.mutate({ id: p.id, value: !isLiked });
  };

  return (
    <SiteLayout>
      <div style={{ maxWidth: 620, margin: '0 auto', padding: 'var(--ws-space-6) var(--ws-space-4)', width: '100%' }}>
        <h1 style={{ margin: '0 0 var(--ws-space-4)' }}>Red social</h1>

        {user && (
          <Card style={{ marginBottom: 'var(--ws-space-4)' }}>
            <form className="stack" onSubmit={onSubmit} style={{ gap: 'var(--ws-space-3)' }}>
              <div className="row" style={{ alignItems: 'center', gap: 'var(--ws-space-2)' }}>
                <div
                  style={{
                    width: 36,
                    height: 36,
                    borderRadius: 'var(--ws-radius-full)',
                    background: 'var(--ws-primary-soft)',
                    color: 'var(--ws-primary)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontWeight: 600,
                    flexShrink: 0,
                  }}
                >
                  {myInitial}
                </div>
                <strong style={{ margin: 0 }}>{user.displayName ?? user.email}</strong>
              </div>

              <textarea
                className="input"
                rows={3}
                placeholder="¿Qué estás pensando?"
                value={text}
                onChange={(e) => setText(e.target.value)}
              />

              {mediaUrl &&
                (mediaType === 'video' ? (
                  <video
                    src={mediaUrl}
                    controls
                    style={{ width: '100%', maxHeight: 360, borderRadius: 'var(--ws-radius-md)', background: '#000', display: 'block' }}
                  />
                ) : (
                  <img
                    src={mediaUrl}
                    alt="Vista previa"
                    style={{ width: '100%', maxHeight: 360, objectFit: 'cover', borderRadius: 'var(--ws-radius-md)', display: 'block' }}
                  />
                ))}

              <div className="row" style={{ alignItems: 'center', gap: 'var(--ws-space-2)', flexWrap: 'wrap' }}>
                <label className="btn secondary" style={{ cursor: 'pointer', whiteSpace: 'nowrap' }}>
                  {uploadMedia.isPending ? 'Subiendo…' : 'Foto / video'}
                  <input type="file" accept="image/*,video/*" style={{ display: 'none' }} onChange={onFile} />
                </label>
                <Button type="submit" disabled={publish.isPending || !text.trim()}>Publicar</Button>
              </div>

              {uploadMedia.error && (
                <p style={{ color: 'var(--ws-danger)', margin: 0 }}>No se pudo subir el archivo.</p>
              )}
              {publish.error && <p style={{ color: 'var(--ws-danger)', margin: 0 }}>{publish.error.message}</p>}
            </form>
          </Card>
        )}

        {isLoading ? (
          <Spinner label="Cargando…" />
        ) : postList.length === 0 ? (
          <Card>
            <p className="muted" style={{ margin: 0 }}>Sin publicaciones todavía.</p>
          </Card>
        ) : (
          <div className="stack" style={{ gap: 'var(--ws-space-4)' }}>
            {postList.map((p) => {
              const authorName = displayName(p.author);
              const isMine = myId !== null && p.author === myId;
              const isFollowable = user !== null && !isMine;
              const followed = myFollowing.has(p.author);
              const isLiked = liked.has(p.id);
              return (
                <Card key={p.id} style={{ padding: 0, overflow: 'hidden' }}>
                  <div
                    className="row"
                    style={{ alignItems: 'center', gap: 'var(--ws-space-2)', padding: 'var(--ws-space-3)' }}
                  >
                    <div
                      style={{
                        width: 36,
                        height: 36,
                        borderRadius: 'var(--ws-radius-full)',
                        background: 'var(--ws-primary-soft)',
                        color: 'var(--ws-primary)',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        fontWeight: 600,
                        flexShrink: 0,
                      }}
                    >
                      {authorName.charAt(0).toUpperCase()}
                    </div>
                    <strong style={{ flex: 1, minWidth: 0 }}>{authorName}</strong>
                    {isFollowable && (
                      <Button
                        variant={followed ? 'secondary' : 'primary'}
                        onClick={() => (followed ? unfollow.mutate(p.author) : follow.mutate(p.author))}
                      >
                        {followed ? 'Dejar de seguir' : 'Seguir'}
                      </Button>
                    )}
                    {isMine && (
                      <Button variant="ghost" onClick={() => setConfirmDeletePost(p)}>Eliminar</Button>
                    )}
                  </div>

                  {p.mediaUrl &&
                    (p.mediaType === 'video' ? (
                      <video
                        src={p.mediaUrl}
                        controls
                        style={{ width: '100%', maxHeight: 520, background: '#000', display: 'block' }}
                      />
                    ) : (
                      <img
                        src={p.mediaUrl}
                        alt={p.text}
                        style={{ width: '100%', maxHeight: 520, objectFit: 'cover', display: 'block' }}
                      />
                    ))}

                  <div className="stack" style={{ gap: 'var(--ws-space-2)', padding: 'var(--ws-space-3)' }}>
                    {user ? (
                      <button
                        className="btn ghost"
                        style={{
                          padding: 'var(--ws-space-1) var(--ws-space-2)',
                          fontSize: 'var(--ws-font-size-lg)',
                          alignSelf: 'flex-start',
                        }}
                        onClick={() => toggleLike(p)}
                        disabled={like.isPending}
                      >
                        {isLiked ? '❤️' : '🤍'} {p.likes}
                      </button>
                    ) : (
                      <span style={{ fontSize: 'var(--ws-font-size-lg)' }}>❤️ {p.likes}</span>
                    )}
                    <p style={{ margin: 0, whiteSpace: 'pre-wrap' }}>
                      <strong>{authorName}</strong> {p.text}
                    </p>
                    <span style={{ color: 'var(--ws-text-muted)', fontSize: 'var(--ws-font-size-sm)' }}>
                      {new Date(p.createdAt).toLocaleString()}
                    </span>
                  </div>
                </Card>
              );
            })}
          </div>
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
          ¿Eliminar esta publicación?
        </ConfirmDialog>
      </div>
    </SiteLayout>
  );
}
