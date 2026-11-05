import { useCallback, useEffect, useId, useRef, useState } from 'react';
import { NavLink, Outlet, Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useAuthStore } from '../lib/auth-store';
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
  icon?: string;
  /** `to` del ítem padre (anidamiento). */
  parent?: string;
  /** `pluginId` que debe estar instalado para mostrar el ítem (páginas de plugins). */
  requiresPlugin?: string;
}

interface NavNode {
  item: NavItem;
  children: NavNode[];
}

/** Ítems de gestión de plugins que se ocultan cuando no hay plugins instalados. */
const PLUGIN_MANAGEMENT_PATHS = new Set(['/admin/plugins']);

const LS_COLLAPSED = 'admin.sidebar.collapsed';
const LS_EXPANDED = 'admin.menu.expanded';

/** Lectura defensiva de localStorage: un valor corrupto o ausente no rompe el render. */
function readLS<T>(key: string, fallback: T): T {
  try {
    if (typeof window === 'undefined') return fallback;
    const raw = window.localStorage.getItem(key);
    if (raw == null) return fallback;
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

/** Normaliza un nombre de icono a la clase bootstrap-icons (`bi bi-*`). */
function iconClass(name?: string, fallback = 'puzzle'): string {
  const s = (name ?? fallback).trim().replace(/^bi\s+/, '').replace(/^bi-/, '');
  return `bi bi-${s || fallback}`;
}

/** Construye el árbol de navegación a partir de la lista plana ya filtrada por permisos. */
function buildTree(items: NavItem[]): NavNode[] {
  const byTo = new Map(items.map((i) => [i.to, i]));
  const childrenByParent = new Map<string, NavItem[]>();
  const roots: NavItem[] = [];
  for (const item of items) {
    const p = item.parent;
    if (p && byTo.has(p)) {
      const arr = childrenByParent.get(p);
      if (arr) arr.push(item);
      else childrenByParent.set(p, [item]);
    } else {
      roots.push(item);
    }
  }
  const make = (item: NavItem): NavNode => ({
    item,
    children: (childrenByParent.get(item.to) ?? []).map(make),
  });
  return roots.map(make);
}

interface SidebarItemProps {
  node: NavNode;
  collapsed: boolean;
  expandedSet: Set<string>;
  onToggle: (to: string) => void;
  onNavigate: () => void;
  depth: number;
}

function SidebarItem({ node, collapsed, expandedSet, onToggle, onNavigate, depth }: SidebarItemProps) {
  const { t } = useTranslation();
  const submenuId = useId();
  const { item, children } = node;
  const hasChildren = children.length > 0;
  const isExpanded = hasChildren && expandedSet.has(item.to);
  const indent = depth > 0 && !collapsed ? { paddingLeft: `calc(var(--ws-space-3) + ${depth * 14}px)` } : undefined;

  const link = (
    <NavLink
      to={item.to}
      end={item.end}
      title={item.label}
      className={({ isActive }) => `nav-link${hasChildren && !collapsed ? ' nav-link-parent' : ''} ${isActive ? 'active' : ''}`}
      onClick={onNavigate}
      style={indent}
    >
      <i className={iconClass(item.icon)} aria-hidden="true" />
      {!collapsed && <span className="nav-text">{item.label}</span>}
    </NavLink>
  );

  // En modo colapsado los padres se muestran como hoja (sólo icono + tooltip);
  // los submenús sólo se despliegan con la barra expandida.
  if (collapsed || !hasChildren) return link;

  return (
    <div className="nav-submenu">
      <div className="nav-submenu-head">
        {link}
        <button
          type="button"
          className="nav-toggle"
          aria-expanded={isExpanded}
          aria-controls={submenuId}
          aria-label={t('nav.toggleSubmenu')}
          onClick={() => onToggle(item.to)}
        >
          <i className={`bi ${isExpanded ? 'bi-chevron-down' : 'bi-chevron-right'}`} aria-hidden="true" />
        </button>
      </div>
      {isExpanded && (
        <div id={submenuId} className="nav-submenu-list">
          {children.map((child) => (
            <SidebarItem
              key={child.item.to}
              node={child}
              collapsed={collapsed}
              expandedSet={expandedSet}
              onToggle={onToggle}
              onNavigate={onNavigate}
              depth={depth + 1}
            />
          ))}
        </div>
      )}
    </div>
  );
}

export function AdminLayout() {
  const { t } = useTranslation();
  const user = useAuthStore((s) => s.user);
  const logout = useAuthStore((s) => s.logout);
  const hasPermission = useAuthStore((s) => s.hasPermission);
  const { hasFeature } = useLicense();
  const [collapsed, setCollapsed] = useState<boolean>(() => readLS<boolean>(LS_COLLAPSED, false));
  const [menuOpen, setMenuOpen] = useState(false);
  const [bellOpen, setBellOpen] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [expanded, setExpanded] = useState<Set<string>>(() => {
    const raw = readLS<string[]>(LS_EXPANDED, []);
    return new Set(Array.isArray(raw) ? raw : []);
  });
  const searchRef = useRef<HTMLInputElement>(null);
  const mobileMenuBtnRef = useRef<HTMLButtonElement>(null);

  // En móvil, el drawer se abre siempre expandido aunque la preferencia de
  // escritorio esté en "colapsado" (ALTO-2).
  const isCollapsed = collapsed && !drawerOpen;

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
    queryFn: () => api.get<{ installed: Array<{ pluginId?: string }> }>('/api/v1/plugins'),
    enabled: hasPermission('plugin.read'),
    retry: false,
  });
  const hasInstalledPlugins = pluginsData ? pluginsData.installed.length > 0 : true;
  const installedPluginIds = new Set(
    (pluginsData?.installed ?? [])
      .map((p) => p.pluginId)
      .filter((id): id is string => typeof id === 'string'),
  );

  const navItems: NavItem[] = [
    // panel
    { to: '/admin', label: t('nav.dashboard'), section: 'panel', perm: null, icon: 'speedometer2', end: true },
    { to: '/admin/analytics', label: t('nav.analytics'), section: 'panel', perm: null, icon: 'graph-up', requiresPlugin: 'analytics' },
    // contenido
    { to: '/admin/content', label: t('nav.content'), section: 'contenido', perm: 'content.read', icon: 'collection' },
    { to: '/admin/pages', label: t('nav.pages'), section: 'contenido', perm: 'content.read', icon: 'file-earmark-text' },
    { to: '/admin/editor', label: t('nav.editor'), section: 'contenido', perm: 'content.write', icon: 'pencil-square' },
    { to: '/admin/blog', label: t('nav.blog'), section: 'contenido', perm: null, icon: 'journal-text', requiresPlugin: 'blog' },
    { to: '/admin/forms', label: t('nav.forms'), section: 'contenido', perm: null, icon: 'input-cursor-text', requiresPlugin: 'formularios' },
    // ventas
    { to: '/admin/payments', label: t('nav.payments'), section: 'ventas', perm: 'user.read', icon: 'credit-card' },
    { to: '/admin/commerce', label: t('nav.commerce'), section: 'ventas', perm: null, icon: 'bag', requiresPlugin: 'ecommerce' },
    { to: '/admin/invoices', label: t('nav.invoices'), section: 'ventas', perm: null, icon: 'receipt', requiresPlugin: 'facturacion' },
    { to: '/admin/invoices/template', label: t('nav.invoiceTemplate'), section: 'ventas', perm: null, icon: 'layout-text-window-reverse', parent: '/admin/invoices', requiresPlugin: 'facturacion' },
    { to: '/admin/inventory', label: t('nav.inventory'), section: 'ventas', perm: 'inventory.read', icon: 'box-seam' },
    // comunicacion
    { to: '/admin/email', label: t('nav.email'), section: 'comunicacion', perm: 'email.read', icon: 'envelope' },
    { to: '/admin/notifications', label: t('nav.notifications'), section: 'comunicacion', perm: null, icon: 'bell', requiresPlugin: 'notificaciones' },
    { to: '/admin/support', label: t('nav.support'), section: 'comunicacion', perm: 'support.read', icon: 'headset' },
    // comunidad
    { to: '/admin/social', label: t('nav.social'), section: 'comunidad', perm: null, icon: 'people', requiresPlugin: 'social' },
    { to: '/admin/calendar', label: t('nav.calendar'), section: 'comunidad', perm: null, icon: 'calendar3', requiresPlugin: 'calendario' },
    // apariencia
    { to: '/admin/appearance', label: t('nav.appearance'), section: 'apariencia', perm: 'theme.read', icon: 'palette' },
    { to: '/admin/translations', label: t('nav.translations'), section: 'apariencia', perm: 'translation.read', icon: 'translate' },
    { to: '/admin/menu', label: t('nav.menu'), section: 'apariencia', perm: 'setting.read', icon: 'list-nested' },
    // integraciones
    { to: '/admin/plugins', label: t('nav.plugins'), section: 'integraciones', perm: 'plugin.read', icon: 'puzzle' },
    { to: '/admin/generated', label: t('nav.generated'), section: 'integraciones', perm: 'generated.read', feature: 'generator', icon: 'lightning' },
    { to: '/admin/invernadero', label: t('nav.invernadero'), section: 'integraciones', perm: 'iot.read', icon: 'flower1' },
    { to: '/admin/sema', label: t('nav.sema'), section: 'integraciones', perm: 'iot.read', icon: 'broadcast' },
    { to: '/admin/api-tokens', label: t('nav.api'), section: 'integraciones', perm: null, icon: 'key' },
    { to: '/admin/auth', label: t('nav.auth'), section: 'integraciones', perm: null, icon: 'shield-lock', requiresPlugin: 'register' },
    // configuracion
    { to: '/admin/settings', label: t('nav.settings'), section: 'configuracion', perm: 'setting.read', icon: 'gear' },
    { to: '/admin/templates', label: t('nav.templates'), section: 'configuracion', perm: 'setting.write', icon: 'files' },
    { to: '/admin/branches', label: t('nav.branches'), section: 'configuracion', perm: null, icon: 'diagram-3' },
    { to: '/admin/organizations', label: t('nav.organizations'), section: 'configuracion', perm: null, icon: 'building', requiresPlugin: 'organizaciones' },
    { to: '/admin/updates', label: t('nav.updates'), section: 'configuracion', perm: 'setting.read', icon: 'arrow-repeat' },
    { to: '/admin/scaling', label: t('nav.scaling'), section: 'configuracion', perm: 'scaling.read', icon: 'hdd-stack' },
    { to: '/admin/license', label: t('nav.license'), section: 'configuracion', perm: 'license.read', icon: 'patch-check' },
    { to: '/admin/license/keys', label: t('nav.licenseKeys'), section: 'configuracion', perm: 'license.read', icon: 'key-fill', parent: '/admin/license' },
    // usuarios
    { to: '/admin/users', label: t('nav.users'), section: 'usuarios', perm: 'user.read', icon: 'person' },
    { to: '/admin/roles', label: t('nav.roles'), section: 'usuarios', perm: 'role.read', icon: 'person-badge', parent: '/admin/users' },
    { to: '/admin/audit', label: t('nav.audit'), section: 'usuarios', perm: 'audit.read', icon: 'shield-check' },
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
      icon: item.icon,
      parent: item.parent,
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
    hasFeature(item.feature) &&
    !(PLUGIN_MANAGEMENT_PATHS.has(item.to) && !hasInstalledPlugins) &&
    (item.requiresPlugin ? installedPluginIds.has(item.requiresPlugin) : true);

  const visibleItems = [...navItems, ...pluginItems].filter(isVisible);
  const rootNodes = buildTree(visibleItems);

  const grouped = SECTION_ORDER.map((section) => ({
    section,
    nodes: rootNodes.filter((n) => n.item.section === section),
  })).filter((g) => g.nodes.length > 0);

  const q = searchQuery.trim().toLowerCase();
  const searchResults = q ? visibleItems.filter((i) => i.label.toLowerCase().includes(q)) : [];

  const toggleCollapsed = () => {
    setCollapsed((c) => {
      const next = !c;
      try {
        window.localStorage.setItem(LS_COLLAPSED, JSON.stringify(next));
      } catch {
        /* ignore */
      }
      return next;
    });
  };

  const toggleExpanded = (to: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(to)) next.delete(to);
      else next.add(to);
      try {
        window.localStorage.setItem(LS_EXPANDED, JSON.stringify([...next]));
      } catch {
        /* ignore */
      }
      return next;
    });
  };

  const openDrawer = () => setDrawerOpen(true);
  const closeDrawer = useCallback(() => setDrawerOpen(false), []);

  // Atajo "/" para buscar y "Escape" para cerrar el drawer móvil.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = document.activeElement;
      const typing =
        el instanceof HTMLElement &&
        (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.tagName === 'SELECT' || el.isContentEditable);
      if (e.key === '/' && !typing) {
        if (document.querySelector('dialog[open]')) return;
        e.preventDefault();
        searchRef.current?.focus();
      } else if (e.key === 'Escape' && drawerOpen) {
        setDrawerOpen(false);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [drawerOpen]);

  // Enfoque inicial al abrir el drawer y retorno de foco al cerrarlo.
  useEffect(() => {
    if (drawerOpen) searchRef.current?.focus();
  }, [drawerOpen]);

  // Scroll-lock del body mientras el drawer móvil está abierto (MEDIO-3).
  useEffect(() => {
    if (!drawerOpen) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prev;
    };
  }, [drawerOpen]);

  const prevDrawerOpen = useRef(false);
  useEffect(() => {
    if (prevDrawerOpen.current && !drawerOpen) mobileMenuBtnRef.current?.focus();
    prevDrawerOpen.current = drawerOpen;
  }, [drawerOpen]);

  return (
    <div className={`admin-layout${isCollapsed ? ' collapsed' : ''}`}>
      <aside
        className={`sidebar${drawerOpen ? ' open' : ''}`}
        role={drawerOpen ? 'dialog' : undefined}
        aria-modal={drawerOpen ? true : undefined}
        aria-label={drawerOpen ? t('nav.primary') : undefined}
      >
        <div className="brand">{isCollapsed ? 'W' : 'Webs'}</div>

        <button className="btn ghost sidebar-close" onClick={closeDrawer} aria-label={t('common.close')}>
          <i className="bi bi-x-lg" aria-hidden="true" />
        </button>

        <div className="nav-search">
          <i className="bi bi-search" aria-hidden="true" />
          <input
            ref={searchRef}
            type="search"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder={t('nav.searchMenu')}
            aria-label={t('nav.searchMenu')}
          />
        </div>

        <nav className="stack admin-nav" aria-label={t('nav.primary')}>
          {q ? (
            searchResults.length > 0 ? (
              searchResults.map((item) => (
                <NavLink
                  key={item.to}
                  to={item.to}
                  end={item.end}
                  title={item.label}
                  className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`}
                  onClick={closeDrawer}
                >
                  <i className={iconClass(item.icon)} aria-hidden="true" />
                  {!isCollapsed && <span className="nav-text">{item.label}</span>}
                </NavLink>
              ))
            ) : (
              <p className="muted" style={{ padding: 'var(--ws-space-2) var(--ws-space-3)' }}>
                {t('common.noResults')}
              </p>
            )
          ) : (
            grouped.map((group) => (
              <div key={group.section}>
                {!isCollapsed && <div className="nav-section">{sectionLabels[group.section]}</div>}
                {group.nodes.map((node) => (
                  <SidebarItem
                    key={node.item.to}
                    node={node}
                    collapsed={isCollapsed}
                    expandedSet={expanded}
                    onToggle={toggleExpanded}
                    onNavigate={closeDrawer}
                    depth={0}
                  />
                ))}
              </div>
            ))
          )}
        </nav>
      </aside>

      {drawerOpen && <div className="sidebar-backdrop" onClick={closeDrawer} aria-hidden="true" />}

      <div className="main-col" inert={drawerOpen}>
        <header className="topbar">
          <div className="row">
            <button
              className="btn ghost mobile-menu-btn"
              ref={mobileMenuBtnRef}
              onClick={openDrawer}
              title={t('nav.openMenu')}
              aria-label={t('nav.openMenu')}
              aria-expanded={drawerOpen}
            >
              <i className="bi bi-list" aria-hidden="true" />
            </button>
            <button
              className="btn ghost desktop-collapse-btn"
              onClick={toggleCollapsed}
              title={t('nav.collapseMenu')}
              aria-label={t('nav.collapseMenu')}
              aria-pressed={collapsed}
            >
              <i className="bi bi-list" aria-hidden="true" />
            </button>
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
