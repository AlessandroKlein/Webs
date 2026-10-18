import { create } from 'zustand';
import { api } from './api';
import { setAccessToken } from './token';

export interface AuthUser {
  id: string;
  email: string;
  displayName: string | null;
  avatarUrl: string | null;
  locale: string;
}

interface AuthState {
  user: AuthUser | null;
  permissions: string[];
  status: 'idle' | 'loading' | 'authenticated' | 'unauthenticated';
  login: (email: string, password: string, totp?: string, rememberMe?: boolean) => Promise<void>;
  finalizeAuth: (accessToken: string, user: AuthUser) => Promise<void>;
  logout: () => Promise<void>;
  bootstrap: () => Promise<void>;
  hasPermission: (permission: string) => boolean;
}

export const useAuthStore = create<AuthState>((set, get) => ({
  user: null,
  permissions: [],
  status: 'idle',

  login: async (email, password, totp, rememberMe) => {
    set({ status: 'loading' });
    const data = await api.post<{ accessToken: string; user: AuthUser }>('/api/v1/auth/login', {
      email,
      password,
      ...(totp ? { totp } : {}),
      ...(rememberMe ? { rememberMe: true } : {}),
    });
    await get().finalizeAuth(data.accessToken, data.user);
  },

  finalizeAuth: async (accessToken, user) => {
    setAccessToken(accessToken);
    set({ user, status: 'authenticated' });
    const me = await api.get<{ permissions: string[] }>('/api/v1/auth/me');
    set({ permissions: me.permissions ?? [] });
  },

  logout: async () => {
    try {
      await api.post('/api/v1/auth/logout');
    } catch {
      /* ignora */
    }
    setAccessToken(null);
    set({ user: null, permissions: [], status: 'unauthenticated' });
  },

  bootstrap: async () => {
    set({ status: 'loading' });
    try {
      const me = await api.get<{ user: AuthUser | null; permissions: string[] }>('/api/v1/auth/me');
      if (me.user) {
        set({ user: me.user, permissions: me.permissions ?? [], status: 'authenticated' });
      } else {
        set({ user: null, permissions: [], status: 'unauthenticated' });
      }
    } catch {
      set({ user: null, permissions: [], status: 'unauthenticated' });
    }
  },

  hasPermission: (permission) => get().permissions.includes(permission),
}));
