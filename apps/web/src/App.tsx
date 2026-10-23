import { useEffect, type ReactNode } from 'react';
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Providers } from './app/providers';
import { useAuthStore } from './lib/auth-store';
import { api } from './lib/api';
import { applyRemoteResources, type RemoteI18nPayload } from './lib/i18n';
import { useLocaleStore, type LocaleInfo } from './lib/locale-store';
import './plugins';

import { AdminLayout } from './layouts/AdminLayout';
import { LoginPage } from './features/auth/LoginPage';
import { SetupTwoFactorPage } from './features/auth/SetupTwoFactorPage';
import { VerifyEmailPage } from './features/auth/VerifyEmailPage';
import { ResetPasswordPage } from './features/auth/ResetPasswordPage';
import { DashboardPage } from './features/dashboard/DashboardPage';
import { SettingsPage } from './features/settings/SettingsPage';
import { AppearancePage } from './features/appearance/AppearancePage';
import { PluginsPage } from './features/plugins/PluginsPage';
import { PluginConfigPage } from './features/plugins/PluginConfigPage';
import { TemplatesPage } from './features/templates/TemplatesPage';
import { PaymentsPage } from './features/payments/PaymentsPage';
import { StorePage } from './features/store/StorePage';
import { CheckoutPage } from './features/checkout/CheckoutPage';
import { UsersPage } from './features/users/UsersPage';
import { RolesPage } from './features/roles/RolesPage';
import { ContentPage } from './features/content/ContentPage';
import { EmailPage } from './features/email/EmailPage';
import { TranslationsPage } from './features/translations/TranslationsPage';
import { AuditPage } from './features/audit/AuditPage';
import { ApiTokensPage } from './features/api-tokens/ApiTokensPage';
import { AccountPage } from './features/account/AccountPage';
import { PagesPage } from './features/pages/PagesPage';
import { EditorPage } from './features/editor/EditorPage';
import { OrganizationsPage } from './features/organizations/OrganizationsPage';
import { BranchesPage } from './features/branches/BranchesPage';
import { InventoryPage } from './features/inventory/InventoryPage';
import { BlogPage } from './features/blog/BlogPage';
import { SocialPage } from './features/social/SocialPage';
import { ChatPage } from './features/chat/ChatPage';
import { CalendarPage } from './features/calendar/CalendarPage';
import { FormsPage } from './features/forms/FormsPage';
import { CommercePage } from './features/commerce/CommercePage';
import { InvoicesPage } from './features/invoices/InvoicesPage';
import { InvoiceTemplateEditor } from './features/invoices/InvoiceTemplateEditor';
import { AnalyticsPage } from './features/analytics/AnalyticsPage';
import { NotificationsPage } from './features/notifications/NotificationsPage';
import { AuthConfigPage } from './features/auth-config/AuthConfigPage';
import { PublicHome } from './features/public/PublicHome';
import { PublicPage } from './features/public/PublicPage';
import { BlogListPage } from './features/public/BlogListPage';
import { ClassesPage } from './features/public/ClassesPage';
import { SocialPublicPage } from './features/public/SocialPublicPage';
import { UserDashboardPage } from './features/dashboard/UserDashboardPage';
import { MenuEditorPage } from './features/menu/MenuEditorPage';
import { SupportPage } from './features/support/SupportPage';
import { UpdatesPage } from './features/updates/UpdatesPage';
import { LicensePage } from './features/license/LicensePage';
import { LicenseKeysPage } from './features/license/LicenseKeysPage';
import { GeneratedPage } from './features/generated/GeneratedPage';
import { SiteLayout } from './components/SiteLayout';
import { StaffDashboard } from './features/staff/StaffDashboard';
import { SetupWizard } from './features/setup/SetupWizard';
import { LegalPage } from './features/legal/LegalPage';
import { ErrorPage } from './pages/ErrorPage';

interface SetupStatus {
  installed: boolean;
}

function Splash() {
  return (
    <div className="auth-screen">
      <p className="muted">Cargando…</p>
    </div>
  );
}

function RequireAuth({ children }: { children: ReactNode }) {
  const status = useAuthStore((s) => s.status);
  if (status === 'unauthenticated') return <Navigate to="/login" replace />;
  if (status === 'loading' || status === 'idle') return <Splash />;
  return <>{children}</>;
}

export function App() {
  return (
    <Providers>
      <AppRouter />
    </Providers>
  );
}

function AppRouter() {
  const { data: setup, isLoading } = useQuery({
    queryKey: ['setup-status'],
    queryFn: () => api.get<SetupStatus>('/api/v1/setup/status'),
    retry: 1,
  });

  if (isLoading) return <Splash />;
  if (setup && !setup.installed) return <SetupWizard />;
  return <MainApp />;
}

function MainApp() {
  const bootstrap = useAuthStore((s) => s.bootstrap);

  useEffect(() => {
    void bootstrap();
  }, [bootstrap]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [catalogRes, i18nRes] = await Promise.all([
          api.get<{ locales: LocaleInfo[] }>('/api/v1/public/locales'),
          api.get<RemoteI18nPayload>('/api/v1/public/i18n'),
        ]);
        if (cancelled) return;
        applyRemoteResources(i18nRes);
        useLocaleStore.getState().set({
          catalog: catalogRes.locales,
          enabled: i18nRes.locales,
          defaultLocale: i18nRes.defaultLocale,
        });
      } catch {
        /* sin i18n remota se usan los fallback definidos */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <BrowserRouter>
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route path="/setup-2fa" element={<SetupTwoFactorPage />} />
        <Route path="/verify-email" element={<VerifyEmailPage />} />
        <Route path="/reset-password" element={<ResetPasswordPage />} />
        <Route path="/store" element={<SiteLayout><StorePage /></SiteLayout>} />
        <Route path="/checkout" element={<RequireAuth><SiteLayout><CheckoutPage /></SiteLayout></RequireAuth>} />
        <Route path="/" element={<PublicHome />} />
        <Route path="/blog" element={<BlogListPage />} />
        <Route path="/clases" element={<ClassesPage />} />
        <Route path="/social" element={<SocialPublicPage />} />
        <Route path="/dashboard" element={<RequireAuth><SiteLayout><UserDashboardPage /></SiteLayout></RequireAuth>} />
        <Route path="/staff" element={<RequireAuth><SiteLayout><StaffDashboard /></SiteLayout></RequireAuth>} />
        <Route path="/account" element={<RequireAuth><SiteLayout><AccountPage /></SiteLayout></RequireAuth>} />

        <Route
          path="/admin"
          element={
            <RequireAuth>
              <AdminLayout />
            </RequireAuth>
          }
        >
          <Route index element={<DashboardPage />} />
          <Route path="content" element={<ContentPage />} />
          <Route path="pages" element={<PagesPage />} />
          <Route path="editor" element={<EditorPage />} />
          <Route path="organizations" element={<OrganizationsPage />} />
          <Route path="branches" element={<BranchesPage />} />
          <Route path="inventory" element={<InventoryPage />} />
          <Route path="blog" element={<BlogPage />} />
          <Route path="social" element={<SocialPage />} />
          <Route path="chat" element={<ChatPage />} />
          <Route path="calendar" element={<CalendarPage />} />
          <Route path="forms" element={<FormsPage />} />
          <Route path="commerce" element={<CommercePage />} />
          <Route path="invoices" element={<InvoicesPage />} />
          <Route path="invoices/template" element={<InvoiceTemplateEditor />} />
          <Route path="analytics" element={<AnalyticsPage />} />
          <Route path="notifications" element={<NotificationsPage />} />
          <Route path="auth" element={<AuthConfigPage />} />
          <Route path="email" element={<EmailPage />} />
          <Route path="plugins" element={<PluginsPage />} />
          <Route path="plugins/:pluginId" element={<PluginConfigPage />} />
          <Route path="templates" element={<TemplatesPage />} />
          <Route path="payments" element={<PaymentsPage />} />
          <Route path="users" element={<UsersPage />} />
          <Route path="roles" element={<RolesPage />} />
          <Route path="settings" element={<SettingsPage />} />
          <Route path="appearance" element={<AppearancePage />} />
          <Route path="translations" element={<TranslationsPage />} />
          <Route path="audit" element={<AuditPage />} />
          <Route path="api-tokens" element={<ApiTokensPage />} />
          <Route path="menu" element={<MenuEditorPage />} />
          <Route path="support" element={<SupportPage />} />
          <Route path="updates" element={<UpdatesPage />} />
          <Route path="license" element={<LicensePage />} />
          <Route path="license/keys" element={<LicenseKeysPage />} />
          <Route path="generated" element={<GeneratedPage />} />
        </Route>

        <Route path="/legal/terms" element={<SiteLayout><LegalPage slug="terms" /></SiteLayout>} />
        <Route path="/legal/privacy" element={<SiteLayout><LegalPage slug="privacy" /></SiteLayout>} />
        <Route path="/legal/cookies" element={<SiteLayout><LegalPage slug="cookies" /></SiteLayout>} />
        <Route path="/legal/disclaimer" element={<SiteLayout><LegalPage slug="disclaimer" /></SiteLayout>} />

        <Route path="/:slug" element={<PublicPage />} />
        <Route path="*" element={<ErrorPage />} />
      </Routes>
    </BrowserRouter>
  );
}
