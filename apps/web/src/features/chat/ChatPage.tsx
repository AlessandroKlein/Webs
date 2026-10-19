import { useEffect, useRef, useState, type FormEvent } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../../lib/api';
import { useAuthStore } from '../../lib/auth-store';
import { useRealtime } from '../../lib/realtime';
import { Button } from '../../components/ui/Button';
import { Card } from '../../components/ui/Card';
import { Spinner } from '../../components/ui/Spinner';

const CHAT_BASE = '/api/v1/blocks/chat';

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

type View = 'conversations' | 'new';

export function ChatPage() {
  const qc = useQueryClient();
  const user = useAuthStore((s) => s.user);
  const me = user?.id ?? 'anon';
  useRealtime((event) => {
    if (event === 'chat.message') {
      void qc.invalidateQueries({ queryKey: ['chat-messages'] });
      void qc.invalidateQueries({ queryKey: ['chat-conversations'] });
    }
  });

  const [view, setView] = useState<View>('conversations');
  const [activeId, setActiveId] = useState<string | null>(null);
  const [draft, setDraft] = useState('');
  const bottomRef = useRef<HTMLDivElement | null>(null);

  const { data: users } = useQuery({
    queryKey: ['chat-users'],
    queryFn: () => api.get<ChatUser[]>(`${CHAT_BASE}/users`),
  });

  const { data: conversations } = useQuery({
    queryKey: ['chat-conversations', me],
    queryFn: () => api.get<Conversation[]>(`${CHAT_BASE}/conversations?userId=${encodeURIComponent(me)}`),
    enabled: !!me,
  });

  const { data: messages, isLoading } = useQuery({
    queryKey: ['chat-messages', me, activeId],
    queryFn: () =>
      api.get<ChatMessage[]>(
        `${CHAT_BASE}/messages?from=${encodeURIComponent(me)}&to=${encodeURIComponent(activeId ?? '')}`,
      ),
    enabled: !!activeId,
  });

  const send = useMutation({
    mutationFn: (body: string) => api.post(`${CHAT_BASE}/messages`, { from: me, to: activeId, body }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['chat-messages'] });
      qc.invalidateQueries({ queryKey: ['chat-conversations'] });
      setDraft('');
    },
  });

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'auto' });
  }, [messages]);

  const userList = users ?? [];
  const nameById = new Map<string, string>(
    userList.map((u) => [u.id, u.displayName ?? u.username ?? u.email]),
  );
  const activeName = activeId ? nameById.get(activeId) ?? activeId : null;
  const conversationList = conversations ?? [];

  const openChat = (id: string) => {
    setActiveId(id);
    setDraft('');
    setView('conversations');
  };

  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    const body = draft.trim();
    if (!body || !activeId) return;
    send.mutate(body);
  };

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
    <div className="row" style={{ alignItems: 'stretch', gap: 'var(--ws-space-6)' }}>
      <aside className="stack" style={{ minWidth: 240, maxWidth: 240, gap: 'var(--ws-space-1)' }}>
        <h1 style={{ fontSize: 'var(--ws-font-size-lg)', margin: 0 }}>Mensajes</h1>
        <button style={navBtn(view === 'conversations')} onClick={() => setView('conversations')}>
          Conversaciones
        </button>
        <button style={navBtn(view === 'new')} onClick={() => setView('new')}>
          Nueva conversación
        </button>

        <div className="stack" style={{ gap: 'var(--ws-space-1)', marginTop: 'var(--ws-space-3)' }}>
          {view === 'conversations' &&
            conversationList.map((c) => (
              <button
                key={c.userId}
                onClick={() => openChat(c.userId)}
                style={{
                  textAlign: 'left',
                  background: activeId === c.userId ? 'var(--ws-primary-soft)' : 'var(--ws-surface)',
                  color: 'var(--ws-text)',
                  border: '1px solid var(--ws-border)',
                  borderRadius: 'var(--ws-radius-md)',
                  padding: 'var(--ws-space-2) var(--ws-space-3)',
                  cursor: 'pointer',
                  width: '100%',
                }}
              >
                <strong style={{ display: 'block' }}>{c.name}</strong>
                <span style={{ color: 'var(--ws-text-muted)', fontSize: 'var(--ws-font-size-sm)', display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {c.lastMessage}
                </span>
              </button>
            ))}
          {view === 'conversations' && conversationList.length === 0 && (
            <p style={{ color: 'var(--ws-text-muted)', margin: 0 }}>Aún no hay conversaciones.</p>
          )}

          {view === 'new' &&
            userList
              .filter((u) => u.id !== me)
              .map((u) => {
                const name = u.displayName ?? u.username ?? u.email;
                return (
                  <button
                    key={u.id}
                    onClick={() => openChat(u.id)}
                    style={{
                      textAlign: 'left',
                      background: 'var(--ws-surface)',
                      color: 'var(--ws-text)',
                      border: '1px solid var(--ws-border)',
                      borderRadius: 'var(--ws-radius-md)',
                      padding: 'var(--ws-space-2) var(--ws-space-3)',
                      cursor: 'pointer',
                      width: '100%',
                    }}
                  >
                    <strong style={{ display: 'block' }}>{name}</strong>
                    <span style={{ color: 'var(--ws-text-muted)', fontSize: 'var(--ws-font-size-sm)' }}>@{u.username ?? u.email}</span>
                  </button>
                );
              })}
          {view === 'new' && userList.filter((u) => u.id !== me).length === 0 && (
            <p style={{ color: 'var(--ws-text-muted)', margin: 0 }}>No hay usuarios disponibles.</p>
          )}
        </div>
      </aside>

      <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column' }}>
        {activeId ? (
          <>
            <Card style={{ flex: 1, display: 'flex', flexDirection: 'column', padding: 0, overflow: 'hidden' }}>
              <div
                style={{
                  padding: 'var(--ws-space-3) var(--ws-space-4)',
                  borderBottom: '1px solid var(--ws-border)',
                  fontWeight: 600,
                }}
              >
                {activeName}
              </div>

              <div className="stack" style={{ flex: 1, overflowY: 'auto', padding: 'var(--ws-space-4)', gap: 'var(--ws-space-2)' }}>
                {isLoading && <Spinner label="Cargando…" />}
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
                {(messages ?? []).length === 0 && !isLoading && (
                  <p style={{ color: 'var(--ws-text-muted)', margin: 0 }}>Envía el primer mensaje.</p>
                )}
                <div ref={bottomRef} />
              </div>
            </Card>

            <form
              className="row"
              onSubmit={onSubmit}
              style={{ alignItems: 'center', gap: 'var(--ws-space-2)', marginTop: 'var(--ws-space-3)' }}
            >
              <input
                className="input"
                placeholder="Escribe un mensaje…"
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                style={{ flex: 1 }}
              />
              <Button type="submit" disabled={send.isPending || !draft.trim()}>Enviar</Button>
            </form>
          </>
        ) : (
          <Card style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <p style={{ color: 'var(--ws-text-muted)', margin: 0 }}>Selecciona una conversación para empezar.</p>
          </Card>
        )}
      </div>
    </div>
  );
}
