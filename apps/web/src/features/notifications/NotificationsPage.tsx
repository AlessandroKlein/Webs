import { useState } from 'react';
import type { FormEvent } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
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
  priority: string;
  expiresAt: string | null;
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
  const { t } = useTranslation();
  const [view, setView] = useState<View>('inbox');

  return (
    <div className="row" style={{ alignItems: 'flex-start', gap: 'var(--ws-space-6)' }}>
      <aside className="stack" style={{ minWidth: 220, maxWidth: 220 }}>
        <h1 style={{ fontSize: 'var(--ws-font-size-lg)' }}>{t('admin.notifications.title')}</h1>
        <button
          className={`nav-link ${view === 'inbox' ? 'active' : ''}`}
          style={{ textAlign: 'left', background: 'none', border: 'none', cursor: 'pointer' }}
          onClick={() => setView('inbox')}
        >
          {t('admin.notifications.inbox')}
        </button>
        <button
          className={`nav-link ${view === 'send' ? 'active' : ''}`}
          style={{ textAlign: 'left', background: 'none', border: 'none', cursor: 'pointer' }}
          onClick={() => setView('send')}
        >
          {t('admin.notifications.send')}
        </button>
      </aside>

      <div className="stack" style={{ flex: 1, minWidth: 0 }}>
        {view === 'inbox' ? <InboxView /> : <SendView />}
      </div>
    </div>
  );
}

function InboxView() {
  const { t } = useTranslation();
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
        <h2>{t('admin.notifications.inbox')}</h2>
        <Button variant="secondary" onClick={() => markAll.mutate()} disabled={markAll.isPending}>
          {t('common.markAllRead')}
        </Button>
      </div>

      <Card>
        <table className="table">
          <thead>
            <tr>
              <th>{t('admin.notifications.titleCol')}</th>
              <th>{t('admin.notifications.message')}</th>
              <th>{t('common.priority')}</th>
              <th>{t('common.status')}</th>
              <th>{t('common.expires')}</th>
              <th>{t('common.actions')}</th>
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
                  <span
                    className="badge"
                    style={
                      n.priority === 'alta'
                        ? { background: 'var(--ws-danger)', color: '#fff' }
                        : n.priority === 'media'
                          ? { background: '#d97706', color: '#fff' }
                          : undefined
                    }
                  >
                    {n.priority === 'alta' ? t('admin.notifications.high') : n.priority === 'media' ? t('admin.notifications.medium') : t('admin.notifications.normal')}
                  </span>
                </td>
                <td>
                  {n.read ? (
                    <span className="badge">{t('admin.notifications.read')}</span>
                  ) : (
                    <span className="badge" style={{ background: 'var(--ws-warning)', color: '#000' }}>
                      {t('admin.notifications.unread')}
                    </span>
                  )}
                </td>
                <td>{n.expiresAt ? new Date(n.expiresAt).toLocaleString() : '—'}</td>
                <td>
                  <div className="row" style={{ gap: 'var(--ws-space-1)' }}>
                    {!n.read && (
                      <Button
                        variant="ghost"
                        title={t('common.markRead')}
                        aria-label={t('common.markRead')}
                        onClick={() => markRead.mutate(n.id)}
                      >
                        <i className="bi bi-check2" />
                      </Button>
                    )}
                    <Button
                      variant="ghost"
                      title={t('common.delete')}
                      aria-label={t('common.delete')}
                      onClick={() => setConfirmDelete(n)}
                      style={{ color: 'var(--ws-danger)' }}
                    >
                      <i className="bi bi-trash" />
                    </Button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {(data ?? []).length === 0 && <p className="muted">{t('admin.notifications.noNotifications')}</p>}
      </Card>

      <ConfirmDialog
        open={confirmDelete !== null}
        title={t('admin.notifications.deleteNotification')}
        confirmLabel={t('common.delete')}
        danger
        onConfirm={() => {
          if (confirmDelete) remove.mutate(confirmDelete.id);
          setConfirmDelete(null);
        }}
        onCancel={() => setConfirmDelete(null)}
      >
        {t('admin.notifications.deleteConfirm', { title: confirmDelete?.title })}
      </ConfirmDialog>
    </div>
  );
}

function SendView() {
  const { t } = useTranslation();
  const qc = useQueryClient();

  const [userId, setUserId] = useState('');
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [priority, setPriority] = useState('normal');
  const [expiresAt, setExpiresAt] = useState('');
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
        priority,
        ...(expiresAt ? { expiresAt: new Date(expiresAt).toISOString() } : {}),
      }),
    onSuccess: (res) => {
      setResult(res);
      setUserId('');
      setTitle('');
      setBody('');
      setPriority('normal');
      setExpiresAt('');
      qc.invalidateQueries({ queryKey: ['notificaciones-inbox'] });
    },
  });

  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    send.mutate();
  };

  return (
    <div className="stack">
      <h2>{t('admin.notifications.sendNotification')}</h2>

      <Card>
        <h3>{t('admin.notifications.form')}</h3>
        <form className="stack" onSubmit={onSubmit}>
          <TextField
            label={t('admin.notifications.userIdOptional')}
            value={userId}
            onChange={(e) => setUserId(e.target.value)}
            placeholder={t('admin.notifications.emptyAll')}
          />
          <TextField label={t('admin.notifications.titleCol')} value={title} onChange={(e) => setTitle(e.target.value)} required />
          <div className="field">
            <label>{t('admin.notifications.message')}</label>
            <textarea className="input" value={body} onChange={(e) => setBody(e.target.value)} rows={4} required />
          </div>
          <div className="grid-2" style={{ gap: 'var(--ws-space-2)' }}>
            <div className="field">
              <label>{t('common.priority')}</label>
              <select className="input" value={priority} onChange={(e) => setPriority(e.target.value)}>
                <option value="normal">{t('admin.notifications.normal')}</option>
                <option value="media">{t('admin.notifications.medium')}</option>
                <option value="alta">{t('admin.notifications.high')}</option>
              </select>
            </div>
            <div className="field">
              <label>{t('admin.notifications.expiryOptional')}</label>
              <input
                className="input"
                type="datetime-local"
                value={expiresAt}
                onChange={(e) => setExpiresAt(e.target.value)}
              />
            </div>
          </div>
          <div className="row">
            <Button type="submit" disabled={send.isPending || !title || !body}>
              {t('admin.notifications.send')}
            </Button>
          </div>
        </form>
      </Card>

      {send.isError && (
        <p className="muted" style={{ color: 'var(--ws-danger)' }}>
          {t('admin.notifications.sendFailed')}
        </p>
      )}

      {result && (
        <Card>
          <h3>{t('admin.notifications.sent')}</h3>
          <p>
            {t('admin.notifications.statusLabel')}: <strong>{result.ok ? t('admin.notifications.ok') : t('admin.notifications.failed')}</strong>
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
        <h3>{t('admin.notifications.providers')}</h3>
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
                {p.enabled ? t('common.active') : t('common.inactive')}
              </span>
            </div>
          ))}
          {(providers ?? []).length === 0 && <p className="muted">{t('admin.notifications.noProviders')}</p>}
        </div>
      </Card>
    </div>
  );
}
