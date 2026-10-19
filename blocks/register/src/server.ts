import { defineBlock, type BlockManifest } from '@webs/plugin-sdk';
import manifestJson from '../block.json';

const manifest = manifestJson as unknown as BlockManifest;

type RegisterConfig = {
  mode?: 'open' | 'invite' | 'both';
  defaultRole?: string;
};

const INVITE_TTL_DAYS = 7;

/**
 * register — servidor.
 *
 * NO duplica el registro real (bcrypt + sesión), que vive en
 * `apps/api/src/modules/auth`. Este bloque EXPONE/ORQUESTA:
 *  - GET  /settings        → modo y rol por defecto (config del bloque).
 *  - POST /request-invite  → genera un `Invite` (token uuid, +7 días).
 *  - POST /register        → valida contra `config.mode` y reenvía el body al
 *    endpoint interno `POST /api/v1/auth/register` mediante un `fetch` interno
 *    al mismo server.
 *
 * Importante sobre la invitación: el núcleo de auth (`registerUser`) es quien
 * consume la invitación de forma autoritativa (marca `usedAt`, activa la cuenta
 * y asigna el rol de la invitación). Este bloque hace una PRE-validación como
 * gate según `mode` y reenvía el `inviteToken`; así evitamos una doble
 * consumición (si aquí marcásemos `usedAt`, el auth core la vería ya usada y
 * fallaría). El resultado del registro (201/400/409…) se devuelve tal cual.
 */
export default defineBlock(manifest, {
  register: async (fastify, config) => {
    const db = (fastify as unknown as { prisma: Record<string, any> }).prisma;
    const cfg = config as RegisterConfig;
    const mode: 'open' | 'invite' | 'both' =
      cfg.mode === 'invite' || cfg.mode === 'both' ? cfg.mode : 'open';
    const defaultRole = typeof cfg.defaultRole === 'string' && cfg.defaultRole ? cfg.defaultRole : 'user';

    // GET /settings → configuración efectiva del registro.
    fastify.get('/settings', async () => ({ mode, defaultRole }));

    // POST /request-invite {email} → crea un Invite y devuelve el token
    // (para que el admin comparta el link de alta).
    fastify.post('/request-invite', async (request: unknown) => {
      const { body } = request as { body?: { email?: string } };
      const email = (body?.email ?? '').trim().toLowerCase();
      if (!email) return { ok: false, error: 'email es requerido' };

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

    // POST /register {email, password, displayName?, username?, inviteToken?}
    fastify.post('/register', async (request: unknown, reply: unknown) => {
      const req = request as {
        body?: { email?: string; password?: string; displayName?: string; username?: string; inviteToken?: string };
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
      const url = `${req.protocol}://${req.host}/api/v1/auth/register`;
      let internal: Response;
      try {
        internal = await fetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            email,
            password,
            displayName: body.displayName,
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
