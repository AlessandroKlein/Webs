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
}

export function AdminLayout() {
  const { t, i18n } = useTranslation();
  const { mode, setMode } = useTheme();
  const user = useAuthStore((s) => s.user);
  const logout = useAuthStore((s) => s.logout);
  const hasPermission = useAuthStore((s) => s.hasPermission);
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
  const pluginNav = (menuData?.items ?? [])
    .filter((item) => typeof item.id === 'string' && item.id !== '')
    .filter((item) => !item.permissions || item.permissions.every((p) => hasPermission(p)))
    .sort((a, b) => (a.order ?? 0) - (b.order ?? 0));

  const coreNav = [
    { to: '/admin', label: t('nav.dashboard'), end: true, perm: null as string | null },
    { to: '/admin/content', label: t('nav.content'), perm: 'content.read' },
    { to: '/admin/pages', label: t('nav.pages'), perm: 'content.read' },
    { to: '/admin/editor', label: t('nav.editor'), perm: 'content.write' },
    { to: '/admin/email', label: t('nav.email'), perm: 'email.read' },
    { to: '/admin/plugins', label: t('nav.plugins'), perm: 'plugin.read' },
    { to: '/admin/plugin-settings', label: t('nav.configPlugins'), perm: 'plugin.read' },
    { to: '/admin/templates', label: t('nav.templates'), perm: 'setting.write' },
    { to: '/admin/branches', label: t('nav.branches'), perm: null },
    { to: '/admin/payments', label: t('nav.payments'), perm: 'user.read' },
    { to: '/admin/users', label: t('nav.users'), perm: 'user.read' },
    { to: '/admin/roles', label: t('nav.roles'), perm: 'role.read' },
    { to: '/admin/settings', label: t('nav.settings'), perm: 'setting.read' },
    { to: '/admin/updates', label: t('nav.updates'), perm: 'setting.read' },
    { to: '/admin/license', label: t('nav.license'), perm: 'license.read' },
    { to: '/admin/appearance', label: t('nav.appearance'), perm: 'theme.read' },
    { to: '/admin/translations', label: t('nav.translations'), perm: 'translation.read' },
    { to: '/admin/audit', label: t('nav.audit'), perm: 'audit.read' },
    { to: '/admin/api-tokens', label: t('nav.api'), perm: null },
    { to: '/admin/menu', label: t('nav.menu'), perm: 'setting.read' },
    { to: '/admin/support', label: t('nav.support'), perm: 'support.read' },
  ].filter((item) => item.perm === null || hasPermission(item.perm));

  // Módulos core del panel que antes figuraban como "Plugins instalados".
  const featureNav = [
    { to: '/admin/blog', label: t('admin.blog.title') },
    { to: '/admin/social', label: t('admin.social.title') },
    { to: '/admin/chat', label: t('admin.chat.title') },
    { to: '/admin/calendar', label: t('admin.calendar.title') },
    { to: '/admin/forms', label: t('admin.forms.title') },
    { to: '/admin/commerce', label: t('admin.commerce.title') },
    { to: '/admin/invoices', label: t('admin.invoices.title') },
    { to: '/admin/analytics', label: t('admin.analytics.title') },
    { to: '/admin/notifications', label: t('admin.notifications.title') },
    { to: '/admin/auth', label: t('nav.registerLogin') },
    { to: '/admin/organizations', label: t('admin.organizations.title') },
    { to: '/admin/inventory', label: t('admin.inventory.title') },
  ];

  return (
    <div className={`admin-layout${collapsed ? ' collapsed' : ''}`}>
      <aside className="sidebar">
        <div className="brand">{collapsed ? 'W' : 'Webs'}</div>
        <nav className="stack">
          {coreNav.map((item) => (
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

          {featureNav.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              title={item.label}
              className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`}
            >
              {collapsed ? item.label.charAt(0) : item.label}
            </NavLink>
          ))}

          {pluginNav.map((item) => (
            <NavLink
              key={item.id ?? item.path}
              to={item.path}
              title={item.label}
              className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`}
            >
              {collapsed ? item.label.charAt(0) : item.label}
            </NavLink>
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
