import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { api } from '../../lib/api';
import { useAuthStore } from '../../lib/auth-store';
import { Button } from '../../components/ui/Button';
import { Card } from '../../components/ui/Card';
import { Spinner } from '../../components/ui/Spinner';
import { Badge } from '../../components/ui/Badge';
import { Dialog } from '../../components/ui/Dialog';
import { TextField } from '../../components/ui/TextField';
import { ConfirmDialog } from '../../components/ui/ConfirmDialog';
import { Tabs } from '../../components/ui/Tabs';

const BASE = '/api/v1/support/tickets';

type TicketStatus = 'pending' | 'in_progress' | 'done';
type TicketPriority = 'low' | 'normal' | 'high' | 'urgent';

interface Ticket {
  id: string;
  organizationId: string;
  subject: string;
  message: string;
  status: TicketStatus;
  priority: TicketPriority;
  assignedToUserId: string | null;
  authorId: string | null;
  resolvedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

const STATUSES: TicketStatus[] = ['pending', 'in_progress', 'done'];
const PRIORITIES: TicketPriority[] = ['low', 'normal', 'high', 'urgent'];

const STATUS_TONE: Record<TicketStatus, 'warning' | 'info' | 'success'> = {
  pending: 'warning',
  in_progress: 'info',
  done: 'success',
};

const PRIORITY_TONE: Record<TicketPriority, 'neutral' | 'info' | 'warning' | 'danger'> = {
  low: 'neutral',
  normal: 'info',
  high: 'warning',
  urgent: 'danger',
};

/** Filtro de estado: 'all' o un valor de `TicketStatus`. */
type StatusFilter = 'all' | TicketStatus;

/**
 * Soporte (admin): tickets del sistema (ADR-0021, backend t116).
 *
 * Lista por estado (filtro por pestañas), permite crear tickets (modal con
 * todos los campos) y, para quienes tienen `support.manage`, cambiar estado y
 * prioridad en línea y eliminar. Consume `/api/v1/support/tickets`.
 */
export function SupportPage() {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const hasPermission = useAuthStore((s) => s.hasPermission);
  const canManage = hasPermission('support.manage');

  const [filter, setFilter] = useState<StatusFilter>('all');
  const [createOpen, setCreateOpen] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState<Ticket | null>(null);

  const { data, isLoading, isError } = useQuery({
    queryKey: ['support-tickets'],
    queryFn: () => api.get<{ items: Ticket[] }>(BASE),
  });

  const invalidate = () => qc.invalidateQueries({ queryKey: ['support-tickets'] });

  const patchTicket = useMutation({
    mutationFn: (vars: { id: string; patch: Partial<Pick<Ticket, 'status' | 'priority'>> }) =>
      api.patch<Ticket>(`${BASE}/${vars.id}`, vars.patch),
    onSuccess: invalidate,
  });

  const removeTicket = useMutation({
    mutationFn: (id: string) => api.del(`${BASE}/${id}`),
    onSuccess: invalidate,
  });

  const tickets = useMemo(() => {
    const all = data?.items ?? [];
    return filter === 'all' ? all : all.filter((tk) => tk.status === filter);
  }, [data, filter]);

  const counts = useMemo(() => {
    const items = data?.items ?? [];
    return {
      all: items.length,
      pending: items.filter((tk) => tk.status === 'pending').length,
      in_progress: items.filter((tk) => tk.status === 'in_progress').length,
      done: items.filter((tk) => tk.status === 'done').length,
    };
  }, [data]);

  const tabs = [
    { value: 'all', label: `${t('support.all')} (${counts.all})` },
    { value: 'pending', label: `${t('status.pending')} (${counts.pending})`, icon: 'bi-hourglass-split' },
    { value: 'in_progress', label: `${t('status.in_progress')} (${counts.in_progress})`, icon: 'bi-arrow-repeat' },
    { value: 'done', label: `${t('status.done')} (${counts.done})`, icon: 'bi-check2-circle' },
  ];

  return (
    <div className="stack" style={{ gap: 'var(--ws-space-4)' }}>
      <div className="row" style={{ justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 'var(--ws-space-3)' }}>
        <div className="stack" style={{ gap: 'var(--ws-space-1)' }}>
          <h1 style={{ fontSize: 'var(--ws-font-size-lg)', margin: 0 }}>{t('support.title')}</h1>
          <p className="muted" style={{ margin: 0 }}>{t('support.subtitle')}</p>
        </div>
        <Button onClick={() => setCreateOpen(true)}>
          <i className="bi bi-plus-lg" aria-hidden="true" />
          {t('support.create')}
        </Button>
      </div>

      <Tabs items={tabs} value={filter} onChange={(v) => setFilter(v as StatusFilter)} ariaLabel={t('support.filterAria')} />

      <Card>
        {isLoading && <Spinner />}
        {isError && !isLoading && <p className="muted">{t('support.error')}</p>}
        {!isLoading && !isError && tickets.length === 0 && <p className="muted">{t('support.empty')}</p>}
        {!isLoading && !isError && tickets.length > 0 && (
          <div style={{ overflowX: 'auto' }}>
            <table className="table">
              <thead>
                <tr>
                  <th>{t('support.subject')}</th>
                  <th>{t('support.priority')}</th>
                  <th>{t('support.status')}</th>
                  <th>{t('support.date')}</th>
                  {canManage && <th style={{ textAlign: 'right' }}>{t('support.actions')}</th>}
                </tr>
              </thead>
              <tbody>
                {tickets.map((tk) => (
                  <tr key={tk.id}>
                    <td>
                      <div className="stack" style={{ gap: 'var(--ws-space-1)' }}>
                        <strong>{tk.subject}</strong>
                        {tk.message && (
                          <span className="muted" style={{ fontSize: 'var(--ws-font-size-sm)' }} title={tk.message}>
                            {tk.message.length > 120 ? `${tk.message.slice(0, 120)}…` : tk.message}
                          </span>
                        )}
                      </div>
                    </td>
                    <td>
                      <div className="row" style={{ gap: 'var(--ws-space-2)', alignItems: 'center' }}>
                        <Badge variant={PRIORITY_TONE[tk.priority]}>{t(`priority.${tk.priority}`)}</Badge>
                        {canManage && (
                          <select
                            className="input"
                            style={{ width: 'auto' }}
                            value={tk.priority}
                            aria-label={t('support.priorityAria', { subject: tk.subject })}
                            onChange={(e) =>
                              patchTicket.mutate({ id: tk.id, patch: { priority: e.target.value as TicketPriority } })
                            }
                          >
                            {PRIORITIES.map((p) => (
                              <option key={p} value={p}>
                                {t(`priority.${p}`)}
                              </option>
                            ))}
                          </select>
                        )}
                      </div>
                    </td>
                    <td>
                      <div className="row" style={{ gap: 'var(--ws-space-2)', alignItems: 'center' }}>
                        <Badge variant={STATUS_TONE[tk.status]}>{t(`status.${tk.status}`)}</Badge>
                        {canManage && (
                          <select
                            className="input"
                            style={{ width: 'auto' }}
                            value={tk.status}
                            aria-label={t('support.statusAria', { subject: tk.subject })}
                            onChange={(e) =>
                              patchTicket.mutate({ id: tk.id, patch: { status: e.target.value as TicketStatus } })
                            }
                          >
                            {STATUSES.map((s) => (
                              <option key={s} value={s}>
                                {t(`status.${s}`)}
                              </option>
                            ))}
                          </select>
                        )}
                      </div>
                    </td>
                    <td>
                      <span className="muted">{new Date(tk.createdAt).toLocaleDateString('es-AR')}</span>
                    </td>
                    {canManage && (
                      <td style={{ textAlign: 'right' }}>
                        <Button variant="ghost" style={{ color: 'var(--ws-danger)' }} onClick={() => setConfirmDelete(tk)}>
                          {t('common.delete')}
                        </Button>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <CreateTicketDialog open={createOpen} onClose={() => setCreateOpen(false)} onCreated={invalidate} />

      <ConfirmDialog
        open={confirmDelete !== null}
        title={t('support.deleteTitle')}
        confirmLabel={t('common.delete')}
        danger
        onConfirm={() => {
          if (confirmDelete) removeTicket.mutate(confirmDelete.id);
          setConfirmDelete(null);
        }}
        onCancel={() => setConfirmDelete(null)}
      >
        {t('support.deleteConfirm', { subject: confirmDelete?.subject ?? '' })}
      </ConfirmDialog>
    </div>
  );
}

/** Modal "crear ticket" (patrón crear: todos los campos). */
function CreateTicketDialog({
  open,
  onClose,
  onCreated,
}: {
  open: boolean;
  onClose: () => void;
  onCreated: () => void;
}) {
  const { t } = useTranslation();
  const [subject, setSubject] = useState('');
  const [message, setMessage] = useState('');
  const [priority, setPriority] = useState<TicketPriority>('normal');
  const [subjectError, setSubjectError] = useState('');

  const create = useMutation({
    mutationFn: (body: { subject: string; message: string; priority: TicketPriority }) =>
      api.post<Ticket>(BASE, body),
    onSuccess: () => {
      setSubject('');
      setMessage('');
      setPriority('normal');
      setSubjectError('');
      onCreated();
      onClose();
    },
  });

  const submit = () => {
    const trimmed = subject.trim();
    if (!trimmed) {
      setSubjectError(t('support.subjectRequired'));
      return;
    }
    create.mutate({ subject: trimmed, message: message.trim(), priority });
  };

  return (
    <Dialog
      open={open}
      title={t('support.create')}
      onClose={onClose}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            {t('common.cancel')}
          </Button>
          <Button onClick={submit} disabled={create.isPending}>
            {create.isPending ? t('common.saving') : t('common.save')}
          </Button>
        </>
      }
    >
      <div className="stack" style={{ gap: 'var(--ws-space-4)' }}>
        {create.error && <p className="field-error">{create.error.message}</p>}
        <TextField
          label={t('support.subject')}
          value={subject}
          error={subjectError}
          placeholder={t('support.subjectPlaceholder')}
          onChange={(e) => {
            setSubject(e.target.value);
            if (subjectError) setSubjectError('');
          }}
        />
        <div className="field">
          <label htmlFor="ticket-message" className="form-label">
            {t('support.message')}
          </label>
          <textarea
            id="ticket-message"
            className="input"
            value={message}
            placeholder={t('support.messagePlaceholder')}
            onChange={(e) => setMessage(e.target.value)}
          />
        </div>
        <div className="field">
          <label htmlFor="ticket-priority" className="form-label">
            {t('support.priority')}
          </label>
          <select
            id="ticket-priority"
            className="input"
            value={priority}
            onChange={(e) => setPriority(e.target.value as TicketPriority)}
          >
            {PRIORITIES.map((p) => (
              <option key={p} value={p}>
                {t(`priority.${p}`)}
              </option>
            ))}
          </select>
        </div>
      </div>
    </Dialog>
  );
}
