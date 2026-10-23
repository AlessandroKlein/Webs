import { useState, type FormEvent } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
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
    label: 'Finanzas propias',
    description: 'La sucursal ve y gestiona solo sus ingresos y gastos.',
    enabled: true,
  },
  {
    id: 'shared-inventory',
    label: 'Inventario compartido',
    description: 'Puede compartir inventario con la casa matriz.',
    enabled: true,
  },
  {
    id: 'consolidated-view',
    label: 'Vista consolidada',
    description: 'Solo la casa matriz agrega las finanzas de todas las sucursales.',
    enabled: false,
  },
  {
    id: 'cross-branch',
    label: 'Datos de otras sucursales',
    description: 'Una sucursal no accede a los datos de las demás.',
    enabled: false,
  },
];

export function BranchesPage() {
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

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="text-xl font-semibold">Sucursales</h1>
        <ScopeBadge />
      </div>

      {!loaded ? (
        <Spinner />
      ) : !root || branches.length === 0 ? (
        <Card>
          <Card.Header>
            <Card.Title>Sin estructura de cadena</Card.Title>
            <Card.Description>
              No se detectó una casa matriz con sucursales (tipo `chain`/`branch`). Crea sucursales
              desde aquí para comenzar a operar multi-tenant.
            </Card.Description>
          </Card.Header>
        </Card>
      ) : null}

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        {/* Columna izquierda: crear + límites */}
        <div className="flex flex-col gap-6">
          <Card>
            <Card.Header>
              <Card.Title>Crear sucursal</Card.Title>
              <Card.Description>
                Se crea bajo la casa matriz {root?.name ?? ''}.
              </Card.Description>
            </Card.Header>
            <Card.Content>
              <form onSubmit={submitCreate} className="flex flex-col gap-3">
                <TextField label="Nombre" value={name} onChange={(e) => setName(e.target.value)} required />
                <TextField
                  label="Slug"
                  value={slug}
                  onChange={(e) => setSlug(e.target.value)}
                  placeholder="sucursal-norte"
                  hint="Identificador corto para URLs."
                />
                <label className="flex items-center gap-2 text-sm">
                  <input type="checkbox" checked={active} onChange={(e) => setActive(e.target.checked)} />
                  Activa
                </label>
                <label className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={shareInventory}
                    onChange={(e) => setShareInventory(e.target.checked)}
                  />
                  Compartir inventario con la casa matriz
                </label>
                <Button type="submit" loading={createBranch.isPending}>
                  Crear sucursal
                </Button>
                {createBranch.isError && (
                  <p className="text-sm text-danger" role="alert">
                    No se pudo crear la sucursal.
                  </p>
                )}
              </form>
            </Card.Content>
          </Card>

          <Card>
            <Card.Header>
              <Card.Title>Límites de alcance</Card.Title>
              <Card.Description>Qué puede y qué no puede ver una sucursal.</Card.Description>
            </Card.Header>
            <Card.Content>
              <FeatureList features={BRANCH_SCOPE_LIMITS} ariaLabel="Límites de alcance de la sucursal" />
            </Card.Content>
          </Card>
        </div>

        {/* Columna derecha: listado + asignar admin */}
        <div className="flex flex-col gap-6 lg:col-span-2">
          <Card>
            <Card.Header>
              <Card.Title>Sucursales ({branches.length})</Card.Title>
              <Card.Description>
                Casa matriz: <span className="font-medium text-text">{root?.name ?? '—'}</span>
              </Card.Description>
            </Card.Header>
            <Card.Content>
              {branches.length === 0 ? (
                <p className="text-sm text-muted">Aún no hay sucursales.</p>
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
                            <Badge variant="success">Activa</Badge>
                          ) : (
                            <Badge variant="neutral">Inactiva</Badge>
                          )}
                          {branch.shareInventory && <Badge variant="info">Inventario compartido</Badge>}
                        </div>
                        <span className="text-sm text-muted">
                          {branch.memberCount ?? 0} miembros · plan {branch.plan ?? 'free'}
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
                          Editar
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
                          Asignar admin
                        </Button>
                        <Button variant="destructive" size="sm" onClick={() => setDeleting(branch)}>
                          Eliminar
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
                <Card.Title>Asignar admin de sucursal</Card.Title>
                <Card.Description>
                  Otorga el rol <span className="font-medium text-text">admin</span> a un usuario en la
                  sucursal <span className="font-medium text-text">{assigning.name}</span>.
                </Card.Description>
              </Card.Header>
              <Card.Content>
                <form onSubmit={submitAssign} className="flex flex-col gap-3">
                  <TextField
                    label="Buscar usuario"
                    value={userQuery}
                    onChange={(e) => setUserQuery(e.target.value)}
                    placeholder="Email o nombre…"
                  />
                  <label className="flex flex-col gap-1">
                    <span className="text-sm text-muted">Usuario</span>
                    <select
                      className="input"
                      value={selectedUserId}
                      onChange={(e) => setSelectedUserId(e.target.value)}
                      required
                    >
                      <option value="">Seleccionar usuario…</option>
                      {users.map((u) => (
                        <option key={u.id} value={u.id}>
                          {u.displayName ?? u.email} · {u.email}
                        </option>
                      ))}
                    </select>
                  </label>
                  <div className="flex items-center gap-2">
                    <Button type="submit" disabled={!selectedUserId} loading={assignAdmin.isPending}>
                      Asignar admin
                    </Button>
                    <Button type="button" variant="ghost" onClick={() => setAssigning(null)}>
                      Cancelar
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
          title={`Editar ${editing.name}`}
          confirmLabel="Guardar"
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
            <TextField label="Nombre" value={editName} onChange={(e) => setEditName(e.target.value)} />
            <TextField label="Slug" value={editSlug} onChange={(e) => setEditSlug(e.target.value)} />
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={editActive} onChange={(e) => setEditActive(e.target.checked)} />
              Activa
            </label>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={editShareInventory}
                onChange={(e) => setEditShareInventory(e.target.checked)}
              />
              Compartir inventario
            </label>
          </div>
        </ConfirmDialog>
      )}

      {/* Modal de borrado */}
      <ConfirmDialog
        open={deleting !== null}
        title="Eliminar sucursal"
        danger
        confirmLabel="Eliminar"
        onConfirm={() => deleting && deleteBranch.mutate(deleting.id)}
        onCancel={() => setDeleting(null)}
      >
        Se eliminará <strong>{deleting?.name}</strong> junto con sus membresías y registros de
        asistencia. Esta acción no se puede deshacer.
      </ConfirmDialog>
    </div>
  );
}
