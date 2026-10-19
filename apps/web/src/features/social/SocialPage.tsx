import { useState, type ChangeEvent, type FormEvent } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api, uploadFile } from '../../lib/api';
import { useAuthStore } from '../../lib/auth-store';
import { Button } from '../../components/ui/Button';
import { Card } from '../../components/ui/Card';
import { Spinner } from '../../components/ui/Spinner';
import { ConfirmDialog } from '../../components/ui/ConfirmDialog';

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
  createdAt: string;
}

type View = 'feed' | 'follow' | 'publish';

export function SocialPage() {
  const qc = useQueryClient();
  const user = useAuthStore((s) => s.user);
  const myId = user?.id ?? null;

  const [view, setView] = useState<View>('feed');
  const [feedScope, setFeedScope] = useState<'following' | 'all'>('following');

  const [text, setText] = useState('');
  const [mediaUrl, setMediaUrl] = useState('');
  const [mediaType, setMediaType] = useState<'image' | 'video' | ''>('');

  const [liked, setLiked] = useState<Set<string>>(new Set());
  const [confirmDeletePost, setConfirmDeletePost] = useState<SocialPost | null>(null);

  const { data: users } = useQuery({
    queryKey: ['social-users'],
    queryFn: () => api.get<SocialUser[]>(`${SOCIAL_BASE}/users`),
  });

  const { data: posts, isLoading } = useQuery({
    queryKey: ['social-posts', feedScope, myId],
    queryFn: () =>
      api.get<SocialPost[]>(
        feedScope === 'following' && myId
          ? `${SOCIAL_BASE}/posts?followingOf=${encodeURIComponent(myId)}`
          : `${SOCIAL_BASE}/posts`,
      ),
  });

  const { data: follows } = useQuery({
    queryKey: ['social-follows'],
    queryFn: () => api.get<Follow[]>(`${SOCIAL_BASE}/follow`),
  });

  const publish = useMutation({
    mutationFn: (payload: Record<string, unknown>) => api.post(`${SOCIAL_BASE}/posts`, payload),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['social-posts'] });
      setText('');
      setMediaUrl('');
      setMediaType('');
    },
  });

  const like = useMutation({
    mutationFn: ({ id, value }: { id: string; value: boolean }) =>
      api.patch(`${SOCIAL_BASE}/posts/${id}/like`, { like: value }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['social-posts'] }),
  });

  const removePost = useMutation({
    mutationFn: (id: string) => api.del(`${SOCIAL_BASE}/posts/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['social-posts'] }),
  });

  const follow = useMutation({
    mutationFn: (targetId: string) =>
      api.post(`${SOCIAL_BASE}/follow`, { followerId: myId, followingId: targetId }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['social-follows'] });
      qc.invalidateQueries({ queryKey: ['social-posts'] });
    },
  });

  const unfollow = useMutation({
    mutationFn: (targetId: string) =>
      api.del(
        `${SOCIAL_BASE}/follow?followerId=${encodeURIComponent(myId ?? '')}&followingId=${encodeURIComponent(targetId)}`,
      ),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['social-follows'] });
      qc.invalidateQueries({ queryKey: ['social-posts'] });
    },
  });

  const uploadMedia = useMutation({
    mutationFn: (file: File) => uploadFile<{ url: string }>(MEDIA_UPLOAD, file),
    onSuccess: (r) => setMediaUrl(r.url),
    onError: () => setMediaUrl(''),
  });

  const userList = users ?? [];
  const nameById = new Map<string, string>(
    userList.map((u) => [u.id, u.displayName ?? u.username ?? u.email]),
  );
  const displayName = (id: string) => nameById.get(id) ?? id;

  const followList = follows ?? [];
  const myFollowing = new Set(
    followList.filter((f) => f.followerId === myId).map((f) => f.followingId),
  );
  const followerCount = (id: string) => followList.filter((f) => f.followingId === id).length;
  const followingCount = (id: string) => followList.filter((f) => f.followerId === id).length;

  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    if (!text.trim()) return;
    publish.mutate({
      author: myId ?? user?.displayName ?? user?.email ?? 'anon',
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

  if (isLoading && view === 'feed') return <Spinner label="Cargando…" />;

  const postList = posts ?? [];

  const navBtn = (active: boolean) => ({
    textAlign: 'left' as const,
    background: active ? 'var(--ws-primary-soft)' : 'none',
    color: active ? 'var(--ws-primary)' : 'var(--ws-text)',
    border: 'none',
    borderRadius: 'var(--ws-radius-md)',
    padding: 'var(--ws-space-2) var(--ws-space-3)',
    cursor: 'pointer',
    width: '100%',
  });

  return (
    <div className="row" style={{ alignItems: 'flex-start', gap: 'var(--ws-space-6)' }}>
      <aside className="stack" style={{ minWidth: 220, maxWidth: 220, gap: 'var(--ws-space-1)' }}>
        <h1 style={{ fontSize: 'var(--ws-font-size-lg)', margin: 0 }}>Red social</h1>
        <button style={navBtn(view === 'feed')} onClick={() => setView('feed')}>Feed</button>
        <button style={navBtn(view === 'follow')} onClick={() => setView('follow')}>Seguir</button>
        <button style={navBtn(view === 'publish')} onClick={() => setView('publish')}>Publicar</button>
      </aside>

      <div className="stack" style={{ flex: 1, minWidth: 0, gap: 'var(--ws-space-4)' }}>
        {view === 'feed' && (
          <>
            <div className="row" style={{ justifyContent: 'space-between', alignItems: 'center', gap: 'var(--ws-space-2)' }}>
              <h2 style={{ margin: 0 }}>{feedScope === 'following' ? 'Para ti' : 'Todos'}</h2>
              <div className="row" style={{ gap: 'var(--ws-space-2)' }}>
                <Button variant={feedScope === 'following' ? 'primary' : 'secondary'} onClick={() => setFeedScope('following')}>
                  Siguiendo
                </Button>
                <Button variant={feedScope === 'all' ? 'primary' : 'secondary'} onClick={() => setFeedScope('all')}>
                  Todos
                </Button>
              </div>
            </div>

            <div className="stack" style={{ gap: 'var(--ws-space-4)' }}>
              {postList.map((p) => {
                const authorName = displayName(p.author);
                const isMine = myId !== null && p.author === myId;
                const isFollowable = myId !== null && !isMine && nameById.has(p.author);
                const isLiked = liked.has(p.id);
                return (
                  <Card key={p.id} style={{ padding: 0, overflow: 'hidden' }}>
                    <div className="row" style={{ alignItems: 'center', gap: 'var(--ws-space-2)', padding: 'var(--ws-space-3) var(--ws-space-4)' }}>
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
                          variant={myFollowing.has(p.author) ? 'secondary' : 'primary'}
                          onClick={() =>
                            myFollowing.has(p.author) ? unfollow.mutate(p.author) : follow.mutate(p.author)
                          }
                        >
                          {myFollowing.has(p.author) ? 'Dejar de seguir' : 'Seguir'}
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
                          style={{ width: '100%', maxHeight: 480, background: '#000', display: 'block' }}
                        />
                      ) : (
                        <img
                          src={p.mediaUrl}
                          alt={p.text}
                          style={{ width: '100%', maxHeight: 480, objectFit: 'cover', display: 'block' }}
                        />
                      ))}

                    <div className="stack" style={{ gap: 'var(--ws-space-2)', padding: 'var(--ws-space-3) var(--ws-space-4)' }}>
                      <div className="row" style={{ alignItems: 'center', gap: 'var(--ws-space-2)' }}>
                        <button
                          className="btn ghost"
                          style={{ padding: 'var(--ws-space-1) var(--ws-space-2)', fontSize: 'var(--ws-font-size-lg)' }}
                          onClick={() => toggleLike(p)}
                          disabled={like.isPending}
                        >
                          {isLiked ? '❤️' : '🤍'} {p.likes}
                        </button>
                        <span style={{ color: 'var(--ws-text-muted)', fontSize: 'var(--ws-font-size-sm)' }}>Me gusta</span>
                      </div>
                      <p style={{ margin: 0, whiteSpace: 'pre-wrap' }}>{p.text}</p>
                      <span style={{ color: 'var(--ws-text-muted)', fontSize: 'var(--ws-font-size-sm)' }}>
                        {new Date(p.createdAt).toLocaleString()}
                      </span>
                    </div>
                  </Card>
                );
              })}
              {postList.length === 0 && (
                <Card>
                  <p style={{ color: 'var(--ws-text-muted)', margin: 0 }}>Sin publicaciones todavía.</p>
                </Card>
              )}
            </div>
          </>
        )}

        {view === 'follow' && (
          <Card>
            <h2 style={{ marginTop: 0 }}>Usuarios</h2>
            <div className="stack" style={{ gap: 'var(--ws-space-2)' }}>
              {userList.map((u) => {
                const isMe = u.id === myId;
                const followed = myFollowing.has(u.id);
                const name = u.displayName ?? u.username ?? u.email;
                return (
                  <div
                    key={u.id}
                    className="row"
                    style={{
                      alignItems: 'center',
                      gap: 'var(--ws-space-3)',
                      padding: 'var(--ws-space-2)',
                      border: '1px solid var(--ws-border)',
                      borderRadius: 'var(--ws-radius-md)',
                    }}
                  >
                    <div
                      style={{
                        width: 40,
                        height: 40,
                        borderRadius: 'var(--ws-radius-full)',
                        background: 'var(--ws-surface-2)',
                        color: 'var(--ws-text)',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        fontWeight: 600,
                        flexShrink: 0,
                      }}
                    >
                      {name.charAt(0).toUpperCase()}
                    </div>
                    <div className="stack" style={{ flex: 1, minWidth: 0, gap: 'var(--ws-space-1)' }}>
                      <strong style={{ margin: 0 }}>{name}</strong>
                      <span style={{ color: 'var(--ws-text-muted)', fontSize: 'var(--ws-font-size-sm)', margin: 0 }}>
                        @{u.username ?? u.email} · {followerCount(u.id)} seguidores · {followingCount(u.id)} siguiendo
                      </span>
                    </div>
                    {isMe ? (
                      <span style={{ color: 'var(--ws-text-muted)', fontSize: 'var(--ws-font-size-sm)' }}>Tú</span>
                    ) : (
                      <Button
                        variant={followed ? 'secondary' : 'primary'}
                        onClick={() => (followed ? unfollow.mutate(u.id) : follow.mutate(u.id))}
                      >
                        {followed ? 'Dejar de seguir' : 'Seguir'}
                      </Button>
                    )}
                  </div>
                );
              })}
              {userList.length === 0 && (
                <p style={{ color: 'var(--ws-text-muted)', margin: 0 }}>No hay usuarios disponibles.</p>
              )}
            </div>
          </Card>
        )}

        {view === 'publish' && (
          <Card>
            <h2 style={{ marginTop: 0 }}>Publicar</h2>
            <form className="stack" onSubmit={onSubmit} style={{ gap: 'var(--ws-space-3)' }}>
              <div className="field">
                <label>Texto</label>
                <textarea className="input" rows={4} value={text} onChange={(e) => setText(e.target.value)} required />
              </div>

              <div className="field">
                <label>Imagen / video</label>
                <div className="row" style={{ alignItems: 'center', gap: 'var(--ws-space-2)', flexWrap: 'wrap' }}>
                  <input
                    className="input"
                    type="url"
                    placeholder="https://… (URL de imagen o video)"
                    value={mediaUrl}
                    onChange={(e) => setMediaUrl(e.target.value)}
                    style={{ flex: 1, minWidth: 200 }}
                  />
                  <label className="btn secondary" style={{ cursor: 'pointer', whiteSpace: 'nowrap' }}>
                    {uploadMedia.isPending ? 'Subiendo…' : 'Subir archivo'}
                    <input type="file" accept="image/*,video/*" style={{ display: 'none' }} onChange={onFile} />
                  </label>
                </div>
                {uploadMedia.error && (
                  <p style={{ color: 'var(--ws-danger)', margin: 'var(--ws-space-1) 0 0' }}>No se pudo subir el archivo.</p>
                )}
              </div>

              <div className="field">
                <label>Tipo de media</label>
                <select className="input" style={{ width: 'auto' }} value={mediaType} onChange={(e) => setMediaType(e.target.value as 'image' | 'video' | '')}>
                  <option value="">Ninguno</option>
                  <option value="image">Imagen</option>
                  <option value="video">Video</option>
                </select>
              </div>

              <div className="row" style={{ alignItems: 'center', gap: 'var(--ws-space-2)' }}>
                <Button type="submit" disabled={publish.isPending || !text.trim()}>Publicar</Button>
                {publish.isSuccess && <span style={{ color: 'var(--ws-success)' }}>Publicado</span>}
              </div>
              {publish.error && <p style={{ color: 'var(--ws-danger)', margin: 0 }}>{publish.error.message}</p>}
            </form>
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
          ¿Eliminar esta publicación?
        </ConfirmDialog>
      </div>
    </div>
  );
}
