import type { FastifyInstance } from 'fastify';
import { CHAIN_ADMIN_ROLES } from './tenant';

/** Perfil de usuario con sus permisos efectivos (resueltos desde sus roles). */
export interface UserProfile {
  id: string;
  email: string;
  username: string | null;
  displayName: string | null;
  firstName: string | null;
  lastName: string | null;
  birthDate: Date | null;
  avatarUrl: string | null;
  locale: string;
  active: boolean;
  profile: Record<string, unknown> | null;
  permissions: string[];
  /** Organización activa por defecto (scoping multi-tenant, ADR-0006). */
  orgId: string | null;
  /** Raíz de la cadena a la que pertenece la org activa (ADR-0006). */
  chainId: string | null;
  /** El usuario administra la cadena completa (super_admin o admin de la raíz). */
  isChainAdmin: boolean;
}

/** Carga un usuario con sus permisos efectivos. Devuelve null si no existe. */
export async function findUserWithPermissions(
  fastify: FastifyInstance,
  userId: string,
): Promise<UserProfile | null> {
  const user = await fastify.prisma.user.findUnique({
    where: { id: userId },
    include: {
      roles: {
        include: { role: { include: { permissions: { include: { permission: true } } } } },
      },
    },
  });

  if (!user) return null;

  // super_admin es supremo: siempre tiene TODOS los permisos existentes (aunque
  // se agreguen permisos nuevos después del seed, el rol los ve al instante).
  const isSuperAdmin = user.roles.some((ur) => ur.role.key === 'super_admin');
  const permissions = isSuperAdmin
    ? (await fastify.prisma.permission.findMany({ select: { key: true } })).map((p) => p.key)
    : [
        ...new Set(
          user.roles.flatMap((ur) => ur.role.permissions.map((rp) => rp.permission.key)),
        ),
      ];

  // Organización activa por defecto: primera membresía activa (ADR-0006).
  const membership = await fastify.prisma.membership.findFirst({
    where: { userId: user.id, status: 'active' },
    orderBy: { createdAt: 'asc' },
    select: { organizationId: true },
  });

  // Cadena y administración derivadas de la membresía activa (ADR-0006).
  const orgId = membership?.organizationId ?? null;
  let chainId: string | null = null;
  let isChainAdmin = isSuperAdmin;
  if (orgId) {
    const org = await fastify.prisma.organization.findUnique({
      where: { id: orgId },
      select: { chainId: true },
    });
    chainId = org?.chainId ?? orgId;
    if (!isChainAdmin) {
      const rootAdmin = await fastify.prisma.membership.findFirst({
        where: {
          userId: user.id,
          organizationId: chainId,
          role: { in: CHAIN_ADMIN_ROLES },
          status: 'active',
        },
        select: { id: true },
      });
      isChainAdmin = Boolean(rootAdmin);
    }
  }

  return {
    id: user.id,
    email: user.email,
    username: user.username,
    displayName: user.displayName,
    firstName: user.firstName,
    lastName: user.lastName,
    birthDate: user.birthDate,
    avatarUrl: user.avatarUrl,
    locale: user.locale,
    active: user.active,
    profile: (user.profile as Record<string, unknown> | null) ?? null,
    permissions,
    orgId,
    chainId,
    isChainAdmin,
  };
}

/** Proyección pública de un usuario (sin datos sensibles). */
export function toPublicUser(profile: UserProfile) {
  return {
    id: profile.id,
    email: profile.email,
    username: profile.username,
    displayName: profile.displayName,
    firstName: profile.firstName,
    lastName: profile.lastName,
    birthDate: profile.birthDate,
    avatarUrl: profile.avatarUrl,
    locale: profile.locale,
    active: profile.active,
    profile: profile.profile,
  };
}
