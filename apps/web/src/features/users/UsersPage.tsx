import { useState, type FormEvent } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { api } from '../../lib/api';
import { Button } from '../../components/ui/Button';
import { Card } from '../../components/ui/Card';
import { Spinner } from '../../components/ui/Spinner';
import { TextField } from '../../components/ui/TextField';
import { ConfirmDialog } from '../../components/ui/ConfirmDialog';
import type { Page } from '@webs/core';

interface UserRow {
  id: string;
  email: string;
  displayName: string | null;
  username?: string | null;
  locale: string;
  active: boolean;
  roles: string[];
  createdAt: string;
}

interface RoleRow {
  id: string;
  key: string;
  name: string;
  description: string | null;
  system: boolean;
  permissions: string[];
}

function toggle(list: string[], value: string): string[] {
  return list.includes(value) ? list.filter((v) => v !== value) : [...list, value];
}

export function UsersPage() {
  const { t } = useTranslation();
  const qc = useQueryClient();

  const [view, setView] = useState<'list' | 'create' | 'invite'>('list');
  const [search, setSearch] = useState('');
  const { data, isLoading } = useQuery({
    queryKey: ['users', search],
    queryFn: () => api.get<Page<UserRow>>(`/api/v1/users${search ? `?q=${encodeURIComponent(search)}` : ''}`),
  });

  const { data: rolesData } = useQuery({
    queryKey: ['roles'],
    queryFn: () => api.get<Page<RoleRow>>('/api/v1/roles'),
  });

  // Estado del formulario de creación.
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [username, setUsername] = useState('');

  // Estado del formulario de edición.
  const [editing, setEditing] = useState<UserRow | null>(null);
  const [editDisplayName, setEditDisplayName] = useState('');
  const [editUsername, setEditUsername] = useState('');
  const [editActive, setEditActive] = useState(true);
  const [editLocale, setEditLocale] = useState('es');
  const [editRoles, setEditRoles] = useState<string[]>([]);

  const create = useMutation({
    mutationFn: (body: { email: string; password: string; displayName?: string; username?: string }) =>
      api.post('/api/v1/users', body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['users'] });
      setEmail('');
      setPassword('');
      setDisplayName('');
      setUsername('');
    },
  });

  const update = useMutation({
    mutationFn: (vars: { id: string; body: Record<string, unknown> }) =>
      api.patch(`/api/v1/users/${vars.id}`, vars.body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['users'] });
      setEditing(null);
    },
  });

  const remove = useMutation({
    mutationFn: (id: string) => api.del(`/api/v1/users/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['users'] }),
  });

  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteRole, setInviteRole] = useState('user');
  const [inviteUrl, setInviteUrl] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<UserRow | null>(null);
  const invite = useMutation({
    mutationFn: (body: { email: string; role: string }) => api.post<{ inviteUrl: string }>('/api/v1/users/invite', body),
    onSuccess: (r) => {
      setInviteUrl(r.inviteUrl);
      setInviteEmail('');
    },
  });

  if (isLoading) return <Spinner />;

  const roles = rolesData?.items ?? [];

  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    create.mutate({ email, password, displayName, username: username || undefined });
  };

  const startEdit = (u: UserRow) => {
    setEditing(u);
    setEditDisplayName(u.displayName ?? '');
    setEditUsername(u.username ?? '');
    setEditActive(u.active);
    setEditLocale(u.locale);
    setEditRoles(u.roles);
  };

  const onSubmitEdit = (e: FormEvent) => {
    e.preventDefault();
    if (!editing) return;
    const body: Record<string, unknown> = {
      displayName: editDisplayName || null,
      active: editActive,
      locale: editLocale,
      roles: editRoles,
    };
    if (editUsername.trim()) body.username = editUsername.trim();
    update.mutate({ id: editing.id, body });
  };

  return (
    <div className="row" style={{ alignItems: 'flex-start', gap: 'var(--ws-space-6)' }}>
      <aside className="stack" style={{ minWidth: 220, maxWidth: 220 }}>
        <h1 style={{ fontSize: 'var(--ws-font-size-lg)', margin: 0 }}>{t('nav.users')}</h1>
        <button className={`nav-link ${view === 'list' ? 'active' : ''}`} style={{ textAlign: 'left', background: 'none', border: 'none', cursor: 'pointer' }} onClick={() => setView('list')}>Listado</button>
        <button className={`nav-link ${view === 'create' ? 'active' : ''}`} style={{ textAlign: 'left', background: 'none', border: 'none', cursor: 'pointer' }} onClick={() => setView('create')}>Crear usuario</button>
        <button className={`nav-link ${view === 'invite' ? 'active' : ''}`} style={{ textAlign: 'left', background: 'none', border: 'none', cursor: 'pointer' }} onClick={() => setView('invite')}>Invitar</button>
      </aside>

      <div className="stack" style={{ flex: 1, minWidth: 0 }}>
        {view === 'list' && (
          <>
            <Card>
              <TextField label="Buscar" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Por correo o nombre…" />
              <table className="table">
                <thead>
                  <tr>
                    <th>{t('auth.email')}</th>
                    <th>Nombre</th>
                    <th>Roles</th>
                    <th>Estado</th>
                    <th>{t('common.actions')}</th>
                  </tr>
                </thead>
                <tbody>
                  {(data?.items ?? []).map((u) => (
                    <tr key={u.id}>
                      <td>{u.email}</td>
                      <td>{u.displayName ?? '—'}</td>
                      <td>{u.roles.join(', ')}</td>
                      <td>{u.active ? t('common.enabled') : t('common.disabled')}</td>
                      <td>
                        <div className="row">
                          <Button variant="secondary" onClick={() => startEdit(u)}>
                            {t('common.edit')}
                          </Button>
                          <Button
                            variant="ghost"
                            onClick={() => setConfirmDelete(u)}
                          >
                            {t('common.delete')}
                          </Button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </Card>

            {editing && (
              <Card>
                <h3>
                  {t('common.edit')}: {editing.email}
                </h3>
                <form className="stack" onSubmit={onSubmitEdit}>
                  <div className="row" style={{ alignItems: 'flex-end', flexWrap: 'wrap' }}>
                    <TextField label="Nombre" value={editDisplayName} onChange={(e) => setEditDisplayName(e.target.value)} />
                    <TextField label="Nombre de usuario" value={editUsername} onChange={(e) => setEditUsername(e.target.value)} />
                    <TextField label="Locale" value={editLocale} onChange={(e) => setEditLocale(e.target.value)} placeholder="es" />
                    <label className="row" style={{ gap: 8 }}>
                      <input type="checkbox" checked={editActive} onChange={(e) => setEditActive(e.target.checked)} />
                      Activo
                    </label>
                  </div>

                  <div>
                    <strong>Roles</strong>
                    <div className="row" style={{ flexWrap: 'wrap', gap: 8 }}>
                      {roles.map((r) => (
                        <label key={r.id} className="row" style={{ gap: 6 }}>
                          <input
                            type="checkbox"
                            checked={editRoles.includes(r.key)}
                            onChange={() => setEditRoles(toggle(editRoles, r.key))}
                          />
                          {r.name} <span className="muted">({r.key})</span>
                        </label>
                      ))}
                    </div>
                  </div>

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

            <ConfirmDialog
              open={confirmDelete !== null}
              title="Eliminar usuario"
              confirmLabel="Eliminar"
              danger
              onConfirm={() => { if (confirmDelete) remove.mutate(confirmDelete.id); setConfirmDelete(null); }}
              onCancel={() => setConfirmDelete(null)}
            >
              ¿Eliminar el usuario <strong>{confirmDelete?.email}</strong>? Esta acción es irreversible.
            </ConfirmDialog>
          </>
        )}

        {view === 'create' && (
          <Card>
            <h3>Crear usuario</h3>
            <form className="row" onSubmit={onSubmit} style={{ alignItems: 'flex-end', flexWrap: 'wrap' }}>
              <TextField label={t('auth.email')} type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
              <TextField label="Nombre de usuario" value={username} onChange={(e) => setUsername(e.target.value)} />
              <TextField label={t('auth.password')} type="password" value={password} onChange={(e) => setPassword(e.target.value)} required />
              <TextField label="Nombre" value={displayName} onChange={(e) => setDisplayName(e.target.value)} />
              <Button type="submit" disabled={create.isPending}>
                {t('common.create')}
              </Button>
            </form>
          </Card>
        )}

        {view === 'invite' && (
          <Card>
            <h3>Invitar usuario (link de un solo uso)</h3>
            <form className="row" onSubmit={(e) => { e.preventDefault(); if (inviteEmail) invite.mutate({ email: inviteEmail, role: inviteRole }); }} style={{ alignItems: 'flex-end', flexWrap: 'wrap' }}>
              <TextField label="Email" type="email" value={inviteEmail} onChange={(e) => setInviteEmail(e.target.value)} required />
              <select className="input" style={{ width: 'auto' }} value={inviteRole} onChange={(e) => setInviteRole(e.target.value)}>
                {roles.map((r) => <option key={r.key} value={r.key}>{r.name}</option>)}
              </select>
              <Button type="submit" disabled={invite.isPending}>Generar link</Button>
            </form>
            {inviteUrl && (
              <p className="muted" style={{ wordBreak: 'break-all', marginTop: 'var(--ws-space-2)' }}>
                Link: <code>{window.location.origin}{inviteUrl}</code>
              </p>
            )}
          </Card>
        )}
      </div>
    </div>
  );
}
