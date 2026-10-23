#!/usr/bin/env node
/**
 * Finalización de la instalación de Webs. Se ejecuta como un proceso nuevo
 * DESPUÉS de `prisma db push` + `prisma generate`, de modo que importa el
 * cliente Prisma ya regenerado para el motor elegido.
 *
 * Hace: seed de roles/permisos, creación de la cuenta admin (super_admin),
 * y guardado de la configuración de sitio y SMTP.
 *
 * Entorno esperado:
 *   - DATABASE_URL: URL de conexión.
 *   - DATA_DIR: directorio donde está `setup-payload.json`.
 */
import { createRequire } from 'node:module';
import { createCipheriv, createHash, randomBytes } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

// Resuelve @prisma/client y bcryptjs desde apps/api (donde pnpm los enlaza),
// porque este script vive en scripts/ y pnpm no los eleva a la raíz.
const require = createRequire(new URL('../apps/api/package.json', import.meta.url));
const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcryptjs');

const prisma = new PrismaClient();

/** Cifra un valor con AES-256-GCM usando ENCRYPTION_KEY (si está definida). */
function encryptSecret(value) {
  const secret = process.env.ENCRYPTION_KEY;
  if (!secret || !value) return value;
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', createHash('sha256').update(secret).digest(), iv);
  const encrypted = Buffer.concat([cipher.update(value, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [iv.toString('base64'), tag.toString('base64'), encrypted.toString('base64')].join('.');
}

// Mantener en sincronía con apps/api/prisma/seed.ts.
const PERMISSIONS = [
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
];

const ALL_PERMISSION_KEYS = PERMISSIONS.map((p) => p.key);

const ROLES = [
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

const payload = JSON.parse(
  fs.readFileSync(path.join(process.env.DATA_DIR ?? 'data', 'setup-payload.json'), 'utf8'),
);

async function main() {
  // 1. Permisos.
  for (const p of PERMISSIONS) {
    await prisma.permission.upsert({
      where: { key: p.key },
      update: { description: p.description },
      create: p,
    });
  }

  // 2. Roles y sus permisos.
  for (const role of ROLES) {
    const saved = await prisma.role.upsert({
      where: { key: role.key },
      update: { name: role.name, description: role.description, system: role.system },
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

  // 3. Cuenta admin (super_admin).
  const superAdminRole = await prisma.role.findUniqueOrThrow({ where: { key: 'super_admin' } });
  const passwordHash = await bcrypt.hash(payload.admin.password, 10);
  const admin = await prisma.user.create({
    data: {
      email: payload.admin.email,
      username: payload.admin.username ?? null,
      passwordHash,
      displayName: payload.admin.displayName ?? 'Administrador',
      locale: payload.site.defaultLocale ?? 'es',
      active: true,
      emailVerifiedAt: new Date(),
    },
  });
  await prisma.userRole.create({ data: { userId: admin.id, roleId: superAdminRole.id } });

  // 3b. Organización por defecto (raíz standalone) + membresía del admin.
  //     Alineado con seed.ts: el id fijo coincide con DEFAULT_ORG_ID
  //     (src/lib/tenant.ts) y con la migración multi_tenant_chains.
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

  // 4. Configuración del sitio.
  await prisma.setting.upsert({
    where: { key: 'site' },
    update: { value: payload.site, schemaKey: 'site' },
    create: { key: 'site', value: payload.site, schemaKey: 'site' },
  });

  // 5. Configuración SMTP (cifra la contraseña si ENCRYPTION_KEY está definida).
  const smtpValue = { ...payload.smtp };
  if (smtpValue.password) smtpValue.password = encryptSecret(smtpValue.password);
  await prisma.setting.upsert({
    where: { key: 'smtp' },
    update: { value: smtpValue, schemaKey: 'smtp' },
    create: { key: 'smtp', value: smtpValue, schemaKey: 'smtp' },
  });

  console.log('✔ Instalación completada');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
