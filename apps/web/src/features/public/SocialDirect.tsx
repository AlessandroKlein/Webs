import { useEffect, useRef, useState, type CSSProperties, type FormEvent } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../../lib/api';
import { useAuthStore } from '../../lib/auth-store';
import { useRealtime } from '../../lib/realtime';
import { useTranslation } from 'react-i18next';
import { Button } from '../../components/ui/Button';
import { Spinner } from '../../components/ui/Spinner';

const CHAT_BASE = '/api/v1/blocks/chat';
const SOCIAL_BASE = '/api/v1/blocks/social';

interface ChatMessage {
  id: string;
  from: string;
  to: string;
  body: string;
  createdAt: string;
}

interface ChatUser {
  id: string;
  displayName: string | null;
  username: string | null;
  email: string;
}

interface Conversation {
  userId: string;
  name: string;
  lastMessage: string;
  updatedAt: string;
}

interface Follow {
  id: string;
  followerId: string;
  followingId: string;
}

/** Inicial (1ª letra en mayúscula) para avatares sin imagen. */
export function initials(name: string): string {
  const c = name.trim().charAt(0);
  return c ? c.toUpperCase() : '?';
}

/** Avatar circular: imagen si hay `url`, si no la inicial del nombre. */
export function Avatar({
  name,
  url,
  size = 40,
}: {
  name: string;
  url?: string | null;
  size?: number;
}) {
  if (url) {
    return (
      <img
        src={url}
        alt={name}
        style={{
          width: size,
          height: size,
          borderRadius: '50%',
          objectFit: 'cover',
          display: 'block',
          flexShrink: 0,
        }}
      />
    );
  }
  return (
    <div
      style={{
        width: size,
        height: size,
        borderRadius: '50%',
        background: 'var(--ws-primary-soft)',
        color: 'var(--ws-primary)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontWeight: 600,
        fontSize: Math.max(12, Math.round(size * 0.42)),
        flexShrink: 0,
      }}
    >
      {initials(name)}
    </div>
  );
}

/**
 * Sección de mensajes directos (estilo Instagram): lista de conversaciones,
 * buscador de usuarios con botón seguir/dejar de seguir y el hilo de mensajes
 * con campo para enviar. Se abre desde el icono bi-send del header de `/social`.
 */
export function SocialDirect({ onClose }: { onClose: () => void }) {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const user = useAuthStore((s) => s.user);
  const me = user?.id ?? '';

  // Tiempo real (ADR-0022): refresca el hilo y las conversaciones cuando llega
  // un mensaje nuevo por WebSocket (`chat.message`), sin recargar la página.
  useRealtime((event) => {
    if (event === 'chat.message') {
      void qc.invalidateQueries({ queryKey: ['chat-messages'] });
      void qc.invalidateQueries({ queryKey: ['chat-conversations'] });
    }
  });

  const [query, setQuery] = useState('');
  const [activeId, setActiveId] = useState<string | null>(null);
  const [draft, setDraft] = useState('');
  const bottomRef = useRef<HTMLDivElement | null>(null);

  const { data: users } = useQuery({
    queryKey: ['chat-users'],
    queryFn: () => api.get<ChatUser[]>(`${CHAT_BASE}/users`),
    enabled: !!me,
  });

  const { data: conversations } = useQuery({
    queryKey: ['chat-conversations', me],
    queryFn: () => api.get<Conversation[]>(`${CHAT_BASE}/conversations?userId=${encodeURIComponent(me)}`),
    enabled: !!me,
  });

  const { data: follows } = useQuery({
    queryKey: ['social-follows', me],
    queryFn: () => api.get<Follow[]>(`${SOCIAL_BASE}/follow?followerId=${encodeURIComponent(me)}`),
    enabled: !!me,
  });

  const { data: messages, isLoading: messagesLoading } = useQuery({
    queryKey: ['chat-messages', me, activeId],
    queryFn: () =>
      api.get<ChatMessage[]>(
        `${CHAT_BASE}/messages?from=${encodeURIComponent(me)}&to=${encodeURIComponent(activeId ?? '')}`,
      ),
    enabled: !!me && !!activeId,
  });

  const send = useMutation({
    mutationFn: (body: string) => api.post(`${CHAT_BASE}/messages`, { from: me, to: activeId, body }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['chat-messages'] });
      qc.invalidateQueries({ queryKey: ['chat-conversations'] });
      setDraft('');
    },
  });

  const follow = useMutation({
    mutationFn: (targetId: string) =>
      api.post(`${SOCIAL_BASE}/follow`, { followerId: me, followingId: targetId }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['social-follows'] }),
  });

  const unfollow = useMutation({
    mutationFn: (targetId: string) =>
      api.del(
        `${SOCIAL_BASE}/follow?followerId=${encodeURIComponent(me)}&followingId=${encodeURIComponent(targetId)}`,
      ),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['social-follows'] }),
  });

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'auto' });
  }, [messages]);

  const userList = users ?? [];
  const userById = new Map<string, ChatUser>(userList.map((u) => [u.id, u]));
  const nameOf = (id: string) => {
    const u = userById.get(id);
    return u?.displayName ?? u?.username ?? u?.email ?? id;
  };
  const activeName = activeId ? nameOf(activeId) : null;

  const following = new Set((follows ?? []).map((f) => f.followingId));
  const q = query.trim().toLowerCase();
  const results = q
    ? userList.filter(
        (u) =>
          u.id !== me &&
          ((u.displayName ?? '').toLowerCase().includes(q) ||
            (u.username ?? '').toLowerCase().includes(q) ||
            u.email.toLowerCase().includes(q)),
      )
    : [];

  const openChat = (id: string) => {
    setActiveId(id);
    setQuery('');
    setDraft('');
  };

  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    const body = draft.trim();
    if (!body || !activeId) return;
    send.mutate(body);
  };

  const listItemStyle: CSSProperties = {
    display: 'flex',
    alignItems: 'center',
    gap: 'var(--ws-space-3)',
    padding: 'var(--ws-space-2) var(--ws-space-3)',
    borderBottom: '1px solid var(--ws-border)',
    cursor: 'pointer',
  };

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 1500,
        background: 'var(--ws-surface)',
        display: 'flex',
        flexDirection: 'column',
      }}
    >
      <header
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: 'var(--ws-space-3) var(--ws-space-4)',
          borderBottom: '1px solid var(--ws-border)',
        }}
      >
        <strong style={{ display: 'flex', alignItems: 'center', gap: 'var(--ws-space-2)' }}>
          <i className="bi bi-send" /> {t('chat.messages')}
        </strong>
        <Button variant="ghost" onClick={onClose} aria-label={t('chat.closeMessages')}>
          <i className="bi bi-x-lg" />
        </Button>
      </header>

      <div style={{ flex: 1, minHeight: 0, display: 'flex' }}>
        <aside
          style={{
            width: 'clamp(240px, 34vw, 340px)',
            flexShrink: 0,
            borderRight: '1px solid var(--ws-border)',
            display: 'flex',
            flexDirection: 'column',
            minHeight: 0,
          }}
        >
          <div style={{ padding: 'var(--ws-space-3)', borderBottom: '1px solid var(--ws-border)' }}>
            <input
              className="input"
              placeholder={t('chat.searchUsersPlaceholder')}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              style={{ width: '100%' }}
            />
          </div>

          <div style={{ flex: 1, overflowY: 'auto' }}>
            {q ? (
              <>
                {results.map((u) => {
                  const name = u.displayName ?? u.username ?? u.email;
                  const followed = following.has(u.id);
                  return (
                    <div key={u.id} style={{ ...listItemStyle, cursor: 'default' }}>
                      <Avatar name={name} size={36} />
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <strong style={{ display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {name}
                        </strong>
                        <span style={{ color: 'var(--ws-text-muted)', fontSize: 'var(--ws-font-size-sm)' }}>
                          @{u.username ?? u.email}
                        </span>
                      </div>
                      <Button
                        variant={followed ? 'secondary' : 'primary'}
                        style={{ padding: 'var(--ws-space-1) var(--ws-space-2)', fontSize: 'var(--ws-font-size-sm)' }}
                        onClick={() => (followed ? unfollow.mutate(u.id) : follow.mutate(u.id))}
                        disabled={follow.isPending || unfollow.isPending}
                      >
                        {followed ? t('social.unfollow') : t('social.follow')}
                      </Button>
                      <Button
                        variant="ghost"
                        style={{ padding: 'var(--ws-space-1) var(--ws-space-2)' }}
                        onClick={() => openChat(u.id)}
                        title={t('chat.sendMessage')}
                        aria-label={t('chat.sendMessage')}
                      >
                        <i className="bi bi-chat-dots" />
                      </Button>
                    </div>
                  );
                })}
                {results.length === 0 && (
                  <p style={{ color: 'var(--ws-text-muted)', padding: 'var(--ws-space-3)', margin: 0 }}>
                    {t('chat.noResults')}
                  </p>
                )}
              </>
            ) : (
              <>
                {(conversations ?? []).map((c) => (
                  <div
                    key={c.userId}
                    style={{
                      ...listItemStyle,
                      background: activeId === c.userId ? 'var(--ws-primary-soft)' : undefined,
                    }}
                    onClick={() => openChat(c.userId)}
                  >
                    <Avatar name={c.name} size={40} />
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <strong style={{ display: 'block' }}>{c.name}</strong>
                      <span
                        style={{
                          color: 'var(--ws-text-muted)',
                          fontSize: 'var(--ws-font-size-sm)',
                          display: 'block',
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          whiteSpace: 'nowrap',
                        }}
                      >
                        {c.lastMessage}
                      </span>
                    </div>
                  </div>
                ))}
                {(conversations ?? []).length === 0 && (
                  <p style={{ color: 'var(--ws-text-muted)', padding: 'var(--ws-space-3)', margin: 0 }}>
                    {t('chat.noConversations')}
                  </p>
                )}
              </>
            )}
          </div>
        </aside>

        <main style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column' }}>
          {activeId ? (
            <>
              <div
                style={{
                  padding: 'var(--ws-space-3) var(--ws-space-4)',
                  borderBottom: '1px solid var(--ws-border)',
                  fontWeight: 600,
                  display: 'flex',
                  alignItems: 'center',
                  gap: 'var(--ws-space-2)',
                }}
              >
                <Avatar name={activeName ?? activeId} size={28} />
                {activeName}
              </div>

              <div
                className="stack"
                style={{ flex: 1, overflowY: 'auto', padding: 'var(--ws-space-4)', gap: 'var(--ws-space-2)' }}
              >
                {messagesLoading && <Spinner label={t('common.loading')} />}
                {(messages ?? []).map((m) => {
                  const isMine = m.from === me;
                  return (
                    <div
                      key={m.id}
                      style={{
                        alignSelf: isMine ? 'flex-end' : 'flex-start',
                        maxWidth: '75%',
                        background: isMine ? 'var(--ws-primary)' : 'var(--ws-surface-2, var(--ws-surface))',
                        color: isMine ? 'var(--ws-on-primary)' : 'var(--ws-text)',
                        borderRadius: 'var(--ws-radius-lg)',
                        padding: 'var(--ws-space-2) var(--ws-space-3)',
                      }}
                    >
                      <span style={{ whiteSpace: 'pre-wrap', display: 'block' }}>{m.body}</span>
                      <span
                        style={{
                          display: 'block',
                          fontSize: 'var(--ws-font-size-sm)',
                          opacity: 0.75,
                          marginTop: 'var(--ws-space-1)',
                        }}
                      >
                        {new Date(m.createdAt).toLocaleString()}
                      </span>
                    </div>
                  );
                })}
                {(messages ?? []).length === 0 && !messagesLoading && (
                  <p style={{ color: 'var(--ws-text-muted)', margin: 0 }}>{t('chat.sendFirst')}</p>
                )}
                <div ref={bottomRef} />
              </div>

              <form
                className="row"
                onSubmit={onSubmit}
                style={{ alignItems: 'center', gap: 'var(--ws-space-2)', padding: 'var(--ws-space-3)' }}
              >
                <input
                  className="input"
                  placeholder={t('chat.messagePlaceholder')}
                  value={draft}
                  onChange={(e) => setDraft(e.target.value)}
                  style={{ flex: 1 }}
                />
                <Button type="submit" disabled={send.isPending || !draft.trim()}>
                  {t('chat.send')}
                </Button>
              </form>
            </>
          ) : (
            <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <p style={{ color: 'var(--ws-text-muted)', margin: 0 }}>
                <i className="bi bi-send" style={{ marginRight: 'var(--ws-space-2)' }} />
                {t('chat.selectConversation')}
              </p>
            </div>
          )}
        </main>
      </div>
    </div>
  );
}
