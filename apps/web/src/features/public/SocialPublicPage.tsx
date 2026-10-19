import { useState, type CSSProperties, type ChangeEvent, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api, uploadFile } from '../../lib/api';
import { useAuthStore } from '../../lib/auth-store';
import { Button } from '../../components/ui/Button';
import { Card } from '../../components/ui/Card';
import { Spinner } from '../../components/ui/Spinner';
import { ConfirmDialog } from '../../components/ui/ConfirmDialog';
import { SiteLayout } from '../../components/SiteLayout';
import { SocialDirect, Avatar } from './SocialDirect';

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

interface Story {
  id: string;
  mediaUrl: string;
  mediaType: string;
  createdAt: string;
  expiresAt: string;
}

interface StoryGroup {
  author: string;
  stories: Story[];
}

const STORY_RING = 'linear-gradient(45deg, #f58529, #dd2a7b, #8134af, #515bd4)';

/**
 * Red social pública (`/social`) estilo Instagram con toques de Twitter:
 * header propio, barra de historias (con visor a pantalla completa), feed con
 * tabs "Siguiendo"/"Todos", nueva publicación y sección de mensajes directos.
 * Los visitantes (sin sesión) solo ven el feed "Todos".
 */
export function SocialPublicPage() {
  const qc = useQueryClient();
  const user = useAuthStore((s) => s.user);
  const myId = user?.id ?? null;

  const [tab, setTab] = useState<'following' | 'all'>(user ? 'following' : 'all');
  const [liked, setLiked] = useState<Set<string>>(new Set());
  const [confirmDeletePost, setConfirmDeletePost] = useState<SocialPost | null>(null);
  const [showNewPost, setShowNewPost] = useState(false);
  const [showDirect, setShowDirect] = useState(false);

  // Nueva publicación
  const [text, setText] = useState('');
  const [mediaUrl, setMediaUrl] = useState('');
  const [mediaType, setMediaType] = useState<'image' | 'video' | ''>('');

  // Historias
  const [storyAuthor, setStoryAuthor] = useState<string | null>(null);
  const [storyIndex, setStoryIndex] = useState(0);

  const { data: allPosts, isLoading: allLoading } = useQuery({
    queryKey: ['social-posts', 'all'],
    queryFn: () => api.get<SocialPost[]>(`${SOCIAL_BASE}/posts`),
  });

  const { data: followingPosts, isLoading: followingLoading } = useQuery({
    queryKey: ['social-posts', 'following', myId],
    queryFn: () =>
      api.get<SocialPost[]>(`${SOCIAL_BASE}/posts?followingOf=${encodeURIComponent(myId ?? '')}`),
    enabled: !!myId,
  });

  const { data: users } = useQuery({
    queryKey: ['social-users'],
    queryFn: () => api.get<SocialUser[]>(`${SOCIAL_BASE}/users`),
  });

  const { data: follows } = useQuery({
    queryKey: ['social-follows', myId],
    queryFn: () => api.get<Follow[]>(`${SOCIAL_BASE}/follow?followerId=${encodeURIComponent(myId ?? '')}`),
    enabled: !!myId,
  });

  const { data: stories } = useQuery({
    queryKey: ['social-stories'],
    queryFn: () => api.get<StoryGroup[]>(`${SOCIAL_BASE}/stories`),
  });

  const publish = useMutation({
    mutationFn: (payload: { author: string; text: string; mediaUrl: string | null; mediaType: string | null }) =>
      api.post(`${SOCIAL_BASE}/posts`, payload),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['social-posts'] });
      setText('');
      setMediaUrl('');
      setMediaType('');
      setShowNewPost(false);
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
    onSuccess: () => qc.invalidateQueries({ queryKey: ['social-follows'] }),
  });

  const unfollow = useMutation({
    mutationFn: (targetId: string) =>
      api.del(
        `${SOCIAL_BASE}/follow?followerId=${encodeURIComponent(myId ?? '')}&followingId=${encodeURIComponent(targetId)}`,
      ),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['social-follows'] }),
  });

  const uploadMedia = useMutation({
    mutationFn: (file: File) => uploadFile<{ url: string }>(MEDIA_UPLOAD, file),
    onSuccess: (r) => setMediaUrl(r.url),
    onError: () => setMediaUrl(''),
  });

  const uploadStory = useMutation({
    mutationFn: async (file: File) => {
      const up = await uploadFile<{ url: string }>(MEDIA_UPLOAD, file);
      return api.post(`${SOCIAL_BASE}/stories`, {
        author: myId,
        mediaUrl: up.url,
        mediaType: file.type.startsWith('video/') ? 'video' : 'image',
      });
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['social-stories'] }),
  });

  const deleteStory = useMutation({
    mutationFn: (id: string) => api.del(`${SOCIAL_BASE}/stories/${id}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['social-stories'] });
      setStoryAuthor(null);
      setStoryIndex(0);
    },
  });

  const userList = users ?? [];
  const userById = new Map<string, SocialUser>(userList.map((u) => [u.id, u]));
  const nameOf = (id: string) => {
    const u = userById.get(id);
    return u?.displayName ?? u?.username ?? u?.email ?? id;
  };
  const usernameOf = (id: string) => userById.get(id)?.username ?? '';

  const myFollowing = new Set((follows ?? []).map((f) => f.followingId));

  const activeTab: 'following' | 'all' = user ? tab : 'all';
  const posts = activeTab === 'following' && user ? followingPosts : allPosts;
  const isLoading = activeTab === 'following' && user ? followingLoading : allLoading;

  const myStories = (stories ?? []).find((g) => g.author === myId);
  const openGroup = storyAuthor ? (stories ?? []).find((g) => g.author === storyAuthor) ?? null : null;
  const currentStory = openGroup ? openGroup.stories[storyIndex] ?? null : null;

  const myInitialName = user?.displayName ?? user?.email ?? '?';

  const openStory = (authorId: string) => {
    setStoryAuthor(authorId);
    setStoryIndex(0);
  };
  const closeStory = () => {
    setStoryAuthor(null);
    setStoryIndex(0);
  };
  const nextStory = () => {
    if (!openGroup || openGroup.stories.length === 0) return;
    setStoryIndex((i) => (i + 1) % openGroup.stories.length);
  };
  const prevStory = () => {
    if (!openGroup || openGroup.stories.length === 0) return;
    setStoryIndex((i) => (i - 1 + openGroup.stories.length) % openGroup.stories.length);
  };

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

  const onNewPostFile = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setMediaType(file.type.startsWith('video/') ? 'video' : 'image');
    uploadMedia.mutate(file);
    e.currentTarget.value = '';
  };

  const onStoryFile = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !myId) return;
    uploadStory.mutate(file);
    e.currentTarget.value = '';
  };

  const toggleLike = (p: SocialPost) => {
    if (!user) return;
    const isLiked = liked.has(p.id);
    setLiked((prev) => {
      const next = new Set(prev);
      if (isLiked) next.delete(p.id);
      else next.add(p.id);
      return next;
    });
    like.mutate({ id: p.id, value: !isLiked });
  };

  const tabStyle = (active: boolean): CSSProperties => ({
    flex: 1,
    padding: 'var(--ws-space-2)',
    border: 'none',
    background: 'none',
    borderBottom: active ? '2px solid var(--ws-primary)' : '2px solid transparent',
    color: active ? 'var(--ws-text)' : 'var(--ws-text-muted)',
    fontWeight: active ? 600 : 400,
    cursor: 'pointer',
  });

  return (
    <SiteLayout>
      {/* Header propio estilo Instagram */}
      <header
        style={{
          position: 'sticky',
          top: 0,
          zIndex: 20,
          background: 'var(--ws-surface)',
          borderBottom: '1px solid var(--ws-border)',
        }}
      >
        <div
          style={{
            maxWidth: 620,
            margin: '0 auto',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 'var(--ws-space-3)',
            padding: 'var(--ws-space-3) var(--ws-space-4)',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--ws-space-2)', minWidth: 0 }}>
            <i
              className="bi bi-instagram"
              style={{ fontSize: '1.5rem', color: 'var(--ws-primary)' }}
            />
            <strong style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
              {user ? user.displayName ?? user.email : 'Red social'}
            </strong>
          </div>

          {user ? (
            <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--ws-space-3)' }}>
              <button
                className="btn ghost"
                style={{ padding: 'var(--ws-space-2)' }}
                onClick={() => setShowNewPost(true)}
                title="Nueva publicación"
                aria-label="Nueva publicación"
              >
                <i className="bi bi-plus-square" style={{ fontSize: '1.25rem' }} />
              </button>
              <button
                className="btn ghost"
                style={{ padding: 'var(--ws-space-2)' }}
                onClick={() => setShowDirect(true)}
                title="Mensajes"
                aria-label="Mensajes"
              >
                <i className="bi bi-send" style={{ fontSize: '1.25rem' }} />
              </button>
              <Avatar name={myInitialName} url={user.avatarUrl} size={34} />
            </div>
          ) : (
            <Link to="/login" className="btn">
              Iniciar sesión
            </Link>
          )}
        </div>
      </header>

      <div
        style={{
          maxWidth: 620,
          margin: '0 auto',
          padding: 'var(--ws-space-4) var(--ws-space-4) var(--ws-space-6)',
          width: '100%',
          boxSizing: 'border-box',
        }}
      >
        {/* Barra de historias */}
        <div
          style={{
            display: 'flex',
            gap: 'var(--ws-space-4)',
            overflowX: 'auto',
            padding: 'var(--ws-space-3) 0 var(--ws-space-4)',
            borderBottom: '1px solid var(--ws-border)',
            marginBottom: 'var(--ws-space-4)',
          }}
        >
          {user && (
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 'var(--ws-space-1)', flexShrink: 0 }}>
              <div style={{ position: 'relative' }}>
                <button
                  onClick={() => (myStories ? openStory(myId ?? '') : undefined)}
                  disabled={!myStories}
                  style={{
                    width: 64,
                    height: 64,
                    borderRadius: '50%',
                    padding: 2.5,
                    boxSizing: 'border-box',
                    background: myStories ? STORY_RING : 'var(--ws-border)',
                    border: 'none',
                    cursor: myStories ? 'pointer' : 'default',
                    display: 'block',
                  }}
                  title="Tu historia"
                >
                  <div
                    style={{
                      width: '100%',
                      height: '100%',
                      borderRadius: '50%',
                      background: 'var(--ws-surface)',
                      padding: 2,
                      boxSizing: 'border-box',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                    }}
                  >
                    <Avatar name={myInitialName} url={user.avatarUrl} size={52} />
                  </div>
                </button>
                <label
                  style={{
                    position: 'absolute',
                    right: -2,
                    bottom: -2,
                    width: 22,
                    height: 22,
                    borderRadius: '50%',
                    background: 'var(--ws-primary)',
                    color: 'var(--ws-on-primary)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    cursor: 'pointer',
                    border: '2px solid var(--ws-surface)',
                  }}
                  title="Subir historia"
                >
                  <input
                    type="file"
                    accept="image/*,video/*"
                    style={{ display: 'none' }}
                    onChange={onStoryFile}
                  />
                  <i className="bi bi-plus" style={{ fontSize: '0.85rem', lineHeight: 1 }} />
                </label>
              </div>
              <span style={{ fontSize: 'var(--ws-font-size-sm)', color: 'var(--ws-text-muted)' }}>Tu historia</span>
            </div>
          )}

          {(stories ?? []).map((g) => {
            const name = nameOf(g.author);
            return (
              <button
                key={g.author}
                onClick={() => openStory(g.author)}
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  gap: 'var(--ws-space-1)',
                  background: 'none',
                  border: 'none',
                  padding: 0,
                  cursor: 'pointer',
                  flexShrink: 0,
                }}
              >
                <div
                  style={{
                    width: 64,
                    height: 64,
                    borderRadius: '50%',
                    padding: 2.5,
                    boxSizing: 'border-box',
                    background: STORY_RING,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  <div
                    style={{
                      width: '100%',
                      height: '100%',
                      borderRadius: '50%',
                      background: 'var(--ws-surface)',
                      padding: 2,
                      boxSizing: 'border-box',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                    }}
                  >
                    <Avatar name={name} size={52} />
                  </div>
                </div>
                <span
                  style={{
                    fontSize: 'var(--ws-font-size-sm)',
                    color: 'var(--ws-text-muted)',
                    maxWidth: 70,
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                  }}
                >
                  {name}
                </span>
              </button>
            );
          })}

          {(stories ?? []).length === 0 && (
            <p style={{ color: 'var(--ws-text-muted)', margin: 0, alignSelf: 'center', whiteSpace: 'nowrap' }}>
              Sin historias todavía.
            </p>
          )}
        </div>

        {/* Tabs del feed */}
        <div className="row" style={{ marginBottom: 'var(--ws-space-3)' }}>
          {user && (
            <button style={tabStyle(activeTab === 'following')} onClick={() => setTab('following')}>
              Siguiendo
            </button>
          )}
          <button style={tabStyle(activeTab === 'all')} onClick={() => setTab('all')}>
            Todos
          </button>
        </div>

        {/* Feed */}
        {isLoading ? (
          <Spinner label="Cargando…" />
        ) : (posts ?? []).length === 0 ? (
          <Card>
            <p style={{ color: 'var(--ws-text-muted)', margin: 0 }}>
              {activeTab === 'following'
                ? 'Sigue a otros usuarios para ver sus publicaciones aquí.'
                : 'Sin publicaciones todavía.'}
            </p>
          </Card>
        ) : (
          <div className="stack" style={{ gap: 'var(--ws-space-4)' }}>
            {(posts ?? []).map((p) => {
              const authorName = nameOf(p.author);
              const authorUsername = usernameOf(p.author);
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
                    <Avatar name={authorName} size={38} />
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <strong style={{ display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {authorName}
                      </strong>
                      {authorUsername && (
                        <span style={{ color: 'var(--ws-text-muted)', fontSize: 'var(--ws-font-size-sm)' }}>
                          @{authorUsername}
                        </span>
                      )}
                    </div>
                    {isFollowable && (
                      <Button
                        variant={followed ? 'secondary' : 'primary'}
                        style={{ padding: 'var(--ws-space-1) var(--ws-space-2)', fontSize: 'var(--ws-font-size-sm)' }}
                        onClick={() => (followed ? unfollow.mutate(p.author) : follow.mutate(p.author))}
                        disabled={follow.isPending || unfollow.isPending}
                      >
                        {followed ? 'Dejar de seguir' : 'Seguir'}
                      </Button>
                    )}
                    {isMine && (
                      <Button variant="ghost" onClick={() => setConfirmDeletePost(p)}>
                        Eliminar
                      </Button>
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
                    <div className="row" style={{ alignItems: 'center', gap: 'var(--ws-space-3)' }}>
                      {user ? (
                        <button
                          className="btn ghost"
                          style={{
                            padding: 'var(--ws-space-1) var(--ws-space-2)',
                            fontSize: '1.35rem',
                            color: isLiked ? 'var(--ws-danger)' : undefined,
                          }}
                          onClick={() => toggleLike(p)}
                          disabled={like.isPending}
                          title={isLiked ? 'Quitar me gusta' : 'Me gusta'}
                          aria-label={isLiked ? 'Quitar me gusta' : 'Me gusta'}
                        >
                          <i className={`bi ${isLiked ? 'bi-heart-fill' : 'bi-heart'}`} />
                        </button>
                      ) : (
                        <span style={{ fontSize: '1.35rem', color: 'var(--ws-danger)' }}>
                          <i className="bi bi-heart-fill" />
                        </span>
                      )}
                      <strong>{p.likes} Me gusta</strong>
                    </div>

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
      </div>

      {/* Modal: nueva publicación */}
      {showNewPost && (
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
          onClick={() => setShowNewPost(false)}
        >
          <div
            style={{
              background: 'var(--ws-surface)',
              border: '1px solid var(--ws-border)',
              borderRadius: 'var(--ws-radius-lg)',
              boxShadow: 'var(--ws-shadow-lg)',
              padding: 'var(--ws-space-6)',
              width: '100%',
              maxWidth: 480,
              maxHeight: '90vh',
              overflowY: 'auto',
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <h3 style={{ marginTop: 0 }}>Nueva publicación</h3>
            <form className="stack" onSubmit={onSubmit} style={{ gap: 'var(--ws-space-3)' }}>
              <textarea
                className="input"
                rows={4}
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
                  <input
                    type="file"
                    accept="image/*,video/*"
                    style={{ display: 'none' }}
                    onChange={onNewPostFile}
                  />
                </label>
                <Button type="submit" disabled={publish.isPending || !text.trim()}>
                  Publicar
                </Button>
                <Button variant="ghost" onClick={() => setShowNewPost(false)}>
                  Cancelar
                </Button>
              </div>

              {uploadMedia.error && (
                <p style={{ color: 'var(--ws-danger)', margin: 0 }}>No se pudo subir el archivo.</p>
              )}
              {publish.error && <p style={{ color: 'var(--ws-danger)', margin: 0 }}>{publish.error.message}</p>}
            </form>
          </div>
        </div>
      )}

      {/* Visor de historias a pantalla completa */}
      {storyAuthor && currentStory && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            zIndex: 2000,
            background: 'rgba(0,0,0,0.94)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
          onClick={closeStory}
        >
          <button
            onClick={closeStory}
            style={{
              position: 'absolute',
              top: 'var(--ws-space-4)',
              right: 'var(--ws-space-4)',
              background: 'rgba(255,255,255,0.15)',
              color: '#fff',
              border: 'none',
              borderRadius: '50%',
              width: 40,
              height: 40,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              cursor: 'pointer',
              zIndex: 2,
            }}
            aria-label="Cerrar historia"
          >
            <i className="bi bi-x-lg" style={{ fontSize: '1.25rem' }} />
          </button>

          {openGroup && openGroup.stories.length > 1 && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                prevStory();
              }}
              style={{
                position: 'absolute',
                left: 'var(--ws-space-3)',
                top: '50%',
                transform: 'translateY(-50%)',
                background: 'rgba(255,255,255,0.15)',
                color: '#fff',
                border: 'none',
                borderRadius: '50%',
                width: 40,
                height: 40,
                cursor: 'pointer',
              }}
              aria-label="Historia anterior"
            >
              <i className="bi bi-chevron-left" style={{ fontSize: '1.25rem' }} />
            </button>
          )}

          {currentStory.mediaType === 'video' ? (
            <video
              src={currentStory.mediaUrl}
              autoPlay
              loop
              controls
              onClick={(e) => e.stopPropagation()}
              style={{ maxWidth: '100%', maxHeight: '100%', background: '#000' }}
            />
          ) : (
            <img
              src={currentStory.mediaUrl}
              alt="Historia"
              onClick={(e) => e.stopPropagation()}
              style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain' }}
            />
          )}

          {openGroup && openGroup.stories.length > 1 && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                nextStory();
              }}
              style={{
                position: 'absolute',
                right: 'var(--ws-space-3)',
                top: '50%',
                transform: 'translateY(-50%)',
                background: 'rgba(255,255,255,0.15)',
                color: '#fff',
                border: 'none',
                borderRadius: '50%',
                width: 40,
                height: 40,
                cursor: 'pointer',
              }}
              aria-label="Siguiente historia"
            >
              <i className="bi bi-chevron-right" style={{ fontSize: '1.25rem' }} />
            </button>
          )}

          <div
            style={{
              position: 'absolute',
              bottom: 'var(--ws-space-4)',
              left: 0,
              right: 0,
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              gap: 'var(--ws-space-2)',
              color: '#fff',
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <span style={{ fontWeight: 600 }}>{nameOf(storyAuthor)}</span>
            <span style={{ opacity: 0.75, fontSize: 'var(--ws-font-size-sm)' }}>
              {new Date(currentStory.createdAt).toLocaleString()}
              {openGroup && openGroup.stories.length > 1 && ` · ${storyIndex + 1}/${openGroup.stories.length}`}
            </span>
            {openGroup && openGroup.author === myId && (
              <Button
                variant="ghost"
                style={{ color: '#fff' }}
                onClick={() => deleteStory.mutate(currentStory.id)}
                disabled={deleteStory.isPending}
              >
                <i className="bi bi-trash" /> Eliminar historia
              </Button>
            )}
          </div>
        </div>
      )}

      {/* Sección Direct (mensajes) */}
      {showDirect && <SocialDirect onClose={() => setShowDirect(false)} />}

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
    </SiteLayout>
  );
}
