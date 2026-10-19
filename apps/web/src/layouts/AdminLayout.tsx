import { useState } from 'react';
import { NavLink, Outlet, Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useTheme, type ThemeMode } from '@webs/ui';
import { useQuery } from '@tanstack/react-query';
import { useAuthStore } from '../lib/auth-store';
import { setLocale } from '../lib/i18n';
import { useLocaleStore } from '../lib/locale-store';
import { api } from '../lib/api';

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
  const [openCategories, setOpenCategories] = useState<Record<string, boolean>>({});

  const { data: blocksData } = useQuery({
    queryKey: ['blocks'],
    queryFn: () => api.get<{ installed: Array<{ blockId: string; name: string; enabled: boolean }> }>('/api/v1/blocks'),
  });
  const installedBlocks = (blocksData?.installed ?? []).filter((b) => b.enabled);

  const { data: catalogData } = useQuery({
    queryKey: ['blocks-catalog'],
    queryFn: () =>
      api.get<{ local: Array<{ id: string; category?: string }>; remote: Array<{ id: string; category?: string }> }>(
        '/api/v1/blocks/catalog',
      ),
  });

  const categoryMap = new Map<string, string>();
  for (const item of [...(catalogData?.local ?? []), ...(catalogData?.remote ?? [])]) {
    if (item.category) categoryMap.set(item.id, item.category);
  }
  const groupedBlocks = installedBlocks.reduce<Record<string, Array<{ blockId: string; name: string }>>>((acc, b) => {
    const cat = categoryMap.get(b.blockId) ?? 'Otros';
    (acc[cat] ??= []).push({ blockId: b.blockId, name: b.name });
    return acc;
  }, {});
  const toggleCategory = (cat: string) =>
    setOpenCategories((c) => ({ ...c, [cat]: !(c[cat] ?? true) }));

  const { data: inbox } = useQuery({
    queryKey: ['notifications-inbox'],
    queryFn: () => api.get<Array<{ id: string; title: string; body: string; read: boolean }>>('/api/v1/notifications/inbox'),
    refetchInterval: 30_000,
  });
  const unread = (inbox ?? []).filter((n) => !n.read).length;

  const nav = [
    { to: '/admin', label: t('nav.dashboard'), end: true, perm: null as string | null },
    { to: '/admin/content', label: t('nav.content'), perm: 'content.read' },
    { to: '/admin/pages', label: 'Páginas', perm: 'content.read' },
    { to: '/admin/organizations', label: 'Organizaciones', perm: null },
    { to: '/admin/inventory', label: 'Inventario', perm: null },
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

  return (
    <div className={`admin-layout${collapsed ? ' collapsed' : ''}`}>
      <aside className="sidebar">
        <div className="brand">{collapsed ? 'W' : 'Webs'}</div>
        <nav className="stack">
          {nav.map((item) => (
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
          {installedBlocks.length > 0 && !collapsed && (
            <>
              <div className="muted" style={{ fontSize: 'var(--ws-font-size-sm)', marginTop: 'var(--ws-space-3)', paddingInline: 'var(--ws-space-3)' }}>Bloques instalados</div>
              {Object.entries(groupedBlocks)
                .sort(([a], [b]) => a.localeCompare(b))
                .map(([category, blocks]) => {
                  const isOpen = openCategories[category] ?? true;
                  return (
                    <div key={category}>
                      <button
                        type="button"
                        className="nav-link"
                        style={{ width: '100%', textAlign: 'left', background: 'none', border: 'none', cursor: 'pointer', textTransform: 'capitalize' }}
                        onClick={() => toggleCategory(category)}
                        title={category}
                      >
                        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                          <i className={`bi bi-chevron-${isOpen ? 'down' : 'right'}`} style={{ fontSize: '0.8em' }} />
                          {category}
                        </span>
                      </button>
                      {isOpen &&
                        [...blocks]
                          .sort((a, b) => a.name.localeCompare(b.name))
                          .map((b) => (
                            <NavLink
                              key={b.blockId}
                              to={`/admin/blocks/${b.blockId}`}
                              className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`}
                              style={{ paddingLeft: 'var(--ws-space-7)' }}
                            >
                              {b.name}
                            </NavLink>
                          ))}
                    </div>
                  );
                })}
            </>
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
                <div className="dropdown">
                  {(inbox ?? []).slice(0, 20).map((n) => (
                    <div key={n.id} style={{ padding: 'var(--ws-space-2)', borderBottom: '1px solid var(--ws-border)' }}>
                      <strong style={{ fontWeight: n.read ? 400 : 600 }}>{n.title}</strong>
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
