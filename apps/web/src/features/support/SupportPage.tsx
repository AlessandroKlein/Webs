import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../../lib/api';
import { Button } from '../../components/ui/Button';
import { Card } from '../../components/ui/Card';
import { Spinner } from '../../components/ui/Spinner';
import { ConfirmDialog } from '../../components/ui/ConfirmDialog';

const SUPPORT = '/api/v1/blocks/support';

interface Ticket {
  id: string;
  subject: string;
  message: string;
  status: string;
  createdAt: string;
}

const statusLabel = (s: string): string => (s === 'closed' ? 'Cerrado' : 'Abierto');

/**
 * Soporte (admin): tabla de tickets con cambio de estado (abierto/cerrado) y
 * eliminación. Consume el plugin de soporte (`/api/v1/blocks/support`).
 */
export function SupportPage() {
  const qc = useQueryClient();
  const { data: tickets, isLoading, isError } = useQuery({
    queryKey: ['support-tickets'],
    queryFn: () => api.get<Ticket[]>(`${SUPPORT}/tickets`),
  });
  const [confirmDelete, setConfirmDelete] = useState<Ticket | null>(null);

  const invalidate = () => qc.invalidateQueries({ queryKey: ['support-tickets'] });

  const patchTicket = useMutation({
    mutationFn: (vars: { id: string; status: string }) =>
      api.patch<Ticket>(`${SUPPORT}/tickets/${vars.id}`, { status: vars.status }),
    onSuccess: invalidate,
  });

  const removeTicket = useMutation({
    mutationFn: (id: string) => api.del(`${SUPPORT}/tickets/${id}`),
    onSuccess: invalidate,
  });

  return (
    <div className="stack">
      <h1 style={{ marginTop: 0 }}>Soporte</h1>
      <p className="muted" style={{ marginTop: 0 }}>
        Gestioná los tickets de soporte recibidos desde el sitio.
      </p>

      <Card>
        <h3 style={{ marginTop: 0 }}>Tickets</h3>
        {isLoading && <Spinner />}
        {isError && !isLoading && <p className="muted">No se pudieron cargar los tickets.</p>}
        {!isLoading && !isError && (tickets ?? []).length === 0 && (
          <p className="muted">Todavía no hay tickets.</p>
        )}
        {!isLoading && !isError && (tickets ?? []).length > 0 && (
          <table className="table">
            <thead>
              <tr>
                <th>Asunto</th>
                <th>Mensaje</th>
                <th>Estado</th>
                <th>Fecha</th>
                <th>Acciones</th>
              </tr>
            </thead>
            <tbody>
              {(tickets ?? []).map((t) => (
                <tr key={t.id}>
                  <td>
                    <strong>{t.subject}</strong>
                  </td>
                  <td>
                    <span className="muted">{t.message}</span>
                  </td>
                  <td>
                    <select
                      className="input"
                      value={t.status}
                      aria-label={`Estado de ${t.subject}`}
                      onChange={(e) => patchTicket.mutate({ id: t.id, status: e.target.value })}
                    >
                      <option value="open">Abierto</option>
                      <option value="closed">Cerrado</option>
                    </select>{' '}
                    <span className="badge">{statusLabel(t.status)}</span>
                  </td>
                  <td>{new Date(t.createdAt).toLocaleDateString('es-AR')}</td>
                  <td>
                    <Button variant="ghost" onClick={() => setConfirmDelete(t)}>
                      Eliminar
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>

      <ConfirmDialog
        open={confirmDelete !== null}
        title="Eliminar ticket"
        confirmLabel="Eliminar"
        danger
        onConfirm={() => {
          if (confirmDelete) removeTicket.mutate(confirmDelete.id);
          setConfirmDelete(null);
        }}
        onCancel={() => setConfirmDelete(null)}
      >
        ¿Eliminar el ticket «{confirmDelete?.subject}»?
      </ConfirmDialog>
    </div>
  );
}
