import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { NotFoundError, ValidationError } from '@webs/core';

const expenseSchema = z.object({
  description: z.string().min(1),
  amount: z.number().int().positive(),
  category: z.string().optional(),
  date: z.string().optional(),
});

/** Ganancias (pagos aprobados) + gastos, agrupados por mes o año. */
async function analytics(fastify: FastifyInstance, period: 'month' | 'year') {
  const now = new Date();
  const buckets: Array<{ label: string; start: Date; end: Date }> = [];

  if (period === 'year') {
    for (let i = 4; i >= 0; i--) {
      const y = now.getFullYear() - i;
      buckets.push({ label: String(y), start: new Date(y, 0, 1), end: new Date(y + 1, 0, 1) });
    }
  } else {
    for (let i = 11; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      buckets.push({
        label: d.toLocaleString('es', { month: 'short', year: '2-digit' }),
        start: d,
        end: new Date(d.getFullYear(), d.getMonth() + 1, 1),
      });
    }
  }

  const start = buckets[0]!.start;
  const [payments, expenses] = await Promise.all([
    fastify.prisma.payment.findMany({ where: { status: 'approved', paidAt: { gte: start } }, select: { amount: true, paidAt: true } }),
    fastify.prisma.expense.findMany({ where: { date: { gte: start } }, select: { amount: true, date: true } }),
  ]);

  const series = buckets.map((b) => {
    const earnings = payments.filter((p) => p.paidAt && p.paidAt >= b.start && p.paidAt < b.end).reduce((s, p) => s + p.amount, 0);
    const exp = expenses.filter((e) => e.date >= b.start && e.date < b.end).reduce((s, e) => s + e.amount, 0);
    return { label: b.label, earnings, expenses: exp, profit: earnings - exp };
  });

  const totals = series.reduce(
    (a, s) => ({ earnings: a.earnings + s.earnings, expenses: a.expenses + s.expenses, profit: a.profit + s.profit }),
    { earnings: 0, expenses: 0, profit: 0 },
  );
  return { period, series, totals };
}

export default async function expensesRoutes(fastify: FastifyInstance): Promise<void> {
  fastify.get(
    '/expenses',
    { schema: { tags: ['expenses'] }, preHandler: [fastify.authenticate, fastify.authorize('user.read')] },
    async () => fastify.prisma.expense.findMany({ orderBy: { date: 'desc' }, take: 200 }),
  );

  fastify.post(
    '/expenses',
    { schema: { tags: ['expenses'] }, preHandler: [fastify.authenticate, fastify.authorize('user.read')] },
    async (request, reply) => {
      const parsed = expenseSchema.safeParse(request.body);
      if (!parsed.success) {
        throw new ValidationError('Gasto inválido', parsed.error.issues.map((i) => ({ field: i.path.join('.'), message: i.message })));
      }
      const input = parsed.data;
      const expense = await fastify.prisma.expense.create({
        data: {
          description: input.description,
          amount: input.amount,
          category: input.category ?? null,
          date: input.date ? new Date(input.date) : new Date(),
          userId: request.user?.sub ?? null,
        },
      });
      return reply.status(201).send(expense);
    },
  );

  fastify.delete(
    '/expenses/:id',
    {
      schema: { tags: ['expenses'], params: { type: 'object', properties: { id: { type: 'string' } } } },
      preHandler: [fastify.authenticate, fastify.authorize('user.read')],
    },
    async (request, reply) => {
      const id = (request.params as { id: string }).id;
      const expense = await fastify.prisma.expense.findUnique({ where: { id } });
      if (!expense) throw new NotFoundError('Gasto');
      await fastify.prisma.expense.delete({ where: { id } });
      return reply.status(204).send();
    },
  );

  fastify.get(
    '/expenses/analytics',
    {
      schema: {
        tags: ['expenses'],
        querystring: { type: 'object', properties: { period: { type: 'string', enum: ['month', 'year'], default: 'month' } } },
      },
      preHandler: [fastify.authenticate, fastify.authorize('user.read')],
    },
    async (request) => {
      const period = ((request.query as { period?: string }).period ?? 'month') as 'month' | 'year';
      return analytics(fastify, period);
    },
  );
}
