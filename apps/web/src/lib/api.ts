import { getAccessToken, setAccessToken } from './token';

const BASE_URL = import.meta.env.VITE_API_BASE_URL ?? '';

export interface ErrorDetail {
  field?: string;
  message: string;
  code?: string;
}

export interface ApiErrorBody {
  code: string;
  message: string;
  details?: ErrorDetail[];
  requestId?: string;
}

export class ApiClientError extends Error {
  readonly status: number;
  readonly code: string;
  readonly details?: ErrorDetail[];
  readonly raw?: Record<string, unknown>;

  constructor(status: number, body?: ApiErrorBody, raw?: Record<string, unknown>) {
    super(body?.message ?? `HTTP ${status}`);
    this.name = 'ApiClientError';
    this.status = status;
    this.code = body?.code ?? 'HTTP_ERROR';
    this.details = body?.details;
    this.raw = raw;
  }
}

/** Renueva el access token usando la cookie httpOnly de refresco. */
async function tryRefresh(): Promise<boolean> {
  try {
    const res = await fetch(`${BASE_URL}/api/v1/auth/refresh`, {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
    });
    if (!res.ok) return false;
    const data = (await res.json()) as { accessToken?: string };
    if (data.accessToken) setAccessToken(data.accessToken);
    return true;
  } catch {
    return false;
  }
}

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const doFetch = (token: string | null) =>
    fetch(`${BASE_URL}${path}`, {
      ...options,
      credentials: 'include',
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...(options.headers ?? {}),
      },
    });

  let res = await doFetch(getAccessToken());

  // Un 401 puede ser un token expirado: intenta refrescar una vez y reintenta.
  if (res.status === 401) {
    const refreshed = await tryRefresh();
    if (refreshed) res = await doFetch(getAccessToken());
  }

  if (!res.ok) {
    const body = (await res.json().catch(() => null)) as { error?: ApiErrorBody } | null;
    throw new ApiClientError(res.status, body?.error, body ?? undefined);
  }
  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}

export const api = {
  get<T>(path: string): Promise<T> {
    return request<T>(path);
  },
  post<T>(path: string, body?: unknown): Promise<T> {
    return request<T>(path, { method: 'POST', body: body === undefined ? undefined : JSON.stringify(body) });
  },
  put<T>(path: string, body?: unknown): Promise<T> {
    return request<T>(path, { method: 'PUT', body: body === undefined ? undefined : JSON.stringify(body) });
  },
  patch<T>(path: string, body: unknown): Promise<T> {
    return request<T>(path, { method: 'PATCH', body: JSON.stringify(body) });
  },
  del<T>(path: string): Promise<T> {
    return request<T>(path, { method: 'DELETE' });
  },
};

/** Descarga un archivo (CSV, etc.) autenticado, disparando la descarga del navegador. */
export async function downloadFile(path: string, filename: string): Promise<void> {
  const token = getAccessToken();
  const res = await fetch(`${BASE_URL}${path}`, {
    credentials: 'include',
    headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}) },
  });
  if (!res.ok) throw new ApiClientError(res.status);
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

/** Petición autenticada con un token concreto (sin refresh): para flujos de setup. */
async function requestWithToken<T>(path: string, token: string, options: RequestInit = {}): Promise<T> {
  const res = await fetch(`${BASE_URL}${path}`, {
    ...options,
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(options.headers ?? {}),
    },
  });
  if (!res.ok) {
    const body = (await res.json().catch(() => null)) as { error?: ApiErrorBody } | null;
    throw new ApiClientError(res.status, body?.error, body ?? undefined);
  }
  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}

/** Cliente API que autentica con un token específico (usado para activar 2FA/passkey). */
export function apiWithToken(token: string) {
  return {
    get<T>(path: string): Promise<T> {
      return requestWithToken<T>(path, token);
    },
    post<T>(path: string, body?: unknown): Promise<T> {
      return requestWithToken<T>(path, token, { method: 'POST', body: body === undefined ? undefined : JSON.stringify(body) });
    },
    del<T>(path: string): Promise<T> {
      return requestWithToken<T>(path, token, { method: 'DELETE' });
    },
  };
}
