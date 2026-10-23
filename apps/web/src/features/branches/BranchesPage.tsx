import { useState, type FormEvent } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { api } from '../../lib/api';
import { useTenantStore, type ChainOrg } from '../../lib/tenant-store';
import { Button } from '../../components/ui/Button';
import { Card } from '../../components/ui/Card';
import { Spinner } from '../../components/ui/Spinner';
import { TextField } from '../../components/ui/TextField';
import { Badge } from '../../components/ui/Badge';
import { ConfirmDialog } from '../../components/ui/ConfirmDialog';
import { FeatureList } from '../../components/ui/FeatureList';
import { ScopeBadge } from '../../components/tenant/ScopeSwitcher';
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

const BRANCH_SCOPE_LIMITS = [
  {
    id: 'own-finances',
    labelKey: 'branches.scopeOwnFinances',
    descriptionKey: 'branches.scopeOwnFinancesDesc',
    enabled: true,
  },
  {
    id: 'shared-inventory',
    labelKey: 'branches.scopeSharedInventory',
    descriptionKey: 'branches.scopeSharedInventoryDesc',
    enabled: true,
  },
  {
    id: 'consolidated-view',
    labelKey: 'branches.scopeConsolidatedView',
    descriptionKey: 'branches.scopeConsolidatedViewDesc',
    enabled: false,
  },
  {
    id: 'cross-branch',
    labelKey: 'branches.scopeCrossBranch',
    descriptionKey: 'branches.scopeCrossBranchDesc',
    enabled: false,
  },
];

export function BranchesPage() {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const root = useTenantStore((s) => s.root);
  const branches = useTenantStore((s) => s.branches);
  const loaded = useTenantStore((s) => s.loaded);
  const reload = useTenantStore((s) => s.load);

  // ---- Crear sucursal ----
  const [name, setName] = useState('');
  const [slug, setSlug] = useState('');
  const [active, setActive] = useState(true);
  const [shareInventory, setShareInventory] = useState(true);

  // ---- Editar ----
  const [editing, setEditing] = useState<ChainOrg | null>(null);
  const [editName, setEditName] = useState('');
  const [editSlug, setEditSlug] = useState('');
  const [editActive, setEditActive] = useState(true);
  const [editShareInventory, setEditShareInventory] = useState(false);

  // ---- Eliminar ----
  const [deleting, setDeleting] = useState<ChainOrg | null>(null);

  // ---- Asignar admin ----
  const [assigning, setAssigning] = useState<ChainOrg | null>(null);
  const [userQuery, setUserQuery] = useState('');
  const [selectedUserId, setSelectedUserId] = useState('');

  const usersQuery = useQuery({
    queryKey: ['branch-admin-users', userQuery],
    queryFn: () =>
      api.get<Page<UserRow>>(`/api/v1/users${userQuery ? `?q=${encodeURIComponent(userQuery)}` : ''}`),
    enabled: assigning !== null,
  });

  const refresh = () => {
    void reload();
    void qc.invalidateQueries({ queryKey: ['branch-admin-users'] });
  };

  const createBranch = useMutation({
    mutationFn: (body: { name: string; slug?: string; active: boolean; shareInventory: boolean }) =>
      api.post('/api/v1/plugins/organizaciones/organizations', body),
    onSuccess: () => {
      setName('');
      setSlug('');
      setActive(true);
      setShareInventory(true);
      refresh();
    },
  });

  const updateBranch = useMutation({
    mutationFn: (body: { name: string; slug: string | null; active: boolean; shareInventory: boolean }) =>
      api.patch(`/api/v1/plugins/organizaciones/organizations/${editing?.id}`, body),
    onSuccess: () => {
      setEditing(null);
      refresh();
    },
  });

  const deleteBranch = useMutation({
    mutationFn: (id: string) => api.del(`/api/v1/plugins/organizaciones/organizations/${id}`),
    onSuccess: () => {
      setDeleting(null);
      refresh();
    },
  });

  const assignAdmin = useMutation({
    mutationFn: (body: { organizationId: string; userId: string; role: string }) =>
      api.post('/api/v1/plugins/organizaciones/memberships', body),
    onSuccess: () => {
      setAssigning(null);
      setSelectedUserId('');
      setUserQuery('');
      refresh();
    },
  });

  function submitCreate(e: FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    // `type`/`parentId` se envían para forward-compat; el backend actual (t22) aún
    // no los persiste (gap G3). Ver nota en pantalla.
    createBranch.mutate({ name: name.trim(), slug: slug.trim() || undefined, active, shareInventory });
  }

  function submitAssign(e: FormEvent) {
    e.preventDefault();
    if (!assigning || !selectedUserId) return;
    assignAdmin.mutate({ organizationId: assigning.id, userId: selectedUserId, role: 'admin' });
  }

  const users = usersQuery.data?.items ?? [];

  const scopeFeatures = BRANCH_SCOPE_LIMITS.map((f) => ({
    id: f.id,
    label: t(f.labelKey),
    description: t(f.descriptionKey),
    enabled: f.enabled,
  }));

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="text-xl font-semibold">{t('branches.title')}</h1>
        <ScopeBadge />
      </div>

      {!loaded ? (
        <Spinner />
      ) : !root || branches.length === 0 ? (
        <Card>
          <Card.Header>
            <Card.Title>{t('branches.noChainTitle')}</Card.Title>
            <Card.Description>{t('branches.noChainDesc')}</Card.Description>
          </Card.Header>
        </Card>
      ) : null}

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        {/* Columna izquierda: crear + límites */}
        <div className="flex flex-col gap-6">
          <Card>
            <Card.Header>
              <Card.Title>{t('branches.createTitle')}</Card.Title>
              <Card.Description>
                {t('branches.createDesc', { name: root?.name ?? '' })}
              </Card.Description>
            </Card.Header>
            <Card.Content>
              <form onSubmit={submitCreate} className="flex flex-col gap-3">
                <TextField label={t('common.name')} value={name} onChange={(e) => setName(e.target.value)} required />
                <TextField
                  label={t('branches.slug')}
                  value={slug}
                  onChange={(e) => setSlug(e.target.value)}
                  placeholder="sucursal-norte"
                  hint={t('branches.slugHint')}
                />
                <label className="flex items-center gap-2 text-sm">
                  <input type="checkbox" checked={active} onChange={(e) => setActive(e.target.checked)} />
                  {t('branches.activeF')}
                </label>
                <label className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={shareInventory}
                    onChange={(e) => setShareInventory(e.target.checked)}
                  />
                  {t('branches.shareInventory')}
                </label>
                <Button type="submit" loading={createBranch.isPending}>
                  {t('branches.create')}
                </Button>
                {createBranch.isError && (
                  <p className="text-sm text-danger" role="alert">
                    {t('branches.createError')}
                  </p>
                )}
              </form>
            </Card.Content>
          </Card>

          <Card>
            <Card.Header>
              <Card.Title>{t('branches.scopeLimitsTitle')}</Card.Title>
              <Card.Description>{t('branches.scopeLimitsDesc')}</Card.Description>
            </Card.Header>
            <Card.Content>
              <FeatureList features={scopeFeatures} ariaLabel={t('branches.scopeLimitsAria')} />
            </Card.Content>
          </Card>
        </div>

        {/* Columna derecha: listado + asignar admin */}
        <div className="flex flex-col gap-6 lg:col-span-2">
          <Card>
            <Card.Header>
              <Card.Title>{t('branches.listTitle', { count: branches.length })}</Card.Title>
              <Card.Description>
                {t('branches.headquarters')}{' '}
                <span className="font-medium text-text">{root?.name ?? '—'}</span>
              </Card.Description>
            </Card.Header>
            <Card.Content>
              {branches.length === 0 ? (
                <p className="text-sm text-muted">{t('branches.noBranches')}</p>
              ) : (
                <div className="flex flex-col gap-3">
                  {branches.map((branch) => (
                    <div
                      key={branch.id}
                      className="flex flex-wrap items-center gap-3 rounded-lg border border-border p-3"
                    >
                      <div className="flex min-w-0 flex-1 flex-col gap-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="font-medium text-text">{branch.name}</span>
                          {branch.slug && <span className="font-mono text-xs text-subtle">/{branch.slug}</span>}
                          {branch.active ? (
                            <Badge variant="success">{t('branches.activeF')}</Badge>
                          ) : (
                            <Badge variant="neutral">{t('branches.inactiveF')}</Badge>
                          )}
                          {branch.shareInventory && <Badge variant="info">{t('branches.sharedInventoryBadge')}</Badge>}
                        </div>
                        <span className="text-sm text-muted">
                          {t('branches.membersLine', { count: branch.memberCount ?? 0, plan: branch.plan ?? 'free' })}
                        </span>
                      </div>
                      <div className="flex items-center gap-2">
                        <Button
                          variant="secondary"
                          size="sm"
                          onClick={() => {
                            setEditing(branch);
                            setEditName(branch.name);
                            setEditSlug(branch.slug ?? '');
                            setEditActive(branch.active);
                            setEditShareInventory(branch.shareInventory);
                          }}
                        >
                          {t('common.edit')}
                        </Button>
                        <Button
                          variant="secondary"
                          size="sm"
                          onClick={() => {
                            setAssigning(branch);
                            setSelectedUserId('');
                            setUserQuery('');
                          }}
                        >
                          {t('branches.assignAdmin')}
                        </Button>
                        <Button variant="destructive" size="sm" onClick={() => setDeleting(branch)}>
                          {t('common.delete')}
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </Card.Content>
          </Card>

          {assigning && (
            <Card>
              <Card.Header>
                <Card.Title>{t('branches.assignAdminTitle')}</Card.Title>
                <Card.Description>
                  {t('branches.assignAdminDesc', { name: assigning.name })}
                </Card.Description>
              </Card.Header>
              <Card.Content>
                <form onSubmit={submitAssign} className="flex flex-col gap-3">
                  <TextField
                    label={t('branches.searchUser')}
                    value={userQuery}
                    onChange={(e) => setUserQuery(e.target.value)}
                    placeholder={t('branches.searchUserPlaceholder')}
                  />
                  <label className="flex flex-col gap-1">
                    <span className="text-sm text-muted">{t('common.user')}</span>
                    <select
                      className="input"
                      value={selectedUserId}
                      onChange={(e) => setSelectedUserId(e.target.value)}
                      required
                    >
                      <option value="">{t('branches.selectUser')}</option>
                      {users.map((u) => (
                        <option key={u.id} value={u.id}>
                          {u.displayName ?? u.email} · {u.email}
                        </option>
                      ))}
                    </select>
                  </label>
                  <div className="flex items-center gap-2">
                    <Button type="submit" disabled={!selectedUserId} loading={assignAdmin.isPending}>
                      {t('branches.assignAdmin')}
                    </Button>
                    <Button type="button" variant="ghost" onClick={() => setAssigning(null)}>
                      {t('common.cancel')}
                    </Button>
                  </div>
                </form>
              </Card.Content>
            </Card>
          )}
        </div>
      </div>

      {/* Modal de edición */}
      {editing && (
        <ConfirmDialog
          open
          title={t('branches.editTitle', { name: editing.name })}
          confirmLabel={t('common.save')}
          onConfirm={() => {
            updateBranch.mutate({
              name: editName.trim(),
              slug: editSlug.trim() || null,
              active: editActive,
              shareInventory: editShareInventory,
            });
          }}
          onCancel={() => setEditing(null)}
        >
          <div className="flex flex-col gap-3">
            <TextField label={t('common.name')} value={editName} onChange={(e) => setEditName(e.target.value)} />
            <TextField label={t('branches.slug')} value={editSlug} onChange={(e) => setEditSlug(e.target.value)} />
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={editActive} onChange={(e) => setEditActive(e.target.checked)} />
              {t('branches.activeF')}
            </label>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={editShareInventory}
                onChange={(e) => setEditShareInventory(e.target.checked)}
              />
              {t('branches.shareInventory')}
            </label>
          </div>
        </ConfirmDialog>
      )}

      {/* Modal de borrado */}
      <ConfirmDialog
        open={deleting !== null}
        title={t('branches.deleteTitle')}
        danger
        confirmLabel={t('common.delete')}
        onConfirm={() => deleting && deleteBranch.mutate(deleting.id)}
        onCancel={() => setDeleting(null)}
      >
        {t('branches.deleteConfirm', { name: deleting?.name ?? '' })}
      </ConfirmDialog>
    </div>
  );
}
