import type { FastifyInstance } from 'fastify';

/** Perfil de usuario con sus permisos efectivos (resueltos desde sus roles). */
export interface UserProfile {
  id: string;
  email: string;
  displayName: string | null;
  avatarUrl: string | null;
  locale: string;
  active: boolean;
  permissions: string[];
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

  const permissions = [
    ...new Set(
      user.roles.flatMap((ur) => ur.role.permissions.map((rp) => rp.permission.key)),
    ),
  ];

  return {
    id: user.id,
    email: user.email,
    displayName: user.displayName,
    avatarUrl: user.avatarUrl,
    locale: user.locale,
    active: user.active,
    permissions,
  };
}

/** Proyección pública de un usuario (sin datos sensibles). */
export function toPublicUser(profile: UserProfile) {
  return {
    id: profile.id,
    email: profile.email,
    displayName: profile.displayName,
    avatarUrl: profile.avatarUrl,
    locale: profile.locale,
    active: profile.active,
  };
}
