import { useEffect, useState } from 'react';
import { NavLink, Outlet, Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useTheme, type ThemeMode } from '@webs/ui';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useAuthStore } from '../lib/auth-store';
import { setLocale } from '../lib/i18n';
import { useLocaleStore } from '../lib/locale-store';
import { api } from '../lib/api';
import { useRealtime } from '../lib/realtime';
import { useTenantStore } from '../lib/tenant-store';
import { useLicense } from '../lib/use-license';
import { ScopeSwitcher } from '../components/tenant/ScopeSwitcher';

/** Item de menú devuelto por `GET /menu` (núcleo + plugins). Los items de plugin llevan `id`. */
interface AdminMenuItem {
  id?: string;
  label: string;
  path: string;
  order?: number;
  section?: string;
  icon?: string;
  parent?: string;
  permissions?: string[];
  /** Feature premium que habilita el ítem (t97). `core`/ausente = siempre visible. */
  feature?: string;
}

/** Secciones del menú `/admin` según la taxonomía de `docs/architecture/menu-categorias.md`. */
type SectionKey =
  | 'panel'
  | 'contenido'
  | 'ventas'
  | 'comunicacion'
  | 'comunidad'
  | 'apariencia'
  | 'integraciones'
  | 'configuracion'
  | 'usuarios';

const SECTION_ORDER: SectionKey[] = [
  'panel',
  'contenido',
  'ventas',
  'comunicacion',
  'comunidad',
  'apariencia',
  'integraciones',
  'configuracion',
  'usuarios',
];

const SECTION_KEYS = new Set<string>(SECTION_ORDER);

interface NavItem {
  to: string;
  label: string;
  section: SectionKey;
  perm: string | null;
  end?: boolean;
  feature?: string;
}

/** Ítems de gestión de plugins que se ocultan cuando no hay plugins instalados. */
const PLUGIN_MANAGEMENT_PATHS = new Set(['/admin/plugins']);

export function AdminLayout() {
  const { t, i18n } = useTranslation();
  const { mode, setMode } = useTheme();
  const user = useAuthStore((s) => s.user);
  const logout = useAuthStore((s) => s.logout);
  const hasPermission = useAuthStore((s) => s.hasPermission);
  const { hasFeature } = useLicense();
  const catalog = useLocaleStore((s) => s.catalog);
  const enabledLocales = useLocaleStore((s) => s.enabled);
  const [collapsed, setCollapsed] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [bellOpen, setBellOpen] = useState(false);

  // Carga la estructura de la cadena (casa matriz + sucursales) una vez para
  // habilitar el selector de scope del shell.
  useEffect(() => {
    void useTenantStore.getState().load();
  }, []);

  const { data: inbox } = useQuery({
    queryKey: ['notifications-inbox'],
    queryFn: () =>
      api.get<
        Array<{ id: string; title: string; body: string; read: boolean; priority: string; expiresAt: string | null }>
      >('/api/v1/notifications/inbox'),
    refetchInterval: 30_000,
  });
  const qc = useQueryClient();
  useRealtime((event) => {
    if (event === 'notification.created') {
      void qc.invalidateQueries({ queryKey: ['notifications-inbox'] });
    }
  });
  const unread = (inbox ?? []).filter((n) => !n.read).length;

  const markRead = useMutation({
    mutationFn: (id: string) => api.patch(`/api/v1/notifications/inbox/${id}`, {}),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['notifications-inbox'] }),
  });
  const markAllRead = useMutation({
    mutationFn: () => api.patch('/api/v1/notifications/inbox/read-all', {}),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['notifications-inbox'] }),
  });

  const priorityLabel = (p: string) =>
    p === 'alta' ? t('admin.notifications.high') : p === 'media' ? t('admin.notifications.medium') : t('admin.notifications.normal');
  const priorityColor = (p: string) =>
    p === 'alta' ? 'var(--ws-danger)' : p === 'media' ? '#d97706' : 'var(--ws-muted, #6b7280)';

  // Menú nativo integrado: items de menú declarados por los plugins instalados
  // (sin categoría "Plugins" separada). El endpoint requiere `setting.read`.
  const { data: menuData } = useQuery({
    queryKey: ['admin-menu'],
    queryFn: () => api.get<{ items: AdminMenuItem[] }>('/api/v1/menu'),
    enabled: hasPermission('setting.read'),
    retry: false,
  });
  const { data: pluginsData } = useQuery({
    queryKey: ['admin-plugins'],
    queryFn: () => api.get<{ installed: unknown[] }>('/api/v1/plugins'),
    enabled: hasPermission('plugin.read'),
    retry: false,
  });
  const hasInstalledPlugins = pluginsData ? pluginsData.installed.length > 0 : true;

  const navItems: NavItem[] = [
    { to: '/admin', label: t('nav.dashboard'), section: 'panel', perm: null, end: true },
    { to: '/admin/content', label: t('nav.content'), section: 'contenido', perm: 'content.read' },
    { to: '/admin/pages', label: t('nav.pages'), section: 'contenido', perm: 'content.read' },
    { to: '/admin/editor', label: t('nav.editor'), section: 'contenido', perm: 'content.write' },
    { to: '/admin/payments', label: t('nav.payments'), section: 'ventas', perm: 'user.read' },
    { to: '/admin/email', label: t('nav.email'), section: 'comunicacion', perm: 'email.read' },
    { to: '/admin/support', label: t('nav.support'), section: 'comunicacion', perm: 'support.read' },
    { to: '/admin/appearance', label: t('nav.appearance'), section: 'apariencia', perm: 'theme.read' },
    { to: '/admin/translations', label: t('nav.translations'), section: 'apariencia', perm: 'translation.read' },
    { to: '/admin/menu', label: t('nav.menu'), section: 'apariencia', perm: 'setting.read' },
    { to: '/admin/plugins', label: t('nav.plugins'), section: 'integraciones', perm: 'plugin.read' },
    { to: '/admin/api-tokens', label: t('nav.api'), section: 'integraciones', perm: null },
    { to: '/admin/settings', label: t('nav.settings'), section: 'configuracion', perm: 'setting.read' },
    { to: '/admin/templates', label: t('nav.templates'), section: 'configuracion', perm: 'setting.write' },
    { to: '/admin/branches', label: t('nav.branches'), section: 'configuracion', perm: null },
    { to: '/admin/updates', label: t('nav.updates'), section: 'configuracion', perm: 'setting.read' },
    { to: '/admin/license', label: t('nav.license'), section: 'configuracion', perm: 'license.read' },
    { to: '/admin/license/keys', label: t('nav.licenseKeys'), section: 'configuracion', perm: 'license.read' },
    { to: '/admin/users', label: t('nav.users'), section: 'usuarios', perm: 'user.read' },
    { to: '/admin/roles', label: t('nav.roles'), section: 'usuarios', perm: 'role.read' },
    { to: '/admin/audit', label: t('nav.audit'), section: 'usuarios', perm: 'audit.read' },
  ];

  // Defensa anti-duplicado: los paths que ya están en el menú core no se repiten
  // cuando un plugin declara su ítem en `plugin.json`.
  const corePaths = new Set(navItems.map((i) => i.to));

  const pluginItems: NavItem[] = (menuData?.items ?? [])
    .filter((item) => typeof item.id === 'string' && item.id !== '')
    .filter((item) => !item.permissions || item.permissions.every((p) => hasPermission(p)))
    .filter((item) => hasFeature(item.feature))
    .filter((item) => !corePaths.has(item.path))
    .sort((a, b) => (a.order ?? 0) - (b.order ?? 0))
    .map((item) => ({
      to: item.path,
      label: item.label,
      section: (SECTION_KEYS.has(item.section ?? '') ? item.section : 'integraciones') as SectionKey,
      perm: null,
      feature: item.feature,
    }));

  const sectionLabels: Record<SectionKey, string> = {
    panel: t('admin.sections.panel'),
    contenido: t('admin.sections.contenido'),
    ventas: t('admin.sections.ventas'),
    comunicacion: t('admin.sections.comunicacion'),
    comunidad: t('admin.sections.comunidad'),
    apariencia: t('admin.sections.apariencia'),
    integraciones: t('admin.sections.integraciones'),
    configuracion: t('admin.sections.configuracion'),
    usuarios: t('admin.sections.usuarios'),
  };

  const isVisible = (item: NavItem) =>
    (item.perm === null || hasPermission(item.perm)) &&
    !(PLUGIN_MANAGEMENT_PATHS.has(item.to) && !hasInstalledPlugins);

  const grouped = SECTION_ORDER.map((section) => ({
    section,
    items: [
      ...navItems.filter((i) => i.section === section && isVisible(i)),
      ...pluginItems.filter((i) => i.section === section),
    ],
  })).filter((g) => g.items.length > 0);

  return (
    <div className={`admin-layout${collapsed ? ' collapsed' : ''}`}>
      <aside className="sidebar">
        <div className="brand">{collapsed ? 'W' : 'Webs'}</div>
        <nav className="stack">
          {grouped.map((group) => (
            <div key={group.section}>
              {!collapsed && <div className="nav-section">{sectionLabels[group.section]}</div>}
              {group.items.map((item) => (
                <NavLink
                  key={item.to}
                  to={item.to}
                  end={item.end}
                  title={item.label}
                  className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`}
                >
                  {collapsed ? item.label.charAt(0) : item.label}
                </NavLink>
              ))}
            </div>
          ))}
        </nav>
      </aside>

      <div className="main-col">
        <header className="topbar">
          <div className="row">
            <button className="btn ghost" onClick={() => setCollapsed((c) => !c)} title={t('nav.collapseMenu')} aria-label={t('nav.collapseMenu')}>
              <i className="bi bi-list" />
            </button>
            <select
              className="input"
              style={{ width: 'auto' }}
              value={mode}
              onChange={(e) => setMode(e.target.value as ThemeMode)}
              aria-label={t('theme.label')}
            >
              <option value="light">{t('theme.light')}</option>
              <option value="dark">{t('theme.dark')}</option>
              <option value="system">{t('theme.system')}</option>
            </select>
            <select
              className="input"
              style={{ width: 'auto' }}
              value={i18n.language.split('-')[0]}
              onChange={(e) => void setLocale(e.target.value)}
              aria-label={t('lang.label')}
            >
              {catalog
                .filter((l) => enabledLocales.includes(l.code))
                .map((l) => (
                  <option key={l.code} value={l.code}>
                    {l.nativeLabel}
                  </option>
                ))}
            </select>
          </div>

          <ScopeSwitcher />

          <div className="row">
            <div className="user-menu-wrap">
              <button className="btn ghost" onClick={() => setBellOpen((o) => !o)} title={t('admin.notifications.title')} aria-label={t('admin.notifications.title')}>
                <i className="bi bi-bell" />
                {unread > 0 && <span className="badge" style={{ marginLeft: 4, background: 'var(--ws-danger)', color: '#fff' }}>{unread}</span>}
              </button>
              {bellOpen && (
                <div className="dropdown" style={{ width: 320 }}>
                  <div
                    className="row"
                    style={{ justifyContent: 'space-between', padding: 'var(--ws-space-2)', borderBottom: '1px solid var(--ws-border)' }}
                  >
                    <strong>{t('admin.notifications.title')}</strong>
                    {unread > 0 && (
                      <button className="btn ghost" onClick={() => markAllRead.mutate()} disabled={markAllRead.isPending}>
                        <i className="bi bi-check2-all" /> {t('common.markAllRead')}
                      </button>
                    )}
                  </div>
                  {(inbox ?? []).slice(0, 20).map((n) => (
                    <div
                      key={n.id}
                      style={{
                        padding: 'var(--ws-space-2)',
                        borderBottom: '1px solid var(--ws-border)',
                        opacity: n.read ? 0.6 : 1,
                      }}
                    >
                      <div className="row" style={{ justifyContent: 'space-between', alignItems: 'flex-start' }}>
                        <div className="stack" style={{ gap: 2 }}>
                          <strong style={{ fontWeight: n.read ? 400 : 600 }}>{n.title}</strong>
                          <span className="muted" style={{ fontSize: 'var(--ws-font-size-sm)' }}>
                            <i className="bi bi-flag-fill" style={{ color: priorityColor(n.priority ?? 'normal') }} />{' '}
                            {priorityLabel(n.priority ?? 'normal')}
                            {n.expiresAt ? ` · ${t('common.expires')} ${new Date(n.expiresAt).toLocaleDateString()}` : ''}
                          </span>
                        </div>
                        {!n.read && (
                          <button
                            className="btn ghost"
                            title={t('common.markRead')}
                            onClick={() => markRead.mutate(n.id)}
                            disabled={markRead.isPending}
                          >
                            <i className="bi bi-check2" />
                          </button>
                        )}
                      </div>
                      <p className="muted" style={{ margin: 0 }}>{n.body}</p>
                    </div>
                  ))}
                  {(inbox ?? []).length === 0 && <p className="muted" style={{ padding: 'var(--ws-space-2)' }}>{t('admin.notifications.noNotifications')}</p>}
                </div>
              )}
            </div>
            <Link to="/" className="btn ghost" title={t('nav.viewSite')} aria-label={t('nav.viewSite')}>
              <i className="bi bi-box-arrow-up-right" /> <span>{t('nav.viewSite')}</span>
            </Link>
            <div className="user-menu-wrap">
              <button className="btn ghost" onClick={() => setMenuOpen((o) => !o)} aria-label={t('site.header.userMenu')}>
                <i className="bi bi-person-circle" /> <span>{user?.displayName ?? user?.email ?? t('common.user')}</span>
              </button>
              {menuOpen && (
                <div className="dropdown">
                  <Link to="/account" onClick={() => setMenuOpen(false)}>
                    <i className="bi bi-person" /> {t('nav.account')}
                  </Link>
                  <Link to="/" onClick={() => setMenuOpen(false)}>
                    <i className="bi bi-box-arrow-up-right" /> {t('nav.viewSite')}
                  </Link>
                  {hasPermission('user.read') && (
                    <Link to="/admin" onClick={() => setMenuOpen(false)}>
                      <i className="bi bi-speedometer2" /> {t('site.header.adminPanel')}
                    </Link>
                  )}
                  <button onClick={() => void logout()}>
                    <i className="bi bi-box-arrow-right" /> {t('auth.logout')}
                  </button>
                </div>
              )}
            </div>
          </div>
        </header>

        <main className="content">
          <Outlet />
        </main>

        <footer className="footer">
          <span>Webs · {new Date().getFullYear()}</span>
        </footer>
      </div>
    </div>
  );
}
