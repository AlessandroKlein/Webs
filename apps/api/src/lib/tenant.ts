import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { cacheGet, cacheSet } from './cache';

/** Contexto de tenant resuelto para un request autenticado. */
export interface TenantContext {
  /** Organización activa (sucursal, o raíz si es standalone). Null = super_admin sin org (ve todo). */
  organizationId: string | null;
  /** Raíz de la cadena (denormalizada). Igual a organizationId para standalone. */
  chainId: string | null;
  /** El usuario tiene el rol global `super_admin`. */
  isSuperAdmin: boolean;
  /** El usuario administra la cadena completa (super_admin o admin de la raíz). */
  isChainAdmin: boolean;
}

/** Organización raíz por defecto creada por la migración `multi_tenant_chains`. */
export const DEFAULT_ORG_ID = '00000000-0000-4000-8000-000000000001';

/** Roles de membresía que otorgan administración de una organización (y su cadena). */
export const CHAIN_ADMIN_ROLES = ['admin', 'owner'];

interface TenantUser {
  sub?: string;
  orgId?: string | null;
}

/**
 * Resuelve la organización/sucursal a partir del hostname del request (ADR-0017).
 *
 * Usa `X-Forwarded-Host` (tras el proxy) o `Host`, normalizado a minúsculas y sin
 * puerto, y busca `Organization.domain`. Devuelve el id de la organización o `null`
 * si el host no corresponde a ningún dominio declarado (la resolución continúa por
 * cabecera/JWT en `resolveTenant`).
 *
 * El resultado se cachea (Redis si está disponible, en memoria como respaldo) con
 * TTL corto para no añadir una query por request.
 */
export async function resolveTenantByHostname(
  fastify: FastifyInstance,
  request: FastifyRequest,
): Promise<string | null> {
  const raw = (request.headers['x-forwarded-host'] as string | undefined) ?? (request.headers.host as string | undefined);
  if (!raw) return null;
  const host = (raw.toLowerCase().split(':')[0] ?? raw).trim();
  if (!host) return null;

  const cacheKey = `tenant:domain:${host}`;
  const cached = await cacheGet<{ id: string | null }>(fastify.redis, cacheKey);
  if (cached) return cached.id;

  const org = await fastify.prisma.organization.findUnique({
    where: { domain: host },
    select: { id: true },
  });
  await cacheSet(fastify.redis, cacheKey, { id: org?.id ?? null }, 60);
  return org?.id ?? null;
}

/**
 * Resuelve el tenant activo de un request autenticado (ADR-0006, fail-closed).
 *
 * Reglas:
 *  - `super_admin` puede elegir organización vía cabeceras `X-Org-Id` / `X-Chain-Id`,
 *    o usa su `orgId` del JWT; sin organización ve toda la plataforma.
 *  - El resto de usuarios usa el `orgId` del JWT o, como respaldo, su primera
 *    membresía activa. Si envía una cabecera `X-Org-Id`/`X-Chain-Id`, ésta se
 *    respeta SÓLO si tiene membresía activa sobre esa organización/cadena; si no
 *    tiene alcance, resuelve `organizationId: null` (fail-closed → 403).
 *  - La vista consolidada (`X-Chain-Id`) es exclusiva de `super_admin` o de un
 *    admin de la raíz (membresía `admin`/`owner` sobre la raíz de la cadena).
 *  - `isChainAdmin` es true para `super_admin` o para quien tenga una membresía
 *    `admin`/`owner` sobre la raíz de la cadena.
 */
export async function resolveTenant(
  fastify: FastifyInstance,
  request: FastifyRequest,
): Promise<TenantContext> {
  const user = request.user as TenantUser | undefined;
  if (!user?.sub) {
    return { organizationId: null, chainId: null, isSuperAdmin: false, isChainAdmin: false };
  }

  const prisma = fastify.prisma;

  const userRoles = await prisma.userRole.findMany({
    where: { userId: user.sub },
    select: { role: { select: { key: true } } },
  });
  const isSuperAdmin = userRoles.some((ur) => ur.role.key === 'super_admin');

  const headerOrgId = request.headers['x-org-id'] as string | undefined;
  const headerChainId = request.headers['x-chain-id'] as string | undefined;

  // ADR-0017: el hostname/subdominio fija la sucursal base. El usuario debe tener
  // membresía activa sobre ella (fail-closed); super_admin puede anular con cabecera.
  const hostOrgId = await resolveTenantByHostname(fastify, request);

  let organizationId: string | null = null;

  if (isSuperAdmin) {
    organizationId = headerOrgId ?? headerChainId ?? hostOrgId ?? user.orgId ?? null;
  } else if (hostOrgId) {
    // Hostname resuelto a una sucursal: requiere membresía activa sobre esa org.
    const membership = await prisma.membership.findFirst({
      where: { userId: user.sub, organizationId: hostOrgId, status: 'active' },
      select: { id: true },
    });
    if (membership) {
      organizationId = hostOrgId;
    }
    // Sin membresía sobre la sucursal del hostname: null → 403 (fail-closed).
  } else if (headerChainId) {
    // Vista consolidada: solo admin de la raíz de esa cadena.
    const rootAdmin = await prisma.membership.findFirst({
      where: {
        userId: user.sub,
        organizationId: headerChainId,
        role: { in: CHAIN_ADMIN_ROLES },
        status: 'active',
      },
      select: { id: true },
    });
    if (rootAdmin) {
      organizationId = headerChainId;
    }
    // Sin scope sobre la cadena: organizationId queda null → 403 (fail-closed).
  } else if (headerOrgId) {
    // Vista por sucursal: requiere membresía activa sobre esa org.
    const membership = await prisma.membership.findFirst({
      where: { userId: user.sub, organizationId: headerOrgId, status: 'active' },
      select: { id: true },
    });
    if (membership) {
      organizationId = headerOrgId;
    }
    // Sin membresía sobre la org solicitada: null → 403 (fail-closed).
  } else {
    organizationId = user.orgId ?? null;
    if (!organizationId) {
      const membership = await prisma.membership.findFirst({
        where: { userId: user.sub, status: 'active' },
        orderBy: { createdAt: 'asc' },
        select: { organizationId: true },
      });
      organizationId = membership?.organizationId ?? null;
    }
  }

  if (!organizationId) {
    return { organizationId: null, chainId: null, isSuperAdmin, isChainAdmin: isSuperAdmin };
  }

  const org = await prisma.organization.findUnique({
    where: { id: organizationId },
    select: { chainId: true },
  });
  const chainId = org?.chainId ?? organizationId;

  let isChainAdmin = isSuperAdmin;
  if (!isChainAdmin) {
    const rootAdmin = await prisma.membership.findFirst({
      where: {
        userId: user.sub,
        organizationId: chainId,
        role: { in: CHAIN_ADMIN_ROLES },
        status: 'active',
      },
      select: { id: true },
    });
    isChainAdmin = Boolean(rootAdmin);
  }

  return { organizationId, chainId, isSuperAdmin, isChainAdmin };
}

/**
 * preHandler: resuelve y adjunta `request.tenant`. Falla con 403 (fail-closed)
 * cuando un usuario no-super_admin no tiene organización resoluble.
 */
export function requireTenant(fastify: FastifyInstance) {
  return async (request: FastifyRequest, reply: FastifyReply): Promise<void> => {
    const tenant = await resolveTenant(fastify, request);
    (request as unknown as { tenant?: TenantContext }).tenant = tenant;
    if (!tenant.organizationId && !tenant.isSuperAdmin) {
      await reply.status(403).send({ error: 'forbidden', message: 'No se pudo resolver la organización activa' });
    }
  };
}

/** Devuelve los ids de organización de una cadena (raíz + sucursales). */
export async function chainOrgIds(fastify: FastifyInstance, chainId: string): Promise<string[]> {
  const orgs = await fastify.prisma.organization.findMany({
    where: { OR: [{ id: chainId }, { chainId }] },
    select: { id: true },
  });
  return orgs.map((o) => o.id);
}

/**
 * Devuelve el fragmento `where` de scoping según el tenant:
 *  - super_admin sin org → `{}` (sin filtro: ve todo).
 *  - admin de cadena → `{ organizationId: { in: [raíz, sucursales…] } }` (consolidado).
 *  - sucursal / usuario → `{ organizationId: <org> }`.
 */
export async function resolveScope(
  fastify: FastifyInstance,
  tenant: TenantContext,
): Promise<Record<string, unknown>> {
  if (tenant.isSuperAdmin && !tenant.organizationId) return {};
  if (tenant.isChainAdmin && tenant.chainId) {
    return { organizationId: { in: await chainOrgIds(fastify, tenant.chainId) } };
  }
  return { organizationId: tenant.organizationId ?? DEFAULT_ORG_ID };
}
