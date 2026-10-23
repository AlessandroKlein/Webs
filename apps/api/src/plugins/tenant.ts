import fp from 'fastify-plugin';
import type { FastifyRequest } from 'fastify';
import { requireTenant, resolveTenant, resolveScope, type TenantContext } from '../lib/tenant';

/**
 * Decoradores de multi-tenant (ADR-0006):
 *  - `fastify.requireTenant`: preHandler que resuelve y adjunta `request.tenant`
 *    y falla con 403 si no se puede resolver la organización (fail-closed).
 *  - `fastify.resolveTenant(request)`: resuelve el tenant sin fallar (para rutas
 *    que necesitan scoping opcional).
 *  - `fastify.resolveScope(tenant)`: devuelve el fragmento `where` de scoping
 *    (sucursal → su org; admin de cadena → consolidado; super_admin sin org → todo).
 *    Lo usan los plugins de negocio para filtrar sus lecturas fail-closed.
 */
export default fp(async (fastify) => {
  fastify.decorate('requireTenant', requireTenant(fastify));
  fastify.decorate('resolveTenant', (request: FastifyRequest): Promise<TenantContext> => resolveTenant(fastify, request));
  fastify.decorate('resolveScope', (tenant: TenantContext): Promise<Record<string, unknown>> => resolveScope(fastify, tenant));
});
