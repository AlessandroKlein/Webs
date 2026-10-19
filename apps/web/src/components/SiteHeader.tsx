import { useState } from 'react';
import { Link, NavLink } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { api } from '../lib/api';
import { useAuthStore } from '../lib/auth-store';

interface SiteData {
  name: string;
  tagline: string;
  logoUrl: string;
  logoDarkUrl: string;
}

interface MenuItem {
  label: string;
  path: string;
}

/**
 * Encabezado del sitio público: logo + nombre, menú de navegación (desde la
 * tabla `menu`) y, a la derecha, el acceso de usuario (avatar + menú) o el
 * botón de inicio de sesión. Responsive con menú hamburguesa en móvil.
 */
export function SiteHeader() {
  const { t } = useTranslation();
  const user = useAuthStore((s) => s.user);
  const logout = useAuthStore((s) => s.logout);
  const hasPermission = useAuthStore((s) => s.hasPermission);
  const [menuOpen, setMenuOpen] = useState(false);
  const [userOpen, setUserOpen] = useState(false);

  const { data: site } = useQuery({
    queryKey: ['public-site'],
    queryFn: () => api.get<SiteData>('/api/v1/public/site'),
    retry: 0,
  });
  const { data: menuData } = useQuery({
    queryKey: ['public-menu'],
    queryFn: () => api.get<{ items: MenuItem[] }>('/api/v1/public/menu'),
    retry: 0,
  });

  const siteName = site?.name ?? 'Webs';
  const items = menuData?.items ?? [];
  const initial = (user?.displayName ?? user?.email ?? '?').charAt(0).toUpperCase();

  return (
    <header className="site-header">
      <div className="site-header-inner">
        <Link to="/" className="site-brand" onClick={() => setMenuOpen(false)}>
          {site?.logoUrl ? (
            <img src={site.logoUrl} alt={siteName} className="site-logo" />
          ) : (
            <span className="site-logo-mark"><i className="bi bi-grid-1x2" /></span>
          )}
          <span className="site-name">{siteName}</span>
        </Link>

        <nav className={`site-nav ${menuOpen ? 'open' : ''}`}>
          {items.map((item) => (
            <NavLink
              key={item.path}
              to={item.path}
              className={({ isActive }) => `site-nav-link ${isActive ? 'active' : ''}`}
              onClick={() => setMenuOpen(false)}
            >
              {item.label}
            </NavLink>
          ))}
        </nav>

        <div className="site-actions">
          {user ? (
            <div className="user-menu-wrap">
              <button className="site-user" onClick={() => setUserOpen((o) => !o)} aria-label={t('site.header.userMenu')}>
                <span className="site-avatar">{initial}</span>
                <span className="site-user-name">{user.displayName ?? user.email}</span>
                <i className="bi bi-chevron-down" style={{ fontSize: '0.8em' }} />
              </button>
              {userOpen && (
                <div className="dropdown" style={{ right: 0 }}>
                  <Link to="/account" onClick={() => setUserOpen(false)}>
                    <i className="bi bi-person" /> {t('site.header.myAccount')}
                  </Link>
                  {hasPermission('user.read') && (
                    <Link to="/admin" onClick={() => setUserOpen(false)}>
                      <i className="bi bi-speedometer2" /> {t('site.header.adminPanel')}
                    </Link>
                  )}
                  <button onClick={() => void logout()}>
                    <i className="bi bi-box-arrow-right" /> {t('site.header.logout')}
                  </button>
                </div>
              )}
            </div>
          ) : (
            <Link to="/login" className="btn">{t('site.header.login')}</Link>
          )}
          <button className="site-burger" onClick={() => setMenuOpen((o) => !o)} aria-label={t('site.header.openMenu')}>
            <i className={`bi bi-${menuOpen ? 'x-lg' : 'list'}`} />
          </button>
        </div>
      </div>
    </header>
  );
}
