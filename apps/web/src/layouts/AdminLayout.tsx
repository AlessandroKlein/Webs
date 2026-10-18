import { NavLink, Outlet } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useTheme, type ThemeMode } from '@webs/ui';
import { useAuthStore } from '../lib/auth-store';
import { setLocale } from '../lib/i18n';

export function AdminLayout() {
  const { t, i18n } = useTranslation();
  const { mode, setMode } = useTheme();
  const user = useAuthStore((s) => s.user);
  const logout = useAuthStore((s) => s.logout);
  const hasPermission = useAuthStore((s) => s.hasPermission);

  const nav = [
    { to: '/', label: t('nav.dashboard'), end: true, perm: null as string | null },
    { to: '/content', label: t('nav.content'), perm: 'content.read' },
    { to: '/blocks', label: t('nav.blocks'), perm: 'block.read' },
    { to: '/users', label: t('nav.users'), perm: 'user.read' },
    { to: '/roles', label: t('nav.roles'), perm: 'role.read' },
    { to: '/settings', label: t('nav.settings'), perm: 'setting.read' },
    { to: '/appearance', label: t('nav.appearance'), perm: 'theme.read' },
    { to: '/translations', label: t('nav.translations'), perm: 'translation.read' },
    { to: '/audit', label: t('nav.audit'), perm: 'audit.read' },
  ].filter((item) => item.perm === null || hasPermission(item.perm));

  return (
    <div className="admin-layout">
      <aside className="sidebar">
        <div className="brand">Webs</div>
        <nav className="stack">
          {nav.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.end}
              className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`}
            >
              {item.label}
            </NavLink>
          ))}
        </nav>
      </aside>

      <div style={{ display: 'flex', flexDirection: 'column', flex: 1, minWidth: 0 }}>
        <header className="topbar">
          <div className="row">
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
              <option value="es">{t('lang.es')}</option>
              <option value="en">{t('lang.en')}</option>
            </select>
          </div>

          <div className="row">
            <span className="muted">{user?.email}</span>
            <button className="btn ghost" onClick={() => void logout()}>
              {t('auth.logout')}
            </button>
          </div>
        </header>

        <main className="content">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
