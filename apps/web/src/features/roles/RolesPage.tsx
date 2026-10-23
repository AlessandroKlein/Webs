import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { api } from '../../lib/api';
import { Button } from '../../components/ui/Button';
import { Card } from '../../components/ui/Card';
import { Spinner } from '../../components/ui/Spinner';
import { ConfirmDialog } from '../../components/ui/ConfirmDialog';
import { RoleFormDialog, type PermissionAreaGroup, type RoleFormValues } from './RoleFormDialog';
import type { Page } from '@webs/core';

interface RoleRow {
  id: string;
  key: string;
  name: string;
  description: string | null;
  system: boolean;
  permissions: string[];
}

interface PermissionCatalogResponse {
  areas: PermissionAreaGroup[];
}

type RoleDialogState = { mode: 'create' } | { mode: 'edit'; role: RoleRow } | null;

export function RolesPage() {
  const { t } = useTranslation();
  const qc = useQueryClient();

  const { data, isLoading } = useQuery({
    queryKey: ['roles'],
    queryFn: () => api.get<Page<RoleRow>>('/api/v1/roles'),
  });
  const { data: catalog } = useQuery({
    queryKey: ['roles', 'permissions'],
    queryFn: () => api.get<PermissionCatalogResponse>('/api/v1/permissions'),
  });

  const [dialog, setDialog] = useState<RoleDialogState>(null);
  const [confirmDelete, setConfirmDelete] = useState<RoleRow | null>(null);

  const invalidate = () => qc.invalidateQueries({ queryKey: ['roles'] });

  const create = useMutation({
    mutationFn: (body: { key: string; name: string; description?: string; permissions: string[] }) =>
      api.post('/api/v1/roles', body),
    onSuccess: () => {
      invalidate();
      setDialog(null);
    },
  });

  const update = useMutation({
    mutationFn: (vars: { id: string; name: string; description: string | null; permissions?: string[] }) =>
      api.patch(`/api/v1/roles/${vars.id}`, {
        name: vars.name,
        description: vars.description,
        ...(vars.permissions !== undefined ? { permissions: vars.permissions } : {}),
      }),
    onSuccess: () => {
      invalidate();
      setDialog(null);
    },
  });

  const remove = useMutation({
    mutationFn: (id: string) => api.del(`/api/v1/roles/${id}`),
    onSuccess: invalidate,
  });

  if (isLoading) return <Spinner />;

  const areas = catalog?.areas ?? [];

  const handleSave = (values: RoleFormValues) => {
    if (!dialog) return;
    if (dialog.mode === 'create') {
      create.mutate({
        key: values.key.trim(),
        name: values.name,
        description: values.description || undefined,
        permissions: values.permissions,
      });
    } else {
      // Los roles de sistema solo permiten renombrar (el backend rechaza editar permisos).
      const role = dialog.role;
      update.mutate({
        id: role.id,
        name: values.name,
        description: values.description || null,
        ...(role.system ? {} : { permissions: values.permissions }),
      });
    }
  };

  const dialogInitial: RoleFormValues = !dialog
    ? { key: '', name: '', description: '', permissions: [] }
    : dialog.mode === 'create'
      ? { key: '', name: '', description: '', permissions: [] }
      : {
          key: dialog.role.key,
          name: dialog.role.name,
          description: dialog.role.description ?? '',
          permissions: dialog.role.permissions,
        };

  return (
    <div className="stack">
      <div className="row" style={{ justifyContent: 'space-between', alignItems: 'center' }}>
        <h1 style={{ margin: 0 }}>{t('nav.roles')}</h1>
        <Button onClick={() => setDialog({ mode: 'create' })}>
          <i className="bi bi-plus-lg" aria-hidden="true" />
          {t('roles.createRole')}
        </Button>
      </div>

      <Card>
        <table className="table table-striped table-hover">
          <thead>
            <tr>
              <th>{t('roles.key')}</th>
              <th>{t('common.name')}</th>
              <th>{t('roles.description')}</th>
              <th>{t('roles.permissions')}</th>
              <th>{t('common.actions')}</th>
            </tr>
          </thead>
          <tbody>
            {(data?.items ?? []).map((r) => (
              <tr key={r.id}>
                <td>
                  <code>{r.key}</code>
                  {r.system && (
                    <span className="badge" style={{ marginLeft: 8 }}>
                      {t('roles.system')}
                    </span>
                  )}
                </td>
                <td>{r.name}</td>
                <td>
                  <span className="muted">{r.description ?? '—'}</span>
                </td>
                <td>
                  {r.permissions.length === 0 ? (
                    <span className="muted">—</span>
                  ) : (
                    <span className="badge">{t('roles.permissionsCount', { count: r.permissions.length })}</span>
                  )}
                </td>
                <td>
                  <div className="row">
                    <Button variant="secondary" onClick={() => setDialog({ mode: 'edit', role: r })}>
                      {t('common.edit')}
                    </Button>
                    {!r.system && (
                      <Button variant="ghost" onClick={() => setConfirmDelete(r)}>
                        {t('common.delete')}
                      </Button>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>

      {dialog && (
        <RoleFormDialog
          title={
            dialog.mode === 'create'
              ? t('roles.createRole')
              : t('roles.editRole', { key: dialog.role.key })
          }
          initial={dialogInitial}
          areas={areas}
          isSystem={dialog.mode === 'edit' && dialog.role.system}
          saving={create.isPending || update.isPending}
          onSave={handleSave}
          onCancel={() => setDialog(null)}
        />
      )}

      <ConfirmDialog
        open={confirmDelete !== null}
        title={t('roles.deleteRole')}
        confirmLabel={t('common.delete')}
        danger
        onConfirm={() => { if (confirmDelete) remove.mutate(confirmDelete.id); setConfirmDelete(null); }}
        onCancel={() => setConfirmDelete(null)}
      >
        {t('roles.deleteRoleConfirm', { name: confirmDelete?.name ?? '' })}
      </ConfirmDialog>
    </div>
  );
}
