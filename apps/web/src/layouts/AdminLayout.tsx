import { useState } from 'react';
import { NavLink, Outlet, Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useTheme, type ThemeMode } from '@webs/ui';
import { useAuthStore } from '../lib/auth-store';
import { setLocale } from '../lib/i18n';
import { useLocaleStore } from '../lib/locale-store';

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

  const nav = [
    { to: '/admin', label: t('nav.dashboard'), end: true, perm: null as string | null },
    { to: '/admin/content', label: t('nav.content'), perm: 'content.read' },
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
    { to: '/admin/account', label: t('nav.account'), perm: null },
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

          <div className="user-menu-wrap">
            <button className="btn ghost" onClick={() => setMenuOpen((o) => !o)} aria-label="Menú de usuario">
              <i className="bi bi-person-circle" /> <span>{user?.displayName ?? user?.email ?? 'Usuario'}</span>
            </button>
            {menuOpen && (
              <div className="dropdown">
                <Link to="/admin/account" onClick={() => setMenuOpen(false)}>
                  <i className="bi bi-person" /> {t('nav.account')}
                </Link>
                <Link to="/admin/account" onClick={() => setMenuOpen(false)}>
                  <i className="bi bi-gear" /> Preferencias
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
