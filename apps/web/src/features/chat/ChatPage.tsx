import { useState, type FormEvent } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../../lib/api';
import { Button } from '../../components/ui/Button';
import { Card } from '../../components/ui/Card';
import { Spinner } from '../../components/ui/Spinner';
import { TextField } from '../../components/ui/TextField';

const CHAT_BASE = '/api/v1/blocks/chat';
const CHAT_IA_BASE = '/api/v1/blocks/chat-ia';

interface ChatMessage {
  id: string;
  from: string;
  to: string | null;
  body: string;
  createdAt: string;
}

interface ChatConfig {
  provider: string;
  model: string;
  available: string[];
}

interface ChatReply {
  ok: boolean;
  reply: string;
  provider: string;
  model: string;
  room: string;
}

interface HistoryEntry {
  role: 'user' | 'assistant';
  content: string;
}

type View = 'messages' | 'assistant';

export function ChatPage() {
  const qc = useQueryClient();
  const [view, setView] = useState<View>('messages');

  const [room, setRoom] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [body, setBody] = useState('');

  const [iaMessage, setIaMessage] = useState('');
  const [history, setHistory] = useState<HistoryEntry[]>([]);

  const { data: rooms } = useQuery({
    queryKey: ['chat-rooms'],
    queryFn: () => api.get<string[]>(`${CHAT_BASE}/rooms`),
  });

  const effectiveRoom = room || rooms?.[0] || '';

  const { data: messages, isLoading } = useQuery({
    queryKey: ['chat-messages', effectiveRoom],
    queryFn: () => api.get<ChatMessage[]>(`${CHAT_BASE}/messages?room=${encodeURIComponent(effectiveRoom)}`),
    enabled: effectiveRoom !== '',
  });

  const { data: config } = useQuery({
    queryKey: ['chat-ia-config'],
    queryFn: () => api.get<ChatConfig>(`${CHAT_IA_BASE}/config`),
    enabled: view === 'assistant',
  });

  const send = useMutation({
    mutationFn: (payload: Record<string, unknown>) => api.post(`${CHAT_BASE}/messages`, payload),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['chat-messages'] });
      setBody('');
    },
  });

  const chat = useMutation({
    mutationFn: (payload: { message: string; history?: HistoryEntry[] }) =>
      api.post<ChatReply>(`${CHAT_IA_BASE}/chat`, payload),
    onSuccess: (reply) => {
      setHistory((prev) => [...prev, { role: 'assistant', content: reply.reply }]);
      setIaMessage('');
    },
  });

  const onSendMessage = (e: FormEvent) => {
    e.preventDefault();
    const payload: Record<string, unknown> = {
      from: from.trim(),
      to: to.trim() || undefined,
      body: body.trim(),
    };
    send.mutate(payload);
  };

  const onSendAssistant = (e: FormEvent) => {
    e.preventDefault();
    const message = iaMessage.trim();
    if (!message) return;
    const nextHistory: HistoryEntry[] = [...history, { role: 'user', content: message }];
    setHistory(nextHistory);
    chat.mutate({ message, history: nextHistory.length ? nextHistory : undefined });
  };

  if (isLoading && view === 'messages') return <Spinner />;

  const messageList = messages ?? [];
  const roomList = rooms ?? [];

  return (
    <div className="row" style={{ alignItems: 'flex-start', gap: 'var(--ws-space-6)' }}>
      <aside className="stack" style={{ minWidth: 220, maxWidth: 220 }}>
        <h1 style={{ fontSize: 'var(--ws-font-size-lg)', margin: 0 }}>Chat</h1>
        <button
          className={`nav-link ${view === 'messages' ? 'active' : ''}`}
          style={{ textAlign: 'left', background: 'none', border: 'none', cursor: 'pointer' }}
          onClick={() => setView('messages')}
        >
          Mensajes
        </button>
        <button
          className={`nav-link ${view === 'assistant' ? 'active' : ''}`}
          style={{ textAlign: 'left', background: 'none', border: 'none', cursor: 'pointer' }}
          onClick={() => setView('assistant')}
        >
          Asistente IA
        </button>
      </aside>

      <div className="stack" style={{ flex: 1, minWidth: 0 }}>
        {view === 'messages' && (
          <>
            <Card>
              <div className="row" style={{ justifyContent: 'space-between', alignItems: 'flex-end', flexWrap: 'wrap', gap: 'var(--ws-space-2)' }}>
                <h3 style={{ margin: 0 }}>Mensajes</h3>
                <div className="field">
                  <label>Sala</label>
                  <select className="input" style={{ width: 'auto' }} value={effectiveRoom} onChange={(e) => setRoom(e.target.value)}>
                    {roomList.map((r) => (
                      <option key={r} value={r}>{r}</option>
                    ))}
                    {roomList.length === 0 && <option value="">Sin salas</option>}
                  </select>
                </div>
              </div>

              <div className="stack" style={{ marginTop: 'var(--ws-space-3)' }}>
                {messageList.map((m) => (
                  <div key={m.id} style={{ borderTop: '1px solid var(--ws-border)', paddingTop: 'var(--ws-space-2)' }}>
                    <div className="row" style={{ justifyContent: 'space-between' }}>
                      <strong>{m.from}</strong>
                      <span className="muted">{new Date(m.createdAt).toLocaleString()}</span>
                    </div>
                    <p style={{ margin: 'var(--ws-space-1) 0 0' }}>{m.body}</p>
                    {m.to && <span className="muted">→ {m.to}</span>}
                  </div>
                ))}
                {messageList.length === 0 && <p className="muted">No hay mensajes en esta sala.</p>}
              </div>
            </Card>

            <Card>
              <h3 style={{ marginTop: 0 }}>Enviar mensaje</h3>
              <form className="stack" onSubmit={onSendMessage}>
                <div className="row" style={{ alignItems: 'flex-end', flexWrap: 'wrap', gap: 'var(--ws-space-2)' }}>
                  <TextField label="De" value={from} onChange={(e) => setFrom(e.target.value)} required />
                  <TextField label="Para" value={to} onChange={(e) => setTo(e.target.value)} placeholder="Opcional" />
                </div>
                <div className="field">
                  <label>Mensaje</label>
                  <textarea className="input" rows={3} value={body} onChange={(e) => setBody(e.target.value)} required />
                </div>
                <div className="row">
                  <Button type="submit" disabled={send.isPending}>Enviar</Button>
                  {send.isSuccess && <span style={{ color: 'var(--ws-success)' }}>Enviado ✓</span>}
                </div>
                {send.error && <p style={{ color: 'var(--ws-danger)', margin: 0 }}>{send.error.message}</p>}
              </form>
            </Card>
          </>
        )}

        {view === 'assistant' && (
          <Card>
            <h3 style={{ marginTop: 0 }}>Asistente IA</h3>
            {config && (
              <p className="muted" style={{ marginTop: 0 }}>
                Proveedor: <code>{config.provider}</code> · Modelo: <code>{config.model}</code>
              </p>
            )}

            <div className="stack" style={{ marginBottom: 'var(--ws-space-4)' }}>
              {history.map((h, i) => (
                <div
                  key={i}
                  className="card"
                  style={{
                    alignSelf: h.role === 'user' ? 'flex-end' : 'flex-start',
                    maxWidth: '80%',
                    background: h.role === 'user' ? 'var(--ws-primary)' : 'var(--ws-surface-2, var(--ws-surface))',
                    color: h.role === 'user' ? '#fff' : 'inherit',
                    padding: 'var(--ws-space-2) var(--ws-space-3)',
                  }}
                >
                  <span className="muted" style={{ display: 'block', fontSize: '0.8em' }}>
                    {h.role === 'user' ? 'Tú' : 'Asistente'}
                  </span>
                  <span style={{ whiteSpace: 'pre-wrap' }}>{h.content}</span>
                </div>
              ))}
              {history.length === 0 && <p className="muted">Escribí un mensaje para empezar la conversación.</p>}
            </div>

            <form className="stack" onSubmit={onSendAssistant}>
              <div className="field">
                <label>Mensaje</label>
                <textarea className="input" rows={3} value={iaMessage} onChange={(e) => setIaMessage(e.target.value)} placeholder="Preguntale algo al asistente…" />
              </div>
              <div className="row">
                <Button type="submit" disabled={chat.isPending || !iaMessage.trim()}>
                  {chat.isPending ? 'Pensando…' : 'Enviar'}
                </Button>
              </div>
              {chat.error && <p style={{ color: 'var(--ws-danger)', margin: 0 }}>{chat.error.message}</p>}
            </form>
          </Card>
        )}
      </div>
    </div>
  );
}
