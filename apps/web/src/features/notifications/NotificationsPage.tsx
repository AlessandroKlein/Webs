import { useState } from 'react';
import type { FormEvent } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../../lib/api';
import { Button } from '../../components/ui/Button';
import { Card } from '../../components/ui/Card';
import { Spinner } from '../../components/ui/Spinner';
import { TextField } from '../../components/ui/TextField';
import { ConfirmDialog } from '../../components/ui/ConfirmDialog';

const NOTIFICACIONES = '/api/v1/blocks/notificaciones';

interface NotificationRow {
  id: string;
  userId: string | null;
  title: string;
  body: string;
  read: boolean;
  createdAt: string;
}

interface Provider {
  id: string;
  name: string;
  enabled: boolean;
}

interface SendResult {
  ok: boolean;
  notification?: NotificationRow;
}

type View = 'inbox' | 'send';

export function NotificationsPage() {
  const [view, setView] = useState<View>('inbox');

  return (
    <div className="row" style={{ alignItems: 'flex-start', gap: 'var(--ws-space-6)' }}>
      <aside className="stack" style={{ minWidth: 220, maxWidth: 220 }}>
        <h1 style={{ fontSize: 'var(--ws-font-size-lg)' }}>Notificaciones</h1>
        <button
          className={`nav-link ${view === 'inbox' ? 'active' : ''}`}
          style={{ textAlign: 'left', background: 'none', border: 'none', cursor: 'pointer' }}
          onClick={() => setView('inbox')}
        >
          Bandeja
        </button>
        <button
          className={`nav-link ${view === 'send' ? 'active' : ''}`}
          style={{ textAlign: 'left', background: 'none', border: 'none', cursor: 'pointer' }}
          onClick={() => setView('send')}
        >
          Enviar
        </button>
      </aside>

      <div className="stack" style={{ flex: 1, minWidth: 0 }}>
        {view === 'inbox' ? <InboxView /> : <SendView />}
      </div>
    </div>
  );
}

function InboxView() {
  const qc = useQueryClient();

  const { data, isLoading } = useQuery({
    queryKey: ['notificaciones-inbox'],
    queryFn: () => api.get<NotificationRow[]>(`${NOTIFICACIONES}/inbox`),
  });

  const [confirmDelete, setConfirmDelete] = useState<NotificationRow | null>(null);

  const invalidate = () => qc.invalidateQueries({ queryKey: ['notificaciones-inbox'] });

  const markRead = useMutation({
    mutationFn: (id: string) => api.patch(`${NOTIFICACIONES}/read/${id}`, {}),
    onSuccess: invalidate,
  });

  const markAll = useMutation({
    mutationFn: () => api.patch(`${NOTIFICACIONES}/read-all`, {}),
    onSuccess: invalidate,
  });

  const remove = useMutation({
    mutationFn: (id: string) => api.del(`${NOTIFICACIONES}/${id}`),
    onSuccess: invalidate,
  });

  if (isLoading) return <Spinner />;

  return (
    <div className="stack">
      <div className="row" style={{ justifyContent: 'space-between', alignItems: 'center' }}>
        <h2>Bandeja</h2>
        <Button variant="secondary" onClick={() => markAll.mutate()} disabled={markAll.isPending}>
          Marcar todas como leídas
        </Button>
      </div>

      <Card>
        <table className="table">
          <thead>
            <tr>
              <th>Título</th>
              <th>Mensaje</th>
              <th>Estado</th>
              <th>Fecha</th>
              <th>Acciones</th>
            </tr>
          </thead>
          <tbody>
            {(data ?? []).map((n) => (
              <tr key={n.id}>
                <td>{n.title}</td>
                <td>
                  <span className="muted">{n.body}</span>
                </td>
                <td>
                  {n.read ? (
                    <span className="badge">Leída</span>
                  ) : (
                    <span className="badge" style={{ background: 'var(--ws-warning)', color: '#000' }}>
                      No leída
                    </span>
                  )}
                </td>
                <td>{new Date(n.createdAt).toLocaleString()}</td>
                <td>
                  <div className="row">
                    {!n.read && (
                      <Button variant="secondary" onClick={() => markRead.mutate(n.id)}>
                        Marcar leída
                      </Button>
                    )}
                    <Button variant="ghost" onClick={() => setConfirmDelete(n)}>
                      Eliminar
                    </Button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {(data ?? []).length === 0 && <p className="muted">No hay notificaciones.</p>}
      </Card>

      <ConfirmDialog
        open={confirmDelete !== null}
        title="Eliminar notificación"
        confirmLabel="Eliminar"
        danger
        onConfirm={() => {
          if (confirmDelete) remove.mutate(confirmDelete.id);
          setConfirmDelete(null);
        }}
        onCancel={() => setConfirmDelete(null)}
      >
        ¿Eliminar la notificación <strong>{confirmDelete?.title}</strong>? Esta acción es irreversible.
      </ConfirmDialog>
    </div>
  );
}

function SendView() {
  const qc = useQueryClient();

  const [userId, setUserId] = useState('');
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [result, setResult] = useState<SendResult | null>(null);

  const { data: providers } = useQuery({
    queryKey: ['notificaciones-providers'],
    queryFn: () => api.get<Provider[]>(`${NOTIFICACIONES}/providers`),
  });

  const send = useMutation({
    mutationFn: () =>
      api.post<SendResult>(`${NOTIFICACIONES}/send`, {
        ...(userId.trim() ? { userId: userId.trim() } : {}),
        title,
        body,
      }),
    onSuccess: (res) => {
      setResult(res);
      setUserId('');
      setTitle('');
      setBody('');
      qc.invalidateQueries({ queryKey: ['notificaciones-inbox'] });
    },
  });

  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    send.mutate();
  };

  return (
    <div className="stack">
      <h2>Enviar notificación</h2>

      <Card>
        <h3>Formulario</h3>
        <form className="stack" onSubmit={onSubmit}>
          <TextField
            label="ID de usuario (opcional)"
            value={userId}
            onChange={(e) => setUserId(e.target.value)}
            placeholder="Vacío = enviar a todos"
          />
          <TextField label="Título" value={title} onChange={(e) => setTitle(e.target.value)} required />
          <div className="field">
            <label>Mensaje</label>
            <textarea className="input" value={body} onChange={(e) => setBody(e.target.value)} rows={4} required />
          </div>
          <div className="row">
            <Button type="submit" disabled={send.isPending || !title || !body}>
              Enviar
            </Button>
          </div>
        </form>
      </Card>

      {send.isError && (
        <p className="muted" style={{ color: 'var(--ws-danger)' }}>
          No se pudo enviar la notificación.
        </p>
      )}

      {result && (
        <Card>
          <h3>Enviado</h3>
          <p>
            Estado: <strong>{result.ok ? 'ok' : 'falló'}</strong>
          </p>
          {result.notification && (
            <div className="stack">
              <span>
                <strong>{result.notification.title}</strong>
              </span>
              <span className="muted">{result.notification.body}</span>
            </div>
          )}
        </Card>
      )}

      <Card>
        <h3>Proveedores</h3>
        <div className="stack">
          {(providers ?? []).map((p) => (
            <div
              key={p.id}
              className="row"
              style={{ justifyContent: 'space-between', borderTop: '1px solid var(--ws-border)', paddingTop: 'var(--ws-space-2)' }}
            >
              <span>{p.name}</span>
              <span
                className="badge"
                style={p.enabled ? undefined : { background: 'var(--ws-surface-2)', color: 'var(--ws-text-muted)' }}
              >
                {p.enabled ? 'Activo' : 'Inactivo'}
              </span>
            </div>
          ))}
          {(providers ?? []).length === 0 && <p className="muted">Sin proveedores.</p>}
        </div>
      </Card>
    </div>
  );
}
