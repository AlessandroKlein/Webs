import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

/**
 * Seed de arranque de la plataforma: permisos base, roles por defecto y el
 * primer superadmin.
 *
 * Los permisos siguen la convención `<recurso>.<acción>` y coinciden con los
 * valores exportados por `@webs/core` (constante `Permission`).
 */

const prisma = new PrismaClient();

const PERMISSIONS: Array<{ key: string; description: string }> = [
  { key: 'user.read', description: 'Ver usuarios' },
  { key: 'user.write', description: 'Crear/editar usuarios' },
  { key: 'role.read', description: 'Ver roles' },
  { key: 'role.write', description: 'Crear/editar roles' },
  { key: 'setting.read', description: 'Ver ajustes' },
  { key: 'setting.write', description: 'Editar ajustes' },
  { key: 'plugin.read', description: 'Ver plugins' },
  { key: 'plugin.manage', description: 'Instalar/desinstalar plugins' },
  { key: 'license.read', description: 'Ver estado y features de la licencia' },
  { key: 'license.manage', description: 'Activar/desactivar la licencia' },
  { key: 'content.read', description: 'Ver contenido' },
  { key: 'content.write', description: 'Crear/editar contenido' },
  { key: 'content.publish', description: 'Publicar contenido' },
  { key: 'translation.read', description: 'Ver traducciones' },
  { key: 'translation.write', description: 'Editar traducciones' },
  { key: 'theme.read', description: 'Ver tema' },
  { key: 'theme.write', description: 'Editar tema/CSS' },
  { key: 'seo.read', description: 'Ver SEO' },
  { key: 'seo.write', description: 'Editar SEO' },
  { key: 'media.read', description: 'Ver medios' },
  { key: 'media.write', description: 'Gestionar medios' },
  { key: 'audit.read', description: 'Ver auditoría' },
  { key: 'email.read', description: 'Ver correos' },
  { key: 'email.write', description: 'Editar plantillas/automatizaciones' },
  { key: 'email.send', description: 'Enviar campañas de correo' },
  { key: 'apiToken.read', description: 'Ver tokens de API' },
  { key: 'apiToken.write', description: 'Crear/revocar tokens de API' },
  { key: 'organization.manage', description: 'Gestionar organizaciones multi-tenant' },
  { key: 'membership.manage', description: 'Gestionar membresías y planes' },
  { key: 'attendance.manage', description: 'Registrar/consultar asistencia' },
  { key: 'inventory.manage', description: 'Gestionar inventario' },

  // Finanzas / facturación
  { key: 'billing.read', description: 'Ver facturación y pagos' },
  { key: 'billing.write', description: 'Gestionar facturación y pagos' },
  { key: 'refund.manage', description: 'Gestionar reembolsos' },

  // Inventario
  { key: 'inventory.read', description: 'Ver inventario y stock' },

  // Soporte
  { key: 'support.read', description: 'Ver tickets de soporte' },
  { key: 'support.manage', description: 'Gestionar tickets de soporte' },

  // Marketing y analítica
  { key: 'marketing.manage', description: 'Gestionar campañas de marketing' },
  { key: 'analytics.read', description: 'Ver analíticas e informes' },

  // Recursos humanos
  { key: 'hr.manage', description: 'Gestionar recursos humanos' },

  // Ventas / punto de venta
  { key: 'sales.manage', description: 'Gestionar ventas y caja' },

  // Capacitación / academia
  { key: 'course.manage', description: 'Gestionar cursos y capacitaciones' },

  // Contenido / usuarios
  { key: 'content.moderate', description: 'Moderar contenido y comentarios' },
  { key: 'user.invite', description: 'Invitar usuarios' },

  // Informes / auditoría
  { key: 'report.export', description: 'Exportar informes' },
  { key: 'audit.export', description: 'Exportar auditoría' },

  // Generador de APIs (ADR-0020)
  { key: 'generated.read', description: 'Ver recursos generados' },
  { key: 'generated.manage', description: 'Crear/editar recursos generados' },

  // Escalabilidad (selector HPA/VPA, ADR-0025)
  { key: 'scaling.read', description: 'Ver configuración de escalabilidad' },
  { key: 'scaling.write', description: 'Editar configuración de escalabilidad' },
];

const ALL_PERMISSION_KEYS = PERMISSIONS.map((p) => p.key);

/**
 * Ítems core del menú `/admin` (spec `docs/architecture/menu-admin-redesign.md`).
 * Refleja los 22 ítems que hoy viven hardcodeados en
 * `apps/web/src/layouts/AdminLayout.tsx:132-155` (mismos `path`/`section`/`perm`/
 * `feature`). `label` guarda la CLAVE i18n (p. ej. `nav.dashboard`); el frontend
 * la resuelve con `t(label)` al renderizar (los ítems de plugin ya traen `label`
 * resuelto por `resolveLabel`).
 */
const CORE_MENU_ITEMS: Array<{
  label: string;
  path: string;
  section: string;
  order: number;
  feature: string;
  permissions: string[];
}> = [
  { label: 'nav.dashboard', path: '/admin', section: 'panel', order: 1, feature: 'core', permissions: [] },
  { label: 'nav.content', path: '/admin/content', section: 'contenido', order: 2, feature: 'core', permissions: ['content.read'] },
  { label: 'nav.pages', path: '/admin/pages', section: 'contenido', order: 3, feature: 'core', permissions: ['content.read'] },
  { label: 'nav.editor', path: '/admin/editor', section: 'contenido', order: 4, feature: 'core', permissions: ['content.write'] },
  { label: 'nav.payments', path: '/admin/payments', section: 'ventas', order: 5, feature: 'core', permissions: ['user.read'] },
  { label: 'nav.email', path: '/admin/email', section: 'comunicacion', order: 6, feature: 'core', permissions: ['email.read'] },
  { label: 'nav.support', path: '/admin/support', section: 'comunicacion', order: 7, feature: 'core', permissions: ['support.read'] },
  { label: 'nav.appearance', path: '/admin/appearance', section: 'apariencia', order: 8, feature: 'core', permissions: ['theme.read'] },
  { label: 'nav.translations', path: '/admin/translations', section: 'apariencia', order: 9, feature: 'core', permissions: ['translation.read'] },
  { label: 'nav.menu', path: '/admin/menu', section: 'apariencia', order: 10, feature: 'core', permissions: ['setting.read'] },
  { label: 'nav.plugins', path: '/admin/plugins', section: 'integraciones', order: 11, feature: 'core', permissions: ['plugin.read'] },
  { label: 'nav.generated', path: '/admin/generated', section: 'integraciones', order: 12, feature: 'generator', permissions: ['generated.read'] },
  { label: 'nav.api', path: '/admin/api-tokens', section: 'integraciones', order: 13, feature: 'core', permissions: [] },
  { label: 'nav.settings', path: '/admin/settings', section: 'configuracion', order: 14, feature: 'core', permissions: ['setting.read'] },
  { label: 'nav.templates', path: '/admin/templates', section: 'configuracion', order: 15, feature: 'core', permissions: ['setting.write'] },
  { label: 'nav.branches', path: '/admin/branches', section: 'configuracion', order: 16, feature: 'core', permissions: [] },
  { label: 'nav.updates', path: '/admin/updates', section: 'configuracion', order: 17, feature: 'core', permissions: ['setting.read'] },
  { label: 'nav.license', path: '/admin/license', section: 'configuracion', order: 18, feature: 'core', permissions: ['license.read'] },
  { label: 'nav.licenseKeys', path: '/admin/license/keys', section: 'configuracion', order: 19, feature: 'core', permissions: ['license.read'] },
  { label: 'nav.users', path: '/admin/users', section: 'usuarios', order: 20, feature: 'core', permissions: ['user.read'] },
  { label: 'nav.roles', path: '/admin/roles', section: 'usuarios', order: 21, feature: 'core', permissions: ['role.read'] },
  { label: 'nav.audit', path: '/admin/audit', section: 'usuarios', order: 22, feature: 'core', permissions: ['audit.read'] },
];


const ROLES: Array<{
  key: string;
  name: string;
  description: string;
  system: boolean;
  permissions: string[];
}> = [
  {
    key: 'super_admin',
    name: 'Super Administrador',
    description: 'Acceso total a la plataforma. Rol raíz, no eliminable.',
    system: true,
    permissions: ALL_PERMISSION_KEYS,
  },
  {
    key: 'admin',
    name: 'Administrador',
    description: 'Administración operativa (sin gestión de roles).',
    system: false,
    permissions: ALL_PERMISSION_KEYS.filter((p) => !p.startsWith('role.')),
  },
  {
    key: 'editor',
    name: 'Editor',
    description: 'Gestión de contenido y medios.',
    system: false,
    permissions: [
      'content.read',
      'content.write',
      'content.publish',
      'media.read',
      'media.write',
      'plugin.read',
      'theme.read',
      'seo.read',
      'translation.read',
    ],
  },
  {
    key: 'user',
    name: 'Usuario',
    description: 'Rol básico de usuario final.',
    system: false,
    permissions: ['content.read'],
  },
  {
    key: 'entrenador',
    name: 'Entrenador',
    description: 'Asistencia, rutinas, reservas y membresías de sus alumnos.',
    system: false,
    permissions: ['attendance.manage', 'membership.manage', 'course.manage', 'organization.manage', 'content.read', 'media.read'],
  },
  {
    key: 'contador',
    name: 'Contador / Finanzas',
    description: 'Pagos, facturación, reembolsos e informes.',
    system: false,
    permissions: ['billing.read', 'billing.write', 'refund.manage', 'report.export', 'audit.export', 'analytics.read', 'user.read'],
  },
  {
    key: 'cajero',
    name: 'Cajero / Vendedor',
    description: 'Ventas, caja y consulta de stock.',
    system: false,
    permissions: ['sales.manage', 'inventory.read', 'billing.read', 'refund.manage'],
  },
  {
    key: 'soporte',
    name: 'Soporte',
    description: 'Atención de tickets y moderación.',
    system: false,
    permissions: ['support.read', 'support.manage', 'content.moderate', 'user.read'],
  },
  {
    key: 'recepcionista',
    name: 'Recepcionista',
    description: 'Asistencia y membresías en recepción.',
    system: false,
    permissions: ['attendance.manage', 'membership.manage', 'organization.manage', 'content.read'],
  },
];

async function main() {
  const adminEmail = process.env.SEED_ADMIN_EMAIL ?? 'admin@example.com';
  const adminPassword = process.env.SEED_ADMIN_PASSWORD ?? 'changeme';

  // 1. Permisos
  for (const p of PERMISSIONS) {
    await prisma.permission.upsert({
      where: { key: p.key },
      update: { description: p.description },
      create: p,
    });
  }

  // 2. Roles y sus permisos
  for (const role of ROLES) {
    const saved = await prisma.role.upsert({
      where: { key: role.key },
      update: { name: role.name, description: role.description },
      create: {
        key: role.key,
        name: role.name,
        description: role.description,
        system: role.system,
      },
    });

    const permissions = await prisma.permission.findMany({
      where: { key: { in: role.permissions } },
    });

    await prisma.rolePermission.deleteMany({ where: { roleId: saved.id } });
    await prisma.rolePermission.createMany({
      data: permissions.map((perm) => ({ roleId: saved.id, permissionId: perm.id })),
    });
  }

  // 3. Superadmin
  const passwordHash = await bcrypt.hash(adminPassword, 10);
  const superAdminRole = await prisma.role.findUniqueOrThrow({
    where: { key: 'super_admin' },
  });

  const admin = await prisma.user.upsert({
    where: { email: adminEmail },
    update: {},
    create: {
      email: adminEmail,
      passwordHash,
      displayName: 'Super Admin',
      locale: 'es',
      active: true,
    },
  });

  await prisma.userRole.upsert({
    where: { userId_roleId: { userId: admin.id, roleId: superAdminRole.id } },
    update: {},
    create: { userId: admin.id, roleId: superAdminRole.id },
  });

  // 4. Organización por defecto (raíz standalone) + membresía del superadmin.
  //    El id fijo coincide con `DEFAULT_ORG_ID` (src/lib/tenant.ts) y con la
  //    migración `multi_tenant_chains`, de modo que backfill y arranque converjan.
  const DEFAULT_ORG_ID = '00000000-0000-4000-8000-000000000001';
  const organization = await prisma.organization.upsert({
    where: { slug: 'principal' },
    update: {},
    create: {
      id: DEFAULT_ORG_ID,
      slug: 'principal',
      name: 'Organización Principal',
      type: 'standalone',
      plan: 'free',
      active: true,
    },
  });

  const existingMembership = await prisma.membership.findFirst({
    where: { userId: admin.id, organizationId: organization.id },
  });
  if (!existingMembership) {
    await prisma.membership.create({
      data: {
        organizationId: organization.id,
        userId: admin.id,
        role: 'admin',
        plan: 'free',
        status: 'active',
      },
    });
  }

  // 5. Menú de administración `/admin`: ítems core (spec `docs/architecture/menu-admin-redesign.md`).
  //    `key:'admin'` es la única fuente de verdad de los ítems core del panel;
  //    los ítems de plugin se agregan dinámicamente en `collectPluginMenuItems`.
  //    `key:'main'` queda reservada para el menú PÚBLICO (templates.ts la siembra).
  await prisma.menu.upsert({
    where: { key: 'admin' },
    update: { name: 'Menú de administración', items: CORE_MENU_ITEMS },
    create: { key: 'admin', name: 'Menú de administración', items: CORE_MENU_ITEMS },
  });

  console.log(`✔ Seed completado. Superadmin: ${adminEmail} · Organización: ${organization.slug}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
