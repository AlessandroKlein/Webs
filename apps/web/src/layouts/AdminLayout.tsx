import { useState } from 'react';
import { NavLink, Outlet, Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useTheme, type ThemeMode } from '@webs/ui';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useAuthStore } from '../lib/auth-store';
import { setLocale } from '../lib/i18n';
import { useLocaleStore } from '../lib/locale-store';
import { api } from '../lib/api';
import { useRealtime } from '../lib/realtime';

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
  const [blocksOpen, setBlocksOpen] = useState(true);

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
    p === 'alta' ? 'Alta' : p === 'media' ? 'Media' : 'Normal';
  const priorityColor = (p: string) =>
    p === 'alta' ? 'var(--ws-danger)' : p === 'media' ? '#d97706' : 'var(--ws-muted, #6b7280)';

  const coreNav = [
    { to: '/admin', label: t('nav.dashboard'), end: true, perm: null as string | null },
    { to: '/admin/content', label: t('nav.content'), perm: 'content.read' },
    { to: '/admin/pages', label: t('nav.pages'), perm: 'content.read' },
    { to: '/admin/email', label: t('nav.email'), perm: 'email.read' },
    { to: '/admin/blocks', label: t('nav.blocks'), perm: 'block.read' },
    { to: '/admin/templates', label: t('nav.templates'), perm: 'setting.write' },
    { to: '/admin/payments', label: t('nav.payments'), perm: 'user.read' },
    { to: '/admin/users', label: t('nav.users'), perm: 'user.read' },
    { to: '/admin/roles', label: t('nav.roles'), perm: 'role.read' },
    { to: '/admin/settings', label: t('nav.settings'), perm: 'setting.read' },
    { to: '/admin/appearance', label: t('nav.appearance'), perm: 'theme.read' },
    { to: '/admin/translations', label: t('nav.translations'), perm: 'translation.read' },
    { to: '/admin/audit', label: t('nav.audit'), perm: 'audit.read' },
    { to: '/admin/api-tokens', label: t('nav.api'), perm: null },
  ].filter((item) => item.perm === null || hasPermission(item.perm));

  const blockNav = [
    { to: '/admin/blog', label: t('admin.blog.title') },
    { to: '/admin/social', label: t('admin.social.title') },
    { to: '/admin/chat', label: t('admin.chat.title') },
    { to: '/admin/calendar', label: t('admin.calendar.title') },
    { to: '/admin/forms', label: t('admin.forms.title') },
    { to: '/admin/commerce', label: t('admin.commerce.title') },
    { to: '/admin/invoices', label: t('admin.invoices.title') },
    { to: '/admin/analytics', label: t('admin.analytics.title') },
    { to: '/admin/notifications', label: t('admin.notifications.title') },
    { to: '/admin/auth', label: 'Registro/Login' },
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

          {collapsed ? (
            blockNav.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                title={item.label}
                className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`}
              >
                {item.label.charAt(0)}
              </NavLink>
            ))
          ) : (
            <div>
              <button
                type="button"
                className="nav-link"
                style={{ width: '100%', textAlign: 'left', background: 'none', border: 'none', cursor: 'pointer' }}
                onClick={() => setBlocksOpen((o) => !o)}
                title={t('nav.installedBlocks')}
              >
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                  <i className={`bi bi-chevron-${blocksOpen ? 'down' : 'right'}`} style={{ fontSize: '0.8em' }} />
                  {t('nav.installedBlocks')}
                </span>
              </button>
              {blocksOpen && (
                <div className="stack" style={{ gap: 'var(--ws-space-1)', paddingLeft: 'var(--ws-space-4)' }}>
                  {blockNav.map((item) => (
                    <NavLink
                      key={item.to}
                      to={item.to}
                      title={item.label}
                      className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`}
                    >
                      {item.label}
                    </NavLink>
                  ))}
                  <NavLink
                    to="/admin/block-settings"
                    title="Configuración de bloques"
                    className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`}
                  >
                    Configuración de bloques
                  </NavLink>
                </div>
              )}
            </div>
          )}
        </nav>
      </aside>

      <div className="main-col">
        <header className="topbar">
          <div className="row">
            <button className="btn ghost" onClick={() => setCollapsed((c) => !c)} title="Colapsar menú" aria-label="Colapsar menú">
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

          <div className="row">
            <div className="user-menu-wrap">
              <button className="btn ghost" onClick={() => setBellOpen((o) => !o)} title="Notificaciones" aria-label="Notificaciones">
                <i className="bi bi-bell" />
                {unread > 0 && <span className="badge" style={{ marginLeft: 4, background: 'var(--ws-danger)', color: '#fff' }}>{unread}</span>}
              </button>
              {bellOpen && (
                <div className="dropdown" style={{ width: 320 }}>
                  <div
                    className="row"
                    style={{ justifyContent: 'space-between', padding: 'var(--ws-space-2)', borderBottom: '1px solid var(--ws-border)' }}
                  >
                    <strong>Notificaciones</strong>
                    {unread > 0 && (
                      <button className="btn ghost" onClick={() => markAllRead.mutate()} disabled={markAllRead.isPending}>
                        <i className="bi bi-check2-all" /> Marcar todas
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
                            {n.expiresAt ? ` · vence ${new Date(n.expiresAt).toLocaleDateString()}` : ''}
                          </span>
                        </div>
                        {!n.read && (
                          <button
                            className="btn ghost"
                            title="Marcar como leída"
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
                  {(inbox ?? []).length === 0 && <p className="muted" style={{ padding: 'var(--ws-space-2)' }}>Sin notificaciones</p>}
                </div>
              )}
            </div>
            <Link to="/" className="btn ghost" title="Ver sitio" aria-label="Ver sitio">
              <i className="bi bi-box-arrow-up-right" /> <span>Ver sitio</span>
            </Link>
            <div className="user-menu-wrap">
              <button className="btn ghost" onClick={() => setMenuOpen((o) => !o)} aria-label="Menú de usuario">
                <i className="bi bi-person-circle" /> <span>{user?.displayName ?? user?.email ?? 'Usuario'}</span>
              </button>
              {menuOpen && (
                <div className="dropdown">
                  <Link to="/account" onClick={() => setMenuOpen(false)}>
                    <i className="bi bi-person" /> {t('nav.account')}
                  </Link>
                  <Link to="/" onClick={() => setMenuOpen(false)}>
                    <i className="bi bi-box-arrow-up-right" /> Ver sitio
                  </Link>
                  {hasPermission('user.read') && (
                    <Link to="/admin" onClick={() => setMenuOpen(false)}>
                      <i className="bi bi-speedometer2" /> Panel admin
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
