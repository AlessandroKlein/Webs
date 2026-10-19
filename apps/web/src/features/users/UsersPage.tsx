import { useState, type FormEvent } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { api } from '../../lib/api';
import { Button } from '../../components/ui/Button';
import { Card } from '../../components/ui/Card';
import { Spinner } from '../../components/ui/Spinner';
import { TextField } from '../../components/ui/TextField';
import type { Page } from '@webs/core';

interface UserRow {
  id: string;
  email: string;
  displayName: string | null;
  locale: string;
  active: boolean;
  roles: string[];
  createdAt: string;
}

export function UsersPage() {
  const { t } = useTranslation();
  const qc = useQueryClient();

  const [search, setSearch] = useState('');
  const { data, isLoading } = useQuery({
    queryKey: ['users', search],
    queryFn: () => api.get<Page<UserRow>>(`/api/v1/users${search ? `?q=${encodeURIComponent(search)}` : ''}`),
  });

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [username, setUsername] = useState('');

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

  if (isLoading) return <Spinner />;

  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    create.mutate({ email, password, displayName, username: username || undefined });
  };

  return (
    <div className="stack">
      <h1>{t('nav.users')}</h1>

      <Card>
        <h3>{t('common.create')}</h3>
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

      <Card>
        <TextField label="Buscar" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Por correo o nombre…" />
        <table className="table">
          <thead>
            <tr>
              <th>{t('auth.email')}</th>
              <th>Nombre</th>
              <th>Roles</th>
              <th>Estado</th>
            </tr>
          </thead>
          <tbody>
            {(data?.items ?? []).map((u) => (
              <tr key={u.id}>
                <td>{u.email}</td>
                <td>{u.displayName ?? '—'}</td>
                <td>{u.roles.join(', ')}</td>
                <td>{u.active ? t('common.enabled') : t('common.disabled')}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
    </div>
  );
}
