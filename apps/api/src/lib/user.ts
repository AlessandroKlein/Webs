import type { FastifyInstance } from 'fastify';

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
