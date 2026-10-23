import { definePlugin, type PluginManifest } from '@webs/plugin-sdk';
import manifestJson from '../plugin.json';

const manifest = manifestJson as unknown as PluginManifest;

type RegisterConfig = {
  mode?: 'open' | 'invite' | 'both';
  defaultRole?: string;
};

const INVITE_TTL_DAYS = 7;

/**
 * register — servidor.
 *
 * NO duplica el registro real (bcrypt + sesión), que vive en
 * `apps/api/src/modules/auth`. Este plugin EXPONE/ORQUESTA:
 *  - GET  /settings        → modo y rol por defecto (config del plugin).
 *  - POST /request-invite  → genera un `Invite` (token uuid, +7 días).
 *  - POST /register        → valida contra `config.mode` y reenvía el body al
 *    endpoint interno `POST /api/v1/auth/register` mediante un `fetch` interno
 *    al mismo server.
 *
 * Importante sobre la invitación: el núcleo de auth (`registerUser`) es quien
 * consume la invitación de forma autoritativa (marca `usedAt`, activa la cuenta
 * y asigna el rol de la invitación). Este plugin hace una PRE-validación como
 * gate según `mode` y reenvía el `inviteToken`; así evitamos una doble
 * consumición (si aquí marcásemos `usedAt`, el auth core la vería ya usada y
 * fallaría). El resultado del registro (201/400/409…) se devuelve tal cual.
 */
export default definePlugin(manifest, {
  register: async (fastify, config) => {
    const db = (fastify as unknown as { prisma: Record<string, any> }).prisma;
    const cfg = config as RegisterConfig;
    const mode: 'open' | 'invite' | 'both' =
      cfg.mode === 'invite' || cfg.mode === 'both' ? cfg.mode : 'open';

    // F4 (P1): el rol por defecto de una invitación pública NUNCA puede ser
    // privilegiado. Whitelist de roles seguros (super_admin/admin quedan fuera);
    // si la config dejara `defaultRole: 'admin'`, se degrada a 'user'.
    const SAFE_INVITE_ROLES = new Set(['user', 'editor']);
    const rawDefaultRole =
      typeof cfg.defaultRole === 'string' && cfg.defaultRole ? cfg.defaultRole : 'user';
    const defaultRole = SAFE_INVITE_ROLES.has(rawDefaultRole) ? rawDefaultRole : 'user';

    // F4 (P1): rate-limit del endpoint público de invitación (Redis si está
    // disponible; memoria como fallback en un solo nodo). 10 invitaciones/hora/IP.
    const inviteWindows = new Map<string, { count: number; resetAt: number }>();
    const redis = (fastify as unknown as {
      redis?: { incr: (k: string) => Promise<number>; expire: (k: string, s: number) => Promise<unknown> } | null;
    }).redis;
    async function inviteRateLimited(ip: string): Promise<boolean> {
      const key = `register:invite:${ip}`;
      if (redis) {
        const count = await redis.incr(key);
        if (count === 1) await redis.expire(key, 3600);
        return count > 10;
      }
      const now = Date.now();
      const win = inviteWindows.get(key);
      if (!win || now >= win.resetAt) {
        inviteWindows.set(key, { count: 1, resetAt: now + 3600_000 });
        return false;
      }
      win.count += 1;
      return win.count > 10;
    }

    // GET /settings → configuración efectiva del registro.
    fastify.get('/settings', async () => ({ mode, defaultRole }));

    // POST /request-invite {email} → crea un Invite y devuelve el token
    // (para que el admin comparta el link de alta).
    fastify.post('/request-invite', async (request: unknown) => {
      const { body, ip } = request as { body?: { email?: string }; ip?: string };
      const email = (body?.email ?? '').trim().toLowerCase();
      if (!email) return { ok: false, error: 'email es requerido' };

      if (await inviteRateLimited(ip ?? 'unknown')) {
        return { ok: false, error: 'Demasiadas solicitudes de invitación, intentá más tarde' };
      }

      const token = crypto.randomUUID();
      const expiresAt = new Date(Date.now() + INVITE_TTL_DAYS * 24 * 60 * 60 * 1000);
      const invite = await db.invite.create({
        data: { email, token, role: defaultRole, expiresAt },
      });
      return {
        ok: true,
        token: invite.token,
        email: invite.email,
        role: invite.role,
        expiresAt: invite.expiresAt,
      };
    });

    // POST /register {email, password, displayName?, firstName?, lastName?, birthDate?, username?, inviteToken?}
    fastify.post('/register', async (request: unknown, reply: unknown) => {
      const req = request as {
        body?: { email?: string; password?: string; displayName?: string; firstName?: string; lastName?: string; birthDate?: string; username?: string; inviteToken?: string };
        protocol: string;
        host: string;
      };
      const rep = reply as unknown as {
        status(code: number): { send(payload: unknown): unknown };
        header(name: string, value: string): unknown;
      };

      const body = req.body ?? {};
      const email = (body.email ?? '').trim().toLowerCase();
      const password = body.password ?? '';
      if (!email || !password) {
        return rep.status(400).send({ ok: false, error: 'email y password son requeridos' });
      }

      // Gate según config.mode.
      if (mode === 'invite' && !body.inviteToken) {
        return rep.status(400).send({ ok: false, error: 'Este registro requiere una invitación (inviteToken)' });
      }

      // Pre-valida la invitación si viene (no la consume: el auth core lo hace).
      if (body.inviteToken) {
        const invite = await db.invite.findUnique({ where: { token: body.inviteToken } });
        if (!invite || invite.usedAt || new Date(invite.expiresAt) < new Date()) {
          return rep.status(400).send({ ok: false, error: 'Invitación inválida o expirada' });
        }
        if (typeof invite.email === 'string' && invite.email.toLowerCase() !== email) {
          return rep.status(400).send({ ok: false, error: 'El email no coincide con la invitación' });
        }
      }

      // Reenvía el body al registro real del auth core (fetch interno).
      // F5 (P1): NO usar `${req.protocol}://${req.host}` — el Host header es
      // controlable por el atacante y permitiría SSRF/redirección de la contraseña
      // en texto plano. Se usa loopback fijo; la contraseña viaja dentro del mismo
      // host y el auth core sigue siendo la única fuente de verdad del registro.
      const addr = (fastify as unknown as {
        server?: { address?: () => string | { port?: number } | null };
      }).server?.address?.();
      const port = addr && typeof addr === 'object' && addr.port ? addr.port : 3000;
      const url = `http://127.0.0.1:${port}/api/v1/auth/register`;
      let internal: Response;
      try {
        internal = await fetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            email,
            password,
            displayName: body.displayName,
            firstName: body.firstName,
            lastName: body.lastName,
            birthDate: body.birthDate,
            username: body.username,
            inviteToken: body.inviteToken,
          }),
        });
      } catch (err) {
        return rep
          .status(502)
          .send({ ok: false, error: `No se pudo contactar al registro interno: ${(err as Error).message}` });
      }

      const payload = await internal.json().catch(() => ({}));
      // Preserva la cookie de sesión que el auth core emite en su propia reply.
      const setCookie = internal.headers.get('set-cookie');
      if (setCookie) rep.header('set-cookie', setCookie);

      return rep.status(internal.status).send(payload);
    });
  },
});
