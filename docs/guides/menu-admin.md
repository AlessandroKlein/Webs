# Categorías del menú de administración (`/admin`)

> **Guía operativa.** Cómo se agrupa y ordena el panel de administración, y cómo
> un plugin declara su ítem de menú para que aparezca en la sección correcta. La
> spec técnica (taxonomía y contrato de metadatos) está en
> [`docs/architecture/menu-categorias.md`](../architecture/menu-categorias.md).

## Qué es

El menú de `/admin` combina tres fuentes en **una lista** que el frontend agrupa
en **secciones**:

1. `coreNav` — ítems fijos del núcleo (Panel, Contenido, Pagos, Usuarios, etc.).
2. `featureNav` — ítems de módulos core (Blog, Social, Chat, Comercio, etc.).
3. `pluginNav` — ítems declarados por los plugins instalados (vía `GET /menu`).

Cada ítem se clasifica en **una sección** según su función principal. No hay una
categoría «Plugins» separada: los ítems de plugins aparecen **como nativos**
dentro de su sección (ADR-0005).

## Taxonomía de secciones

| `key` | Sección | Qué contiene |
|-------|---------|--------------|
| `panel` | Panel | Dashboard y analíticas (visión global). |
| `contenido` | Contenido | Páginas, editor visual, blog, formularios. |
| `ventas` | Ventas | Comercio, pagos, facturación, inventario, caja (POS). |
| `comunicacion` | Comunicación | Email, notificaciones, chat, soporte. |
| `comunidad` | Comunidad | Red social, calendario/reservas, academia. |
| `apariencia` | Apariencia | Tema, traducciones, menú público. |
| `integraciones` | Integraciones | Plugins, marketplace, pasarelas, almacenamiento, API, automatizaciones. |
| `configuracion` | Configuración | Ajustes, plantillas, sucursales, licencia, actualizaciones. |
| `usuarios` | Usuarios y seguridad | Usuarios, roles, auditoría. |

## Cómo un plugin declara su ítem

En el `plugin.json`, el bloque `menu[]`:

```json
{
  "id": "facturacion",
  "category": "negocio",
  "menu": [
    {
      "id": "admin",
      "label": { "es": "Facturación", "en": "Invoices" },
      "path": "/admin/invoices",
      "order": 7,
      "target": "admin"
    }
  ]
}
```

- `path` — ruta frontend (debe existir en `apps/web/src/App.tsx`).
- `target` — `admin` (panel), `public` (sitio) o `both`.
- `order` — posición dentro de la sección.
- `label` — texto localizado (`{ es, en, pt }`).

### Orden de precedencia para la sección

La sección de un ítem de plugin se resuelve en este orden:

1. **`menu[].section` explícito** — si el ítem declara `"section": "comunicacion"`,
   gana sobre todo lo demás.
2. **Mapeo desde `manifest.category`** — p. ej. `"category": "negocio"` → `ventas`;
   `"category": "contenido"` → `contenido`; `"category": "pagos"` → `integraciones`.
   Ver la tabla completa en
   [`menu-categorias.md`](../architecture/menu-categorias.md).
3. **Default `integraciones`** — cuando no hay `section` ni `category` reconocible.

Ejemplo: `facturacion` declara `"category": "negocio"` → sección **Ventas**. Si
quisiera forzar otra, añadiría `"section": "comunicacion"` a su `menu[]`.

## Cómo se sirve el menú

- `GET /api/v1/menu` (admin, permiso `setting.read`) devuelve
  `{ items: [...] }`, fusionando los ítems core (clave `main` de `prisma.menu`)
  y los ítems de plugins (`collectPluginMenuItems('admin')`).
- El frontend (`apps/web/src/layouts/AdminLayout.tsx`) agrupa los `items` por
  `section` en el orden de la taxonomía, ordena dentro de cada sección por
  `order`, filtra por `permissions` (el ítem es visible solo si el usuario posee
  todos los permisos) y omite las secciones vacías.
- El menú público (`GET /api/v1/settings/public/menu`) sigue su propia lógica;
  la taxonomía de secciones aplica solo al panel `/admin`.

## Reordenar ítems core

`PUT /api/v1/menu` (permiso `setting.write`) persiste la lista de ítems core en
la clave `main` de `prisma.menu`. Los ítems de plugins no se editan por esta vía;
se ordenan por su `order` declarado en el manifiesto.

## Reglas a recordar

1. Un ítem pertenece a **exactamente una** sección (no se duplica).
2. La sección se decide por la **función principal**, no por el permiso (el
   permiso solo controla visibilidad, no ubicación).
3. La taxonomía es **extensible**: un plugin puede introducir una sección nueva
   con su `key`, que el frontend renderiza al final.

## Enlaces

- [`docs/architecture/menu-categorias.md`](../architecture/menu-categorias.md) — spec de taxonomía y clasificación de los 33 ítems actuales.
- [`docs/architecture/plugin-system.md`](../architecture/plugin-system.md) — manifiesto `plugin.json` y el campo `menu[]`.
- [`docs/guides/crear-un-plugin.md`](crear-un-plugin.md) — guía completa para crear un plugin.
