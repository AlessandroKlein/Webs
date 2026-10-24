import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { api } from '../../lib/api';
import { Button } from '../../components/ui/Button';
import { Card } from '../../components/ui/Card';
import { Spinner } from '../../components/ui/Spinner';
import { Badge } from '../../components/ui/Badge';

/** Ítem tal como lo expone `GET /api/v1/menu` (spec `menu-admin-redesign.md`). */
interface AdminMenuItem {
  id: string | null;
  source: 'core' | 'plugin';
  label: string;
  path: string;
  order?: number;
  section?: string;
  feature?: string;
  permissions?: string[];
}

interface PermissionOption {
  key: string;
  description?: string;
}

const SECTIONS = [
  'panel',
  'contenido',
  'ventas',
  'comunicacion',
  'comunidad',
  'apariencia',
  'integraciones',
  'configuracion',
  'usuarios',
] as const;

const FEATURES: { key: string; labelKey: string }[] = [
  { key: 'core', labelKey: 'feature.core' },
  { key: 'payments', labelKey: 'feature.payments' },
  { key: 'shipping', labelKey: 'feature.shipping' },
  { key: 'inventory', labelKey: 'feature.inventory' },
  { key: 'ai', labelKey: 'feature.ai' },
  { key: 'analytics', labelKey: 'feature.analytics' },
  { key: 'multitenant', labelKey: 'feature.multitenant' },
  { key: 'marketplace', labelKey: 'feature.marketplace' },
  { key: 'templates', labelKey: 'feature.templates' },
  { key: 'generator', labelKey: 'feature.generator' },
];

/**
 * Editor del menú de administración (tabla `menus`, clave `main`).
 *
 * Muestra los ítems REALES de `GET /menu` separados por origen:
 * - `core`   → ítems del núcleo (Prisma `menus`), editables (orden, sección,
 *              visibilidad/permiso y feature) y guardados vía `PUT /menu`.
 * - `plugin` → ítems que aporta cada plugin instalado (solo lectura: se
 *              regeneran en cada lectura y no deben guardarse).
 *
 * El guardado envía SOLO los ítems core, evitando la duplicación que producía
 * el editor anterior (que re-enviaba también los ítems de plugins).
 */
export function MenuEditorPage() {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const [coreItems, setCoreItems] = useState<AdminMenuItem[]>([]);
  const [saved, setSaved] = useState(false);

  const { data, isLoading } = useQuery({
    queryKey: ['admin-menu'],
    queryFn: () => api.get<{ items: AdminMenuItem[] }>('/api/v1/menu'),
  });

  const { data: permissionCatalog } = useQuery({
    queryKey: ['permissions-flat'],
    queryFn: () => api.get<PermissionOption[]>('/api/v1/permissions?format=flat'),
  });

  const coreFromServer = useMemo(
    () =>
      (data?.items ?? [])
        .filter((item) => item.source === 'core')
        .sort((a, b) => (a.order ?? 0) - (b.order ?? 0)),
    [data],
  );
  const pluginItems = useMemo(() => (data?.items ?? []).filter((item) => item.source === 'plugin'), [data]);

  // Sincroniza la lista editable cuando cambia el origen (no en cada render).
  useEffect(() => {
    setCoreItems(coreFromServer);
  }, [coreFromServer]);

  const save = useMutation({
    mutationFn: (next: AdminMenuItem[]) =>
      api.put<{ items: AdminMenuItem[] }>('/api/v1/menu', {
        items: next.map((it, idx) => ({
          label: it.label,
          path: it.path,
          order: idx,
          section: it.section,
          feature: it.feature ?? 'core',
          permissions: it.permissions ?? [],
        })),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['admin-menu'] });
      qc.invalidateQueries({ queryKey: ['public-menu'] });
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    },
  });

  const updateCore = (idx: number, patch: Partial<AdminMenuItem>) =>
    setCoreItems((prev) => prev.map((it, i) => (i === idx ? { ...it, ...patch } : it)));

  const moveCore = (idx: number, dir: -1 | 1) =>
    setCoreItems((prev) => {
      const target = idx + dir;
      if (target < 0 || target >= prev.length) return prev;
      const next = [...prev];
      const item = next[idx];
      if (!item) return prev;
      next.splice(idx, 1);
      next.splice(target, 0, item);
      return next;
    });

  const selectCls = 'input';

  return (
    <div className="stack" style={{ gap: 'var(--ws-space-4)' }}>
      <div className="row" style={{ justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 'var(--ws-space-3)' }}>
        <h1 style={{ fontSize: 'var(--ws-font-size-lg)', margin: 0 }}>{t('nav.menu')}</h1>
        <div className="row" style={{ gap: 'var(--ws-space-2)', alignItems: 'center' }}>
          {saved && <span style={{ color: 'var(--ws-success, #16a34a)' }}>{t('common.saved')}</span>}
          {save.error && <span style={{ color: 'var(--ws-danger)' }}>{save.error.message}</span>}
          <Button onClick={() => save.mutate(coreItems)} disabled={save.isPending}>
            {save.isPending ? t('common.saving') : t('common.save')}
          </Button>
        </div>
      </div>

      {isLoading ? (
        <Spinner />
      ) : (
        <div className="stack" style={{ gap: 'var(--ws-space-4)' }}>
          <Card>
            <Card.Header>
              <Card.Title>{t('menu.coreSection')}</Card.Title>
              <Card.Description>{t('menu.coreSectionHint')}</Card.Description>
            </Card.Header>
            <Card.Content>
              <div className="stack" style={{ gap: 'var(--ws-space-3)' }}>
                {coreItems.map((item, idx) => (
                  <div
                    key={item.path}
                    style={{
                      display: 'flex',
                      flexDirection: 'column',
                      gap: 'var(--ws-space-3)',
                      padding: 'var(--ws-space-3)',
                      border: '1px solid var(--ws-border)',
                      borderRadius: 'var(--ws-radius-md)',
                    }}
                  >
                    <div className="row" style={{ justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 'var(--ws-space-2)' }}>
                      <div className="stack" style={{ gap: 'var(--ws-space-1)', minWidth: 0 }}>
                        <span style={{ fontWeight: 600 }}>{t(item.label)}</span>
                        <code style={{ fontSize: 'var(--ws-font-size-xs)', color: 'var(--ws-text-subtle)' }}>{item.path}</code>
                      </div>
                      <div className="row" style={{ gap: 'var(--ws-space-1)', alignItems: 'center' }}>
                        <Button variant="secondary" title={t('menu.moveUp')} disabled={idx === 0} onClick={() => moveCore(idx, -1)}>
                          ↑
                        </Button>
                        <Button
                          variant="secondary"
                          title={t('menu.moveDown')}
                          disabled={idx === coreItems.length - 1}
                          onClick={() => moveCore(idx, 1)}
                        >
                          ↓
                        </Button>
                      </div>
                    </div>

                    <div className="row" style={{ gap: 'var(--ws-space-3)', alignItems: 'flex-end', flexWrap: 'wrap' }}>
                      <div className="field" style={{ width: 96 }}>
                        <label>{t('menu.order')}</label>
                        <input
                          className="input"
                          type="number"
                          min={0}
                          value={item.order ?? idx}
                          onChange={(e) => updateCore(idx, { order: Number(e.target.value) })}
                        />
                      </div>
                      <div className="field" style={{ flex: 1, minWidth: 160 }}>
                        <label>{t('menu.section')}</label>
                        <select
                          className={selectCls}
                          value={item.section ?? 'integraciones'}
                          onChange={(e) => updateCore(idx, { section: e.target.value })}
                        >
                          {SECTIONS.map((s) => (
                            <option key={s} value={s}>
                              {t(`admin.sections.${s}`)}
                            </option>
                          ))}
                        </select>
                      </div>
                      <div className="field" style={{ flex: 1, minWidth: 200 }}>
                        <label>{t('menu.permission')}</label>
                        <select
                          className={selectCls}
                          value={item.permissions?.[0] ?? ''}
                          onChange={(e) => updateCore(idx, { permissions: e.target.value ? [e.target.value] : [] })}
                        >
                          <option value="">{t('menu.permissionAll')}</option>
                          {(permissionCatalog ?? []).map((p) => (
                            <option key={p.key} value={p.key}>
                              {p.key}
                            </option>
                          ))}
                        </select>
                      </div>
                      <div className="field" style={{ flex: 1, minWidth: 160 }}>
                        <label>{t('menu.feature')}</label>
                        <select
                          className={selectCls}
                          value={item.feature ?? 'core'}
                          onChange={(e) => updateCore(idx, { feature: e.target.value })}
                        >
                          {FEATURES.map((f) => (
                            <option key={f.key} value={f.key}>
                              {t(f.labelKey)}
                            </option>
                          ))}
                        </select>
                      </div>
                    </div>
                  </div>
                ))}

                {coreItems.length === 0 && <p className="muted" style={{ margin: 0 }}>{t('menu.emptyCore')}</p>}
              </div>
            </Card.Content>
          </Card>

          <Card>
            <Card.Header>
              <Card.Title>{t('menu.pluginSection')}</Card.Title>
              <Card.Description>{t('menu.pluginSectionHint')}</Card.Description>
            </Card.Header>
            <Card.Content>
              <div className="stack" style={{ gap: 'var(--ws-space-2)' }}>
                {pluginItems.length === 0 && <p className="muted" style={{ margin: 0 }}>{t('menu.emptyPlugins')}</p>}
                {pluginItems.map((item) => (
                  <div
                    key={item.path}
                    className="row"
                    style={{
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      flexWrap: 'wrap',
                      gap: 'var(--ws-space-2)',
                      padding: 'var(--ws-space-2) var(--ws-space-3)',
                      border: '1px solid var(--ws-border)',
                      borderRadius: 'var(--ws-radius-md)',
                    }}
                  >
                    <div className="row" style={{ gap: 'var(--ws-space-2)', alignItems: 'center', minWidth: 0 }}>
                      <Badge variant="neutral">{t('menu.pluginBadge')}</Badge>
                      <span style={{ fontWeight: 600 }}>{t(item.label)}</span>
                      <code style={{ fontSize: 'var(--ws-font-size-xs)', color: 'var(--ws-text-subtle)' }}>{item.path}</code>
                    </div>
                    <span style={{ fontSize: 'var(--ws-font-size-xs)', color: 'var(--ws-text-subtle)' }}>
                      {item.section ? t(`admin.sections.${item.section}`) : ''}
                      {item.permissions && item.permissions.length > 0 ? ` · ${item.permissions.join(', ')}` : ''}
                    </span>
                  </div>
                ))}
              </div>
            </Card.Content>
          </Card>
        </div>
      )}
    </div>
  );
}
