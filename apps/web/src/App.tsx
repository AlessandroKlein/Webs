import { useEffect, type ReactNode } from 'react';
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Providers } from './app/providers';
import { useAuthStore } from './lib/auth-store';
import { api } from './lib/api';
import './blocks';

import { AdminLayout } from './layouts/AdminLayout';
import { LoginPage } from './features/auth/LoginPage';
import { VerifyEmailPage } from './features/auth/VerifyEmailPage';
import { ResetPasswordPage } from './features/auth/ResetPasswordPage';
import { DashboardPage } from './features/dashboard/DashboardPage';
import { SettingsPage } from './features/settings/SettingsPage';
import { AppearancePage } from './features/appearance/AppearancePage';
import { BlocksPage } from './features/blocks/BlocksPage';
import { UsersPage } from './features/users/UsersPage';
import { RolesPage } from './features/roles/RolesPage';
import { ContentPage } from './features/content/ContentPage';
import { EmailPage } from './features/email/EmailPage';
import { TranslationsPage } from './features/translations/TranslationsPage';
import { AuditPage } from './features/audit/AuditPage';
import { PublicHome } from './features/public/PublicHome';
import { SetupWizard } from './features/setup/SetupWizard';

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

  return (
    <BrowserRouter>
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route path="/verify-email" element={<VerifyEmailPage />} />
        <Route path="/reset-password" element={<ResetPasswordPage />} />
        <Route path="/site" element={<PublicHome />} />

        <Route
          path="/"
          element={
            <RequireAuth>
              <AdminLayout />
            </RequireAuth>
          }
        >
          <Route index element={<DashboardPage />} />
          <Route path="content" element={<ContentPage />} />
          <Route path="email" element={<EmailPage />} />
          <Route path="blocks" element={<BlocksPage />} />
          <Route path="users" element={<UsersPage />} />
          <Route path="roles" element={<RolesPage />} />
          <Route path="settings" element={<SettingsPage />} />
          <Route path="appearance" element={<AppearancePage />} />
          <Route path="translations" element={<TranslationsPage />} />
          <Route path="audit" element={<AuditPage />} />
        </Route>

        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  );
}
