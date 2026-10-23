import { definePlugin, type PluginManifest } from '@webs/plugin-sdk';
import manifestJson from '../plugin.json';

const manifest = manifestJson as unknown as PluginManifest;

type Provider = {
  id: string;
  name: string;
  enabled?: boolean;
  clientId?: string;
  clientSecret?: string;
  redirectUri?: string;
};

/** Estado OAuth de corta vida (state → code_verifier + metadata). */
type StoredState = {
  codeVerifier: string;
  provider: string;
  redirectUri: string;
  redirectBackTo?: string;
  expiresAt: number;
};

type TokenResponse = Record<string, unknown> & {
  access_token?: string;
  id_token?: string;
  error?: string;
  error_description?: string;
};

type Profile = {
  providerId: string | null;
  name: string | null;
  email: string | null;
  picture: string | null;
};

/** Subconjunto estructural del cliente Redis que decora la app. */
interface RedisLike {
  get(key: string): Promise<string | null>;
  set(key: string, value: string, ...args: unknown[]): Promise<unknown>;
  del(key: string): Promise<unknown>;
}

interface ProviderDef {
  authorizeUrl: string;
  tokenUrl: string;
  /** Vacío para proveedores sin endpoint userinfo (Apple). */
  userInfoUrl: string;
  scope: string;
  /** Facebook no soporta PKCE en el flujo web (solo client_secret). */
  supportsPkce: boolean;
  /** GitHub devuelve JSON en /token solo con Accept: application/json. */
  tokenAcceptHeader?: string;
  /** Cabeceras extra para el endpoint de perfil (p.ej. User-Agent de GitHub). */
  userInfoHeaders?: Record<string, string>;
  /** Extrae el id estable del usuario desde el perfil (o id_token). */
  extractProviderId: (token: TokenResponse, profile: Record<string, unknown>) => string | null;
}

/**
 * Endpoints OAuth2 de cada proveedor.
 *
 * - google / github: funcionales con PKCE S256 + userinfo.
 * - facebook: funcional, pero SIN PKCE (el flujo web de Facebook usa client_secret).
 * - apple: funcional con PKCE, pero el `clientSecret` debe ser un JWT (ES256) firmado
 *   con la key de Apple — requiere configuración adicional (key id + team id + key file).
 *   El nombre/email de Apple llegan en el `id_token` (solo en la PRIMERA autorización).
 *
 * Todos requieren `clientId`/`clientSecret` reales del proveedor para probarse contra
 * el servicio real; sin credenciales el handshake no puede completarse.
 */
const PROVIDER_DEFS: Record<string, ProviderDef> = {
  google: {
    authorizeUrl: 'https://accounts.google.com/o/oauth2/v2/auth',
    tokenUrl: 'https://oauth2.googleapis.com/token',
    userInfoUrl: 'https://www.googleapis.com/oauth2/v3/userinfo',
    scope: 'openid email profile',
    supportsPkce: true,
    extractProviderId: (_token, profile) => (typeof profile.sub === 'string' ? profile.sub : null),
  },
  github: {
    authorizeUrl: 'https://github.com/login/oauth/authorize',
    tokenUrl: 'https://github.com/login/oauth/access_token',
    userInfoUrl: 'https://api.github.com/user',
    scope: 'read:user user:email',
    supportsPkce: true,
    tokenAcceptHeader: 'application/json',
    userInfoHeaders: { 'User-Agent': 'webs-platform', Accept: 'application/json' },
    extractProviderId: (_token, profile) => (profile.id == null ? null : String(profile.id)),
  },
  facebook: {
    authorizeUrl: 'https://www.facebook.com/v18.0/dialog/oauth',
    tokenUrl: 'https://graph.facebook.com/v18.0/oauth/access_token',
    userInfoUrl: 'https://graph.facebook.com/me?fields=id,name,email',
    scope: 'email public_profile',
    supportsPkce: false,
    extractProviderId: (_token, profile) => (typeof profile.id === 'string' ? profile.id : null),
  },
  apple: {
    authorizeUrl: 'https://appleid.apple.com/auth/authorize',
    tokenUrl: 'https://appleid.apple.com/auth/token',
    userInfoUrl: '',
    scope: 'name email',
    supportsPkce: true,
    extractProviderId: (_token, profile) => (typeof profile.sub === 'string' ? profile.sub : null),
  },
};

// ---- Utilidades criptográficas (Web Crypto, disponible en el runtime Node y en el lib DOM) ----

function base64UrlEncode(bytes: Uint8Array): string {
  let binary = '';
  for (let i = 0; i < bytes.length; i += 1) {
    binary += String.fromCharCode(bytes[i] as number);
  }
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function randomUrlSafe(byteLength: number): string {
  const buf = new Uint8Array(byteLength);
  crypto.getRandomValues(buf);
  return base64UrlEncode(buf);
}

async function sha256Base64Url(input: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(input));
  return base64UrlEncode(new Uint8Array(digest));
}

function decodeJwtPayload(jwt: string): Record<string, unknown> {
  let part = jwt.split('.')[1] ?? '';
  part = part.replace(/-/g, '+').replace(/_/g, '/');
  while (part.length % 4 !== 0) part += '=';
  try {
    return JSON.parse(atob(part)) as Record<string, unknown>;
  } catch {
    return {};
  }
}

// ---- Almacén de `state` (anti-CSRF, un solo uso, TTL corto) ----

const STATE_TTL_MS = 10 * 60 * 1000; // 10 minutos

class StateStore {
  private readonly memory = new Map<string, StoredState>();
  private readonly redis: RedisLike | null;

  constructor(redis: RedisLike | null) {
    this.redis = redis;
  }

  async put(state: string, value: StoredState): Promise<void> {
    if (this.redis) {
      await this.redis.set(`social:state:${state}`, JSON.stringify(value), 'EX', 600);
    } else {
      this.memory.set(state, value);
    }
  }

  async consume(state: string): Promise<StoredState | null> {
    let value: StoredState | null = null;
    if (this.redis) {
      const raw = await this.redis.get(`social:state:${state}`);
      if (raw) {
        try {
          value = JSON.parse(raw) as StoredState;
        } catch {
          value = null;
        }
      }
    } else {
      value = this.memory.get(state) ?? null;
    }
    if (!value || Date.now() > value.expiresAt) {
      await this.del(state);
      return null;
    }
    await this.del(state);
    return value;
  }

  async del(state: string): Promise<void> {
    if (this.redis) {
      await this.redis.del(`social:state:${state}`);
    } else {
      this.memory.delete(state);
    }
  }
}

// ---- Lectura de configuración (siempre fresca desde BD) ----

async function getProviders(db: Record<string, any>, fallback: Provider[]): Promise<Provider[]> {
  const installation = await db.pluginInstallation.findUnique({
    where: { pluginId: manifest.id },
    select: { config: true },
  });
  const cfg = (installation?.config ?? {}) as { providers?: Provider[] };
  return (Array.isArray(cfg.providers) ? cfg.providers : fallback) as Provider[];
}

function findProvider(providers: Provider[], id: string): Provider | null {
  return providers.find((p) => p.id === id && Boolean(p.enabled)) ?? null;
}

// ---- Intercambio OAuth2 real (code → token → perfil) ----

async function exchangeCode(
  def: ProviderDef,
  provider: Provider,
  code: string,
  codeVerifier: string,
  redirectUri: string,
): Promise<{ providerId: string; profile: Profile }> {
  const params: Record<string, string> = {
    grant_type: 'authorization_code',
    code,
    client_id: provider.clientId ?? '',
    redirect_uri: redirectUri,
  };
  if (provider.clientSecret) params.client_secret = provider.clientSecret;
  if (def.supportsPkce) params.code_verifier = codeVerifier;

  const tokenRes = await fetch(def.tokenUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      ...(def.tokenAcceptHeader ? { Accept: def.tokenAcceptHeader } : {}),
    },
    body: new URLSearchParams(params).toString(),
  });

  const tokenJson = (await tokenRes.json().catch(() => ({}))) as TokenResponse;
  if (!tokenRes.ok || tokenJson.error) {
    const msg = tokenJson.error_description ?? tokenJson.error ?? `token exchange falló (HTTP ${tokenRes.status})`;
    throw new Error(msg);
  }
  const accessToken = tokenJson.access_token;
  if (!accessToken) {
    throw new Error('el proveedor no devolvió access_token');
  }

  let profile: Record<string, unknown> = {};
  if (def.userInfoUrl) {
    const profileRes = await fetch(def.userInfoUrl, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        ...(def.userInfoHeaders ?? {}),
      },
    });
    profile = (await profileRes.json().catch(() => ({}))) as Record<string, unknown>;
  }

  // Apple no tiene endpoint userinfo: el perfil viaja en el id_token.
  if (typeof tokenJson.id_token === 'string') {
    const claims = decodeJwtPayload(tokenJson.id_token);
    profile = { ...claims, ...profile };
  }

  const providerId = def.extractProviderId(tokenJson, profile);
  if (!providerId) {
    throw new Error('no se pudo resolver el id del usuario del proveedor');
  }

  return {
    providerId,
    profile: {
      providerId,
      name: typeof profile.name === 'string' ? profile.name : null,
      email: typeof profile.email === 'string' ? profile.email : null,
      picture: typeof profile.picture === 'string' ? profile.picture : null,
    },
  };
}

function redirectWith(reply: unknown, base: string | undefined, extra: Record<string, string>): void {
  const res = reply as { redirect: (url: string) => void };
  const target = base && base.length > 0 ? base : '/';
  const sep = target.includes('?') ? '&' : '?';
  res.redirect(`${target}${sep}${new URLSearchParams(extra).toString()}`);
}

/**
 * social-login — servidor.
 *
 * Flujo OAuth2 real (Authorization Code) con state (anti-CSRF) + PKCE (S256):
 *   - POST /authorize  → genera state + code_verifier, devuelve la URL de authorize.
 *   - GET  /callback   → el proveedor redirige acá; valida state, hace code→token→perfil
 *                        y redirige de vuelta al front con el resultado.
 *   - POST /verify     → intercambio JSON (code + code_verifier) para clientes que manejan
 *                        el flujo por su cuenta. Valida state si se envía.
 *
 * El vínculo es por (provider, providerId) real del proveedor — NUNCA por email
 * auto-afirmado (F3). Las rutas viven bajo `/api/v1/plugins/social-login` y el
 * shim de retrocompatibilidad `/api/v1/blocks/social-login`.
 */
export default definePlugin(manifest, {
  register: async (fastify, config) => {
    const db = (fastify as unknown as { prisma: Record<string, any> }).prisma;
    const redis = (fastify as unknown as { redis?: RedisLike | null }).redis ?? null;
    const fallback = (Array.isArray(config.providers) ? config.providers : []) as Provider[];
    const states = new StateStore(redis);

    // GET /providers → proveedores habilitados + si tienen credenciales (sin exponer secretos).
    fastify.get('/providers', async () => {
      const providers = await getProviders(db, fallback);
      return providers
        .filter((p) => Boolean(p.enabled))
        .map((p) => ({
          id: p.id,
          name: p.name,
          configured: Boolean(p.clientId && p.clientSecret && p.redirectUri),
        }));
    });

    // POST /authorize {provider, redirectBackTo?} → {ok, authorizeUrl, state}
    fastify.post('/authorize', async (request: unknown) => {
      const { body } = request as { body?: { provider?: string; redirectBackTo?: string } };
      const providerId = (body?.provider ?? '').trim();
      const redirectBackTo = body?.redirectBackTo;

      const providers = await getProviders(db, fallback);
      const provider = findProvider(providers, providerId);
      const def = PROVIDER_DEFS[providerId];
      if (!provider || !def) {
        return { ok: false, error: 'proveedor no habilitado o no soportado' };
      }
      if (!provider.clientId || !provider.redirectUri) {
        return { ok: false, error: 'proveedor sin clientId o redirectUri configurados' };
      }

      const state = randomUrlSafe(32);
      const codeVerifier = randomUrlSafe(32);
      const codeChallenge = await sha256Base64Url(codeVerifier);

      const query = new URLSearchParams({
        client_id: provider.clientId,
        redirect_uri: provider.redirectUri,
        response_type: 'code',
        scope: def.scope,
        state,
      });
      if (def.supportsPkce) {
        query.set('code_challenge', codeChallenge);
        query.set('code_challenge_method', 'S256');
      }
      const authorizeUrl = `${def.authorizeUrl}?${query.toString()}`;

      await states.put(state, {
        codeVerifier,
        provider: providerId,
        redirectUri: provider.redirectUri,
        redirectBackTo,
        expiresAt: Date.now() + STATE_TTL_MS,
      });

      return { ok: true, authorizeUrl, state };
    });

    // GET /callback?code&state&error → valida state, intercambia el code y redirige al front.
    fastify.get('/callback', async (request: unknown, reply: unknown) => {
      const { query } = request as {
        query?: { code?: string; state?: string; error?: string; error_description?: string };
      };

      if (query?.error) {
        redirectWith(reply, undefined, {
          social_login: 'error',
          error: query.error_description ?? query.error ?? 'error_del_proveedor',
        });
        return;
      }

      const state = query?.state ?? '';
      const code = query?.code ?? '';
      const stored = await states.consume(state);
      if (!stored) {
        redirectWith(reply, undefined, { social_login: 'error', error: 'state_invalido_o_expirado' });
        return;
      }

      const providers = await getProviders(db, fallback);
      const provider = findProvider(providers, stored.provider);
      const def = PROVIDER_DEFS[stored.provider];
      if (!provider || !def || !provider.clientId) {
        redirectWith(reply, stored.redirectBackTo, { social_login: 'error', error: 'proveedor_no_configurado' });
        return;
      }

      try {
        const { providerId, profile } = await exchangeCode(
          def,
          provider,
          code,
          stored.codeVerifier,
          stored.redirectUri,
        );

        let account = await db.socialAccount.findUnique({
          where: { provider_providerId: { provider: stored.provider, providerId } },
        });
        if (!account) {
          account = await db.socialAccount.create({
            data: { provider: stored.provider, providerId, userId: null },
          });
        }

        redirectWith(reply, stored.redirectBackTo, {
          social_login: 'ok',
          provider: stored.provider,
          socialAccountId: account.id,
          linked: String(Boolean(account.userId)),
          name: profile.name ?? '',
          email: profile.email ?? '',
        });
      } catch (err) {
        const message = err instanceof Error ? err.message : 'handshake_fallo';
        redirectWith(reply, stored.redirectBackTo, { social_login: 'error', error: message });
      }
    });

    // POST /verify {provider, code, codeVerifier, state?} → intercambio JSON.
    // Valida el authorization code contra el proveedor real (code→token→perfil).
    fastify.post('/verify', async (request: unknown) => {
      const { body } = request as {
        body?: { provider?: string; code?: string; codeVerifier?: string; state?: string };
      };
      const providerId = (body?.provider ?? '').trim();
      const code = (body?.code ?? '').trim();
      const codeVerifier = (body?.codeVerifier ?? '').trim();
      const state = (body?.state ?? '').trim();

      if (!providerId || !code || !codeVerifier) {
        return { ok: false, linked: false, error: 'provider, code y codeVerifier son requeridos' };
      }

      // Si viene state, debe ser uno emitido por /authorize (anti-CSRF, un solo uso).
      if (state) {
        const stored = await states.consume(state);
        if (!stored || stored.provider !== providerId) {
          return { ok: false, linked: false, error: 'state inválido o expirado' };
        }
      }

      const providers = await getProviders(db, fallback);
      const provider = findProvider(providers, providerId);
      const def = PROVIDER_DEFS[providerId];
      if (!provider || !def || !provider.clientId) {
        return { ok: false, linked: false, error: 'proveedor no habilitado o no configurado' };
      }

      try {
        const { providerId: realId, profile } = await exchangeCode(
          def,
          provider,
          code,
          codeVerifier,
          provider.redirectUri ?? '',
        );

        let account = await db.socialAccount.findUnique({
          where: { provider_providerId: { provider: providerId, providerId: realId } },
        });
        if (!account) {
          account = await db.socialAccount.create({
            data: { provider: providerId, providerId: realId, userId: null },
          });
        }

        return {
          ok: true,
          linked: Boolean(account.userId),
          socialAccountId: account.id,
          provider: providerId,
          providerId: realId,
          profile,
        };
      } catch (err) {
        const message = err instanceof Error ? err.message : 'handshake_fallo';
        return { ok: false, linked: false, error: message };
      }
    });
  },
});
