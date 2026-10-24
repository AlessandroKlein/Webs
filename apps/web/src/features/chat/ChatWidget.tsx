import { useEffect, useRef, useState, type CSSProperties, type FormEvent } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../../lib/api';
import { useAuthStore } from '../../lib/auth-store';
import { useRealtime } from '../../lib/realtime';
import { useTranslation } from 'react-i18next';
import { Button } from '../../components/ui/Button';
import { Spinner } from '../../components/ui/Spinner';
import { Avatar } from '../public/SocialDirect';

const CHAT_BASE = '/api/v1/plugins/chat';

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

/**
 * Widget flotante de mensajes directos (ADR-0022): botón fijo abajo a la
 * derecha + panel flotante. Se suscribe a `chat.message` vía WebSocket para
 * avisar en vivo (badge de no leídos + toast) cuando llega un mensaje estando
 * en otra sección de la app, sin recargar. Se monta a nivel de app (solo
 * usuarios logueados, fuera de /admin).
 */
export function ChatWidget() {
  const { t } = useTranslation();
  const me = useAuthStore((s) => s.user?.id) ?? '';
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [unread, setUnread] = useState(0);
  const [toast, setToast] = useState<string | null>(null);
  const openRef = useRef(false);
  const toastTimer = useRef<number | null>(null);

  useEffect(() => {
    openRef.current = open;
  }, [open]);

  useEffect(
    () => () => {
      if (toastTimer.current) window.clearTimeout(toastTimer.current);
    },
    [],
  );

  useRealtime((event, payload) => {
    if (event !== 'chat.message') return;
    const msg = payload as { from?: string; to?: string; body?: string };
    void qc.invalidateQueries({ queryKey: ['chat-conversations'] });
    void qc.invalidateQueries({ queryKey: ['chat-messages'] });
    if (msg.to === me && msg.from && msg.from !== me && !openRef.current) {
      setUnread((u) => u + 1);
      setToast(msg.body ?? '');
      if (toastTimer.current) window.clearTimeout(toastTimer.current);
      toastTimer.current = window.setTimeout(() => setToast(null), 4000);
    }
  });

  if (!me) return null;

  const toggle = () => {
    setOpen((o) => !o);
    if (!open) setUnread(0);
  };

  return (
    <>
      {toast && !open && (
        <button className="chat-toast" onClick={toggle} aria-label={t('chat.newMessage')}>
          <i className="bi bi-chat-dots" aria-hidden="true" />
          <span className="chat-toast-body">{toast}</span>
        </button>
      )}

      <button className="chat-fab" onClick={toggle} aria-label={t('chat.directMessages')}>
        <i className={`bi ${open ? 'bi-x-lg' : 'bi-chat-dots'}`} aria-hidden="true" />
        {!open && unread > 0 && <span className="chat-fab-badge">{unread > 99 ? '99+' : unread}</span>}
      </button>

      {open && <ChatPanel me={me} onClose={() => setOpen(false)} />}
    </>
  );
}

/** Panel flotante: lista de conversaciones ↔ hilo de mensajes + composer. */
function ChatPanel({ me, onClose }: { me: string; onClose: () => void }) {
  const { t } = useTranslation();
  const qc = useQueryClient();
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
      void qc.invalidateQueries({ queryKey: ['chat-messages'] });
      void qc.invalidateQueries({ queryKey: ['chat-conversations'] });
      setDraft('');
    },
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

  const itemStyle: CSSProperties = {
    display: 'flex',
    alignItems: 'center',
    gap: 'var(--ws-space-3)',
    padding: 'var(--ws-space-2) var(--ws-space-3)',
    borderBottom: '1px solid var(--ws-border)',
    cursor: 'pointer',
  };

  return (
    <div className="chat-panel" role="dialog" aria-label={t('chat.directMessages')}>
      <header className="chat-panel-header">
        {activeId && (
          <button className="chat-panel-back" onClick={() => setActiveId(null)} aria-label={t('chat.backToConversations')}>
            <i className="bi bi-arrow-left" />
          </button>
        )}
        <strong className="chat-panel-title">
          {activeId ? (
            <>
              <Avatar name={activeName ?? activeId} size={22} />
              {activeName}
            </>
          ) : (
            <>
              <i className="bi bi-send" /> {t('chat.messages')}
            </>
          )}
        </strong>
        <Button variant="ghost" onClick={onClose} aria-label={t('chat.closeMessages')} style={{ padding: 'var(--ws-space-1)' }}>
          <i className="bi bi-x-lg" />
        </Button>
      </header>

      {!activeId ? (
        <div className="chat-panel-list">
          <div style={{ padding: 'var(--ws-space-2) var(--ws-space-3)' }}>
            <input
              className="input"
              placeholder={t('chat.searchUsersPlaceholder')}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              style={{ width: '100%' }}
              aria-label={t('chat.searchUsers')}
            />
          </div>

          {q ? (
            <>
              {results.map((u) => {
                const name = u.displayName ?? u.username ?? u.email;
                return (
                  <div key={u.id} style={itemStyle}>
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
                      variant="ghost"
                      style={{ padding: 'var(--ws-space-1) var(--ws-space-2)' }}
                      onClick={() => openChat(u.id)}
                      aria-label={t('chat.sendTo', { name })}
                    >
                      <i className="bi bi-chat-dots" />
                    </Button>
                  </div>
                );
              })}
              {results.length === 0 && (
                <p style={{ color: 'var(--ws-text-muted)', padding: 'var(--ws-space-3)', margin: 0 }}>{t('chat.noResults')}</p>
              )}
            </>
          ) : (
            <>
              {(conversations ?? []).map((c) => (
                <div key={c.userId} style={itemStyle} onClick={() => openChat(c.userId)}>
                  <Avatar name={c.name} size={38} />
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
      ) : (
        <div className="chat-panel-thread">
          <div className="chat-panel-messages">
            {messagesLoading && <Spinner label={t('common.loading')} />}
            {(messages ?? []).map((m) => {
              const isMine = m.from === me;
              return (
                <div
                  key={m.id}
                  className={`chat-bubble ${isMine ? 'mine' : 'theirs'}`}
                  style={{
                    alignSelf: isMine ? 'flex-end' : 'flex-start',
                    background: isMine ? 'var(--ws-primary)' : 'var(--ws-surface-2, var(--ws-surface))',
                    color: isMine ? 'var(--ws-on-primary, #fff)' : 'var(--ws-text)',
                  }}
                >
                  <span style={{ whiteSpace: 'pre-wrap', display: 'block' }}>{m.body}</span>
                  <span
                    style={{
                      display: 'block',
                      fontSize: 'var(--ws-font-size-xs, 11px)',
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

          <form className="row" onSubmit={onSubmit} style={{ alignItems: 'center', gap: 'var(--ws-space-2)', padding: 'var(--ws-space-2)' }}>
            <input
              className="input"
              placeholder={t('chat.messagePlaceholder')}
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              style={{ flex: 1 }}
              aria-label={t('chat.message')}
            />
            <Button type="submit" disabled={send.isPending || !draft.trim()}>
              {t('chat.send')}
            </Button>
          </form>
        </div>
      )}
    </div>
  );
}
