import { useState } from 'react';
import { Link, NavLink } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
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

interface InboxNotification {
  id: string;
  title: string;
  body: string;
  read: boolean;
  priority: string;
  expiresAt: string | null;
}

const priorityLabel = (p: string) => (p === 'alta' ? 'Alta' : p === 'media' ? 'Media' : 'Normal');
const priorityColor = (p: string) =>
  p === 'alta' ? 'var(--ws-danger)' : p === 'media' ? '#d97706' : 'var(--ws-text-muted)';

/**
 * Encabezado del sitio público: logo + nombre, menú de navegación (desde la
 * tabla `menu`) y, a la derecha, la campana de notificaciones (solo logueado),
 * el acceso de usuario (avatar + menú) o el botón de inicio de sesión.
 * Responsive con menú hamburguesa en móvil.
 */
export function SiteHeader() {
  const { t } = useTranslation();
  const user = useAuthStore((s) => s.user);
  const logout = useAuthStore((s) => s.logout);
  const hasPermission = useAuthStore((s) => s.hasPermission);
  const [menuOpen, setMenuOpen] = useState(false);
  const [userOpen, setUserOpen] = useState(false);
  const [bellOpen, setBellOpen] = useState(false);

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

  const qc = useQueryClient();
  const { data: inbox } = useQuery({
    queryKey: ['site-notifications-inbox'],
    queryFn: () => api.get<InboxNotification[]>('/api/v1/notifications/inbox'),
    enabled: !!user,
    refetchInterval: 30_000,
  });
  const unread = (inbox ?? []).filter((n) => !n.read).length;

  const markRead = useMutation({
    mutationFn: (id: string) => api.patch(`/api/v1/notifications/inbox/${id}`, {}),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['site-notifications-inbox'] }),
  });
  const markAllRead = useMutation({
    mutationFn: () => api.patch('/api/v1/notifications/inbox/read-all', {}),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['site-notifications-inbox'] }),
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
          {user && (
            <div className="user-menu-wrap">
              <button className="site-user" onClick={() => setBellOpen((o) => !o)} title="Notificaciones" aria-label="Notificaciones">
                <i className="bi bi-bell" />
                {unread > 0 && <span className="badge" style={{ background: 'var(--ws-danger)', color: '#fff' }}>{unread}</span>}
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
                  {(inbox ?? []).length === 0 && (
                    <p className="muted" style={{ padding: 'var(--ws-space-2)' }}>{t('admin.notifications.noNotifications')}</p>
                  )}
                </div>
              )}
            </div>
          )}

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
