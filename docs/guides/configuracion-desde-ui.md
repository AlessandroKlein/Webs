# Configurar el sitio desde la UI (sin tocar código)

Esta guía está dirigida a **administradores y usuarios finales**. Todo lo que
se describe aquí se hace desde el panel de administración (frontend React), sin
necesidad de editar archivos ni tocar código.

Después de iniciar sesión (`/login`), el panel (`/`) ofrece las secciones:
Panel, Contenido, Plugins, Usuarios, Roles y permisos, Ajustes, Apariencia,
Traducciones y Auditoría.

---

## 1. Configuración general del sitio (nombre, logo, SEO, legales, contacto, redes)

Ve a **Ajustes** (`/settings`). Cada *sección de ajustes* se muestra como una
tarjeta con un formulario generado automáticamente desde su JSON Schema
(`apps/api/src/modules/settings/sections.ts`).

| Sección      | Qué permite configurar                                                                 |
| ------------ | -------------------------------------------------------------------------------------- |
| **Sitio** (`site`)        | Nombre del sitio, lema/descripción corta, URL del logo, URL del favicon, idioma por defecto (`es`/`en`). |
| **SEO global** (`seo`)    | Título por defecto, descripción meta, palabras clave, imagen Open Graph, URL canónica, directiva `robots`. |
| **Páginas legales** (`legal`) | Política de privacidad, términos de uso y política de cookies (campos de texto enriquecido). |
| **Contacto** (`contact`)  | Correo, teléfono, dirección y WhatsApp.                                                |
| **Redes sociales** (`social`) | URLs de Facebook, Instagram, X, LinkedIn y YouTube.                                    |

Pulsá **Guardar** en cada tarjeta. Internamente se llama a
`PUT /api/v1/settings/<key>` y el valor se valida contra el esquema de la
sección.

> Las secciones base viven en el registro de ajustes
> (`apps/api/src/modules/settings`). Los plugins instalados pueden aportar su
> propia configuración (ver sección 3).

---

## 2. Apariencia (tema, color primario, CSS personalizado)

Ve a **Apariencia** (`/appearance`). Esta pantalla edita la sección
`appearance`:

- **Tema** (`defaultTheme`): `claro` / `oscuro` / `sistema`.
- **Color primario** (`primaryColor`): selector de color que sobrescribe la
  variable CSS `--ws-primary`.
- **CSS personalizado** (`customCss`): texto CSS que se inyecta en el sitio.
  Puede sobrescribir cualquier token de diseño `--ws-*`, por ejemplo:

  ```css
  :root {
    --ws-primary: #0f766e;
    --ws-radius-md: 12px;
  }
  ```

Pulsá **Guardar** para persistir (`PUT /api/v1/settings/appearance`).

> Los tokens de tema están definidos en `packages/ui/src/styles/tokens.css`.

---

## 3. Plugins (instalar, configurar y colocar en slots)

Ve a **Plugins** (`/admin/plugins`). La pantalla muestra dos listas:

### Instalados

Cada plugin instalado permite:

- **Editar**: abre un formulario generado desde el `settings` del plugin
  (JSON Schema) para cambiar su configuración. Guarda con
  `PUT /api/v1/plugins/:id/settings`.
- **Deshabilitar / Habilitar**: activa o desactiva el plugin
  (`POST /api/v1/plugins/:id/deactivate` / `activate`).
- **Eliminar**: desinstala el plugin (`DELETE /api/v1/plugins/:id`).

### Catálogo

Lista los plugins **disponibles** (descubiertos en `blocks/*`) que aún no
están instalados. Pulsá **Crear** para instalar
(`POST /api/v1/plugins/install` con `{ "id": <pluginId> }`).

### Colocar plugins en slots

Los **slots** son regiones del sitio (`header`, `content`, `sidebar`,
`footer`) donde se renderizan los plugins. Las colocaciones se gestionan con:

- `GET /api/v1/slots` — lista de slots.
- `GET /api/v1/placements?slotId=<slot>` — colocaciones actuales de un slot.
- `PUT /api/v1/placements` — reemplaza las colocaciones de un slot.

Ejemplo de body para colocar dos plugins en `content`:

```json
{
  "slotId": "content",
  "blocks": [
    { "blockId": "store", "order": 0, "enabled": true, "config": {} },
    { "blockId": "example", "order": 1, "enabled": true, "config": { "greeting": "Hola" } }
  ]
}
```

> El body de `PUT /placements` conserva la key `blocks` y el campo `blockId` de
> forma transitoria (ver `docs/architecture/plugin-system.md`, sección «Estado
> transitorio del rename»).

> El frontend renderiza las colocaciones de cada slot a través del componente
> `PluginSlot` (`apps/web/src/plugins/PluginSlot.tsx`). La página pública de
> ejemplo (`/site`) demuestra los cuatro slots.

---

## 4. Traducciones

Ve a **Traducciones** (`/translations`). Aquí se gestionan las cadenas
traducibles de la plataforma:

- `GET /api/v1/locales` — locales soportados (`es`, `en`).
- `GET /api/v1/translations?locale=es&namespace=translation` — traducciones.
- `PUT /api/v1/translations` — crea/actualiza una traducción (upsert):

  ```json
  { "locale": "es", "namespace": "translation", "key": "app.name", "value": "Mi Sitio" }
  ```

Las traducciones guardadas aquí **sobrescriben** los recursos base compilados
(`packages/i18n`) y pueden incluir claves aportadas por plugins.

---

## Resumen de permisos necesarios

| Acción                    | Permiso(s) requerido(s)                        |
| ------------------------- | ---------------------------------------------- |
| Ver/editar ajustes        | `setting.read` / `setting.write`               |
| Ver catálogo de plugins   | `block.read`                                   |
| Instalar/colocar plugins  | `block.manage`                                 |
| Configurar un plugin      | `setting.write`                                |
| Ver/editar traducciones   | `translation.read` / `translation.write`       |

> Los permisos internos `block.read`/`block.manage` se conservan de forma
> transitoria (ver `docs/architecture/plugin-system.md`). Los asigna un
> administrador desde **Roles y permisos**. Ver
> [`docs/guides/roles-permisos.md`](./roles-permisos.md).

---

## Ver también

- [`docs/guides/crear-un-plugin.md`](./crear-un-plugin.md) — crear plugins.
- [`docs/api/overview.md`](../api/overview.md) — referencia de endpoints.
