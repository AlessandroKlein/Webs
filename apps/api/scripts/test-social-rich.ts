import Fastify from 'fastify';
import socialPlugin from '../../../plugins/social/src/server';

interface Row {
  id: string;
  [k: string]: unknown;
}

async function buildApp() {
  const app = Fastify();

  // Estado en memoria + captura de `where` para aserciones de visibilidad.
  const state: {
    posts: Row[];
    hashtags: Row[];
    mentions: Row[];
    polls: Row[];
    votes: Row[];
    notifications: Row[];
    users: Row[];
    follows: Row[];
  } = {
    posts: [],
    hashtags: [],
    mentions: [],
    polls: [],
    votes: [],
    notifications: [],
    users: [{ id: 'u-alice', username: 'alice' }],
    follows: [{ followerId: 'user-1', followingId: 'user-2' }],
  };
  let nextId = 1;
  const id = () => `id-${nextId++}`;
  let lastFindManyWhere: Record<string, unknown> | undefined;

  const db: Record<string, any> = {
    socialPost: {
      create: async ({ data }: { data: Record<string, unknown> }) => {
        const row: Row = { id: id(), likes: 0, createdAt: new Date(), ...data };
        state.posts.push(row);
        return row;
      },
      findMany: async (args?: { where?: Record<string, unknown> }) => {
        lastFindManyWhere = args?.where;
        return state.posts;
      },
      findUnique: async ({ where, include }: { where: { id: string }; include?: Record<string, boolean | object> }) => {
        const post = state.posts.find((p) => p.id === where.id) ?? null;
        if (post && include?.poll) {
          const poll = state.polls.find((p) => p.postId === post.id) ?? null;
          const votes = state.votes.filter((v) => v.pollId === poll?.id);
          return { ...post, poll: poll ? { ...poll, votes } : null };
        }
        return post;
      },
      update: async ({ where, data }: { where: { id: string }; data: Record<string, unknown> }) => {
        const post = state.posts.find((p) => p.id === where.id);
        if (post) Object.assign(post, data);
        return post;
      },
      delete: async ({ where }: { where: { id: string } }) => {
        const i = state.posts.findIndex((p) => p.id === where.id);
        if (i >= 0) return state.posts.splice(i, 1)[0];
        return null;
      },
    },
    socialHashtag: {
      createMany: async ({ data }: { data: Row[] }) => {
        state.hashtags.push(...data);
        return { count: data.length };
      },
      findMany: async () => [],
    },
    socialMention: {
      createMany: async ({ data }: { data: Row[] }) => {
        state.mentions.push(...data);
        return { count: data.length };
      },
      findMany: async () => [],
    },
    socialPoll: {
      create: async ({ data }: { data: Record<string, unknown> }) => {
        const row: Row = { id: id(), ...data };
        state.polls.push(row);
        return row;
      },
    },
    socialPollVote: {
      upsert: async ({ where, create, update }: { where: { pollId_userId: { pollId: string; userId: string } }; create: Row; update: Record<string, unknown> }) => {
        const existing = state.votes.find(
          (v) => v.pollId === where.pollId_userId.pollId && v.userId === where.pollId_userId.userId,
        );
        if (existing) {
          Object.assign(existing, update);
        } else {
          state.votes.push({ id: id(), ...create });
        }
        return existing ?? create;
      },
    },
    notification: { create: async ({ data }: { data: Record<string, unknown> }) => { state.notifications.push(data); return data; } },
    user: {
      findMany: async ({ where }: { where?: { username?: { in: string[] } } }) =>
        where?.username?.in ? state.users.filter((u) => where.username!.in.includes(String(u.username))) : state.users,
      findUnique: async ({ where }: { where: { username: string } }) =>
        state.users.find((u) => u.username === where.username) ?? null,
    },
    follow: {
      findMany: async ({ where }: { where: { followerId: string } }) => state.follows.filter((f) => f.followerId === where.followerId),
      count: async () => 0,
      upsert: async () => ({}),
      deleteMany: async () => ({ count: 0 }),
    },
    story: { findMany: async () => [], create: async () => ({}), delete: async () => ({}) },
    $transaction: async (fn: (tx: Record<string, any>) => Promise<unknown>) => fn(db),
  };

  app.decorate('prisma', db);
  app.decorate('authenticate', async (req: { headers: Record<string, unknown>; user?: unknown }) => {
    const uid = (req.headers['x-user-id'] as string) ?? 'user-1';
    (req as any).user = { sub: uid, email: 'a@b.c', permissions: [] };
  });
  app.decorate('resolveTenant', async () => ({ organizationId: 'org-1' }));
  app.addHook('onRequest', async (req: { headers: Record<string, unknown>; user?: unknown }) => {
    const uid = (req.headers['x-user-id'] as string) ?? undefined;
    if (uid) (req as any).user = { sub: uid, email: 'x@y.z', permissions: [] };
  });

  await app.register((socialPlugin as unknown as { register: (f: typeof app, c: unknown) => Promise<void> }).register, { maxPostLength: 500 });
  await app.ready();
  return { app, state, lastFindManyWhere: () => lastFindManyWhere };
}

let passed = 0;
function check(name: string, cond: boolean) {
  if (!cond) throw new Error(`CHECK FAILED: ${name}`);
  passed += 1;
  console.log(`✓ ${name}`);
}

async function main() {
  // 1. POST /posts con poll + hashtags + mención + visibilidad followers.
  {
    const { app, state } = await buildApp();
    const res = await app.inject({
      method: 'POST',
      url: '/posts',
      headers: { 'x-user-id': 'user-1', 'content-type': 'application/json' },
      payload: {
        text: 'Hola @alice #comunidad',
        visibility: 'followers',
        mediaUrls: [{ url: 'https://cdn.example.com/a.jpg', type: 'image' }],
        poll: { question: '¿Vamos?', options: [{ id: 'si', label: 'Sí' }, { id: 'no', label: 'No' }] },
      },
    });
    check('POST /posts responde 200', res.statusCode === 200);
    check('post creado con visibility followers', state.posts[0]?.visibility === 'followers');
    check('poll creado con 2 options', (state.polls[0]?.options as unknown[]).length === 2);
    check('hashtag extraído #comunidad', state.hashtags.some((h) => h.tag === 'comunidad'));
    check('mención extraída a u-alice', state.mentions.some((m) => m.userId === 'u-alice'));
    check('notificación de mención creada', state.notifications.length === 1 && state.notifications[0]?.userId === 'u-alice');
    await app.close();
  }

  // 2. SSRF-safe: link a loopback → preview null (sin fetch).
  {
    const { app, state } = await buildApp();
    const res = await app.inject({
      method: 'POST',
      url: '/posts',
      headers: { 'x-user-id': 'user-1', 'content-type': 'application/json' },
      payload: { text: 'Mirá http://127.0.0.1:8080/admin' },
    });
    check('POST con URL loopback responde 200', res.statusCode === 200);
    check('preview denegado (SSRF bloqueado)', state.posts[0]?.preview === null);
    await app.close();
  }

  // 3. GET /posts visibilidad: anónimo → sólo public.
  {
    const { app, lastFindManyWhere } = await buildApp();
    await app.inject({ method: 'GET', url: '/posts' });
    const or = (lastFindManyWhere()?.AND as Array<Record<string, unknown>>)?.find((c) => c.OR)?.OR as Array<Record<string, unknown>>;
    check('anónimo: OR tiene visibility public', or.some((c) => c.visibility === 'public'));
    check('anónimo: sin author propio', !or.some((c) => c.author === 'user-1'));
    await app.close();
  }

  // 4. GET /posts visibilidad: autor (user-1) ve lo suyo + followers de seguidos.
  {
    const { app, lastFindManyWhere } = await buildApp();
    await app.inject({ method: 'GET', url: '/posts', headers: { 'x-user-id': 'user-1' } });
    const or = (lastFindManyWhere()?.AND as Array<Record<string, unknown>>)?.find((c) => c.OR)?.OR as Array<Record<string, unknown>>;
    check('autor: ve lo suyo', or.some((c) => c.author === 'user-1'));
    check('autor: ve followers-only de user-2', or.some((c) => c.visibility === 'followers'));
    await app.close();
  }

  // 5. POST /posts/:id/vote (voto único) + opción inválida.
  {
    const { app, state } = await buildApp();
    await app.inject({
      method: 'POST', url: '/posts', headers: { 'x-user-id': 'user-1', 'content-type': 'application/json' },
      payload: { text: 'encuesta', poll: { question: 'q', options: [{ id: 'a', label: 'A' }, { id: 'b', label: 'B' }] } },
    });
    const postId = state.posts[0]!.id;
    const pollId = state.polls[0]!.id;
    const vote = (optionId: string) =>
      app.inject({ method: 'POST', url: `/posts/${postId}/vote`, headers: { 'x-user-id': 'voter-1', 'content-type': 'application/json' }, payload: { optionId } });

    const r1 = await vote('a');
    check('voto válido responde ok', r1.statusCode === 200 && r1.json().ok === true);
    await vote('b'); // cambia de opción
    check('voto es único (sigue 1 fila)', state.votes.filter((v) => v.pollId === pollId && v.userId === 'voter-1').length === 1);
    const bad = await vote('zzz');
    check('opción inválida → error', bad.json().ok === false && bad.json().error === 'invalid_option');
    await app.close();
  }

  console.log(`\nSMOKE OK: ${passed}/15 checks`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
