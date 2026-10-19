import { useEffect, type ReactNode } from 'react';
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Providers } from './app/providers';
import { useAuthStore } from './lib/auth-store';
import { api } from './lib/api';
import { applyRemoteResources, type RemoteI18nPayload } from './lib/i18n';
import { useLocaleStore, type LocaleInfo } from './lib/locale-store';
import './blocks';

import { AdminLayout } from './layouts/AdminLayout';
import { LoginPage } from './features/auth/LoginPage';
import { SetupTwoFactorPage } from './features/auth/SetupTwoFactorPage';
import { VerifyEmailPage } from './features/auth/VerifyEmailPage';
import { ResetPasswordPage } from './features/auth/ResetPasswordPage';
import { DashboardPage } from './features/dashboard/DashboardPage';
import { SettingsPage } from './features/settings/SettingsPage';
import { AppearancePage } from './features/appearance/AppearancePage';
import { BlocksPage } from './features/blocks/BlocksPage';
import { BlockConfigPage } from './features/blocks/BlockConfigPage';
import { TemplatesPage } from './features/templates/TemplatesPage';
import { PaymentsPage } from './features/payments/PaymentsPage';
import { StorePage } from './features/store/StorePage';
import { UsersPage } from './features/users/UsersPage';
import { RolesPage } from './features/roles/RolesPage';
import { ContentPage } from './features/content/ContentPage';
import { EmailPage } from './features/email/EmailPage';
import { TranslationsPage } from './features/translations/TranslationsPage';
import { AuditPage } from './features/audit/AuditPage';
import { ApiTokensPage } from './features/api-tokens/ApiTokensPage';
import { AccountPage } from './features/account/AccountPage';
import { PagesPage } from './features/pages/PagesPage';
import { PublicHome } from './features/public/PublicHome';
import { SetupWizard } from './features/setup/SetupWizard';
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
        <Route path="/store" element={<StorePage />} />
        <Route path="/" element={<PublicHome />} />
        <Route path="/account" element={<RequireAuth><AccountPage /></RequireAuth>} />

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
          <Route path="email" element={<EmailPage />} />
          <Route path="blocks" element={<BlocksPage />} />
          <Route path="blocks/:blockId" element={<BlockConfigPage />} />
          <Route path="templates" element={<TemplatesPage />} />
          <Route path="payments" element={<PaymentsPage />} />
          <Route path="users" element={<UsersPage />} />
          <Route path="roles" element={<RolesPage />} />
          <Route path="settings" element={<SettingsPage />} />
          <Route path="appearance" element={<AppearancePage />} />
          <Route path="translations" element={<TranslationsPage />} />
          <Route path="audit" element={<AuditPage />} />
          <Route path="api-tokens" element={<ApiTokensPage />} />
        </Route>

        <Route path="*" element={<ErrorPage />} />
      </Routes>
    </BrowserRouter>
  );
}
