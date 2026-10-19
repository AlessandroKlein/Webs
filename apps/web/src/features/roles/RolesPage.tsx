import { useState, type FormEvent } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { api } from '../../lib/api';
import { Button } from '../../components/ui/Button';
import { Card } from '../../components/ui/Card';
import { Spinner } from '../../components/ui/Spinner';
import { TextField } from '../../components/ui/TextField';
import type { Page } from '@webs/core';

interface RoleRow {
  id: string;
  key: string;
  name: string;
  description: string | null;
  system: boolean;
  permissions: string[];
}

interface PermissionOption {
  key: string;
  description: string | null;
}

function toggle(list: string[], value: string): string[] {
  return list.includes(value) ? list.filter((v) => v !== value) : [...list, value];
}

export function RolesPage() {
  const { t } = useTranslation();
  const qc = useQueryClient();

  const { data, isLoading } = useQuery({
    queryKey: ['roles'],
    queryFn: () => api.get<Page<RoleRow>>('/api/v1/roles'),
  });
  const { data: permissions } = useQuery({
    queryKey: ['roles', 'permissions'],
    queryFn: () => api.get<PermissionOption[]>('/api/v1/permissions'),
  });

  // Estado del formulario de creación.
  const [key, setKey] = useState('');
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [createPermissions, setCreatePermissions] = useState<string[]>([]);

  // Estado del formulario de edición.
  const [editing, setEditing] = useState<RoleRow | null>(null);
  const [editName, setEditName] = useState('');
  const [editDescription, setEditDescription] = useState('');
  const [editPermissions, setEditPermissions] = useState<string[]>([]);

  const invalidate = () => qc.invalidateQueries({ queryKey: ['roles'] });

  const create = useMutation({
    mutationFn: (body: { key: string; name: string; description?: string; permissions: string[] }) =>
      api.post('/api/v1/roles', body),
    onSuccess: () => {
      invalidate();
      setKey('');
      setName('');
      setDescription('');
      setCreatePermissions([]);
    },
  });

  const update = useMutation({
    mutationFn: (vars: { id: string; name: string; description: string | null; permissions: string[] }) =>
      api.patch(`/api/v1/roles/${vars.id}`, {
        name: vars.name,
        description: vars.description,
        permissions: vars.permissions,
      }),
    onSuccess: () => {
      invalidate();
      setEditing(null);
    },
  });

  const remove = useMutation({
    mutationFn: (id: string) => api.del(`/api/v1/roles/${id}`),
    onSuccess: invalidate,
  });

  if (isLoading) return <Spinner />;

  const permissionOptions = permissions ?? [];

  const onSubmitCreate = (e: FormEvent) => {
    e.preventDefault();
    create.mutate({ key, name, description: description || undefined, permissions: createPermissions });
  };

  const startEdit = (role: RoleRow) => {
    setEditing(role);
    setEditName(role.name);
    setEditDescription(role.description ?? '');
    setEditPermissions(role.permissions);
  };

  const onSubmitEdit = (e: FormEvent) => {
    e.preventDefault();
    if (!editing) return;
    update.mutate({
      id: editing.id,
      name: editName,
      description: editDescription || null,
      permissions: editPermissions,
    });
  };

  return (
    <div className="stack">
      <h1>{t('nav.roles')}</h1>

      <Card>
        <h3>{t('common.create')}</h3>
        <form className="stack" onSubmit={onSubmitCreate}>
          <div className="row" style={{ alignItems: 'flex-end', flexWrap: 'wrap' }}>
            <TextField
              label="Clave"
              value={key}
              onChange={(e) => setKey(e.target.value)}
              required
              placeholder="editor"
            />
            <TextField label="Nombre" value={name} onChange={(e) => setName(e.target.value)} required />
            <TextField label="Descripción" value={description} onChange={(e) => setDescription(e.target.value)} />
          </div>
          <PermissionsCheckboxes
            options={permissionOptions}
            selected={createPermissions}
            onChange={setCreatePermissions}
          />
          <div className="row">
            <Button type="submit" disabled={create.isPending}>
              {t('common.create')}
            </Button>
          </div>
        </form>
      </Card>

      {editing && (
        <Card>
          <h3>
            {t('common.edit')}: <code>{editing.key}</code>
          </h3>
          <form className="stack" onSubmit={onSubmitEdit}>
            <div className="row" style={{ alignItems: 'flex-end', flexWrap: 'wrap' }}>
              <TextField label="Nombre" value={editName} onChange={(e) => setEditName(e.target.value)} required />
              <TextField
                label="Descripción"
                value={editDescription}
                onChange={(e) => setEditDescription(e.target.value)}
              />
            </div>
            <PermissionsCheckboxes
              options={permissionOptions}
              selected={editPermissions}
              onChange={setEditPermissions}
            />
            <div className="row">
              <Button type="submit" disabled={update.isPending}>
                {t('common.save')}
              </Button>
              <Button variant="ghost" onClick={() => setEditing(null)}>
                {t('common.cancel')}
              </Button>
            </div>
          </form>
        </Card>
      )}

      <Card>
        <table className="table">
          <thead>
            <tr>
              <th>Clave</th>
              <th>Nombre</th>
              <th>Descripción</th>
              <th>Permisos</th>
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
                      sistema
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
                    r.permissions.map((p) => (
                      <span key={p} className="badge" style={{ marginRight: 4 }}>
                        {p}
                      </span>
                    ))
                  )}
                </td>
                <td>
                  {!r.system && (
                    <div className="row">
                      <Button variant="secondary" onClick={() => startEdit(r)}>
                        {t('common.edit')}
                      </Button>
                      <Button
                        variant="ghost"
                        onClick={() => {
                          if (window.confirm(`¿Eliminar el rol "${r.name}"?`)) remove.mutate(r.id);
                        }}
                      >
                        {t('common.delete')}
                      </Button>
                    </div>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
    </div>
  );
}

function PermissionsCheckboxes({
  options,
  selected,
  onChange,
}: {
  options: PermissionOption[];
  selected: string[];
  onChange: (next: string[]) => void;
}) {
  if (options.length === 0) return <p className="muted">No hay permisos disponibles.</p>;

  return (
    <div>
      <strong>Permisos</strong>
      <div className="row" style={{ flexWrap: 'wrap', gap: 8 }}>
        {options.map((p) => (
          <label key={p.key} className="row" style={{ gap: 6, margin: '2px 0' }} title={p.description ?? undefined}>
            <input
              type="checkbox"
              checked={selected.includes(p.key)}
              onChange={() => onChange(toggle(selected, p.key))}
            />
            <span>
              <code>{p.key}</code>
              {p.description ? <span className="muted"> · {p.description}</span> : null}
            </span>
          </label>
        ))}
      </div>
    </div>
  );
}
