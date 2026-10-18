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
import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';
import fs from 'node:fs';
import path from 'node:path';

const prisma = new PrismaClient();

// Mantener en sincronía con apps/api/prisma/seed.ts.
const PERMISSIONS = [
  { key: 'user.read', description: 'Ver usuarios' },
  { key: 'user.write', description: 'Crear/editar usuarios' },
  { key: 'role.read', description: 'Ver roles' },
  { key: 'role.write', description: 'Crear/editar roles' },
  { key: 'setting.read', description: 'Ver ajustes' },
  { key: 'setting.write', description: 'Editar ajustes' },
  { key: 'block.read', description: 'Ver bloques' },
  { key: 'block.manage', description: 'Instalar/desinstalar bloques' },
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
    system: true,
    permissions: ALL_PERMISSION_KEYS.filter((p) => !p.startsWith('role.')),
  },
  {
    key: 'editor',
    name: 'Editor',
    description: 'Gestión de contenido y medios.',
    system: true,
    permissions: [
      'content.read',
      'content.write',
      'content.publish',
      'media.read',
      'media.write',
      'block.read',
      'theme.read',
      'seo.read',
      'translation.read',
    ],
  },
  {
    key: 'user',
    name: 'Usuario',
    description: 'Rol básico de usuario final.',
    system: true,
    permissions: ['content.read'],
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

  // 3. Cuenta admin (super_admin).
  const superAdminRole = await prisma.role.findUniqueOrThrow({ where: { key: 'super_admin' } });
  const passwordHash = await bcrypt.hash(payload.admin.password, 10);
  const admin = await prisma.user.create({
    data: {
      email: payload.admin.email,
      passwordHash,
      displayName: payload.admin.displayName ?? 'Administrador',
      locale: payload.site.defaultLocale ?? 'es',
      active: true,
      emailVerifiedAt: new Date(),
    },
  });
  await prisma.userRole.create({ data: { userId: admin.id, roleId: superAdminRole.id } });

  // 4. Configuración del sitio.
  await prisma.setting.upsert({
    where: { key: 'site' },
    update: { value: payload.site, schemaKey: 'site' },
    create: { key: 'site', value: payload.site, schemaKey: 'site' },
  });

  // 5. Configuración SMTP.
  await prisma.setting.upsert({
    where: { key: 'smtp' },
    update: { value: payload.smtp, schemaKey: 'smtp' },
    create: { key: 'smtp', value: payload.smtp, schemaKey: 'smtp' },
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
