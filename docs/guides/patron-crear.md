# Patrón "crear": botón → página o modal con todos los campos

Estado: aplicado (M5). Fecha de referencia: 2026-10-23.

## Regla

Toda acción de **crear** (y de **editar** con varios campos) debe tener un botón
explícito que lleve a:

1. una **página dedicada** (ruta propia), o
2. un **modal** (`Dialog`) con TODOS los campos/datos necesarios.

Nunca un formulario inline con campos incompletos: eso es la causa de errores
por datos faltantes (roles sin permisos, usuarios sin email, páginas sin título).

## Primitiva

`apps/web/src/components/ui/Dialog.tsx` es el modal genérico del design system:

```tsx
<Dialog open title="Crear rol" onClose={close} footer={<Button form="mi-form">Guardar</Button>}>
  <form id="mi-form">…todos los campos…</form>
</Dialog>
```

- Se monta **condicionalmente** (`{open && <FormDialog …/>}`) para que el estado
  del formulario se inicialice fresco en cada apertura (sin `useEffect` de sync).
- `footer` recibe los botones Cancelar / Guardar; el botón "Guardar" usa
  `form="<id>"` para disparar el submit del formulario interno.

## Flujos de "crear" y su estado

| Recurso | Botón | Forma | Estado |
| --- | --- | --- | --- |
| Rol | "Crear rol" | `Dialog` (`RoleFormDialog.tsx`) | ✅ modal completo (clave/nombre/descripción/permisos agrupados por área con "seleccionar todo") |
| Usuario | "Nuevo usuario" / "Invitar" | vista dedicada (`view==='create'/'invite'`) | ✅ página/vista completa (email/usuario/password/nombre + rol) |
| Página | "Nueva página" | vista dedicada (`PagesPage`) | ✅ completo (slug/título/redirect/home) |
| Plugin | "Instalar" desde catálogo | vista catálogo (`PluginsPage`) | ✅ selección de plugin + dependencias |
| Plantilla | "Aplicar plantilla" | botón con confirmación | ✅ (aplica preset completo, no es "crear" libre) |

## Qué aporta cada modal de crear

El `RoleFormDialog` es el caso de referencia: consume el catálogo de permisos
`GET /api/v1/permissions` (formato agrupado `{areas:[{area, permissions:[{key, description}]}]}`,
ADR-0018 / t86) y permite:

- marcar permisos individualmente o por área ("seleccionar todo"),
- ver un contador `n/total` por área,
- bloquear clave + permisos en roles de sistema (solo renombre).

## Convenciones

- El botón principal de "crear" usa `Button` con icono `bi bi-plus-lg`.
- Los labels de botones usan `t('common.create')` o "Crear <recurso>" cuando no
  hay clave i18n específica.
- La edición de roles/usuarios reutiliza el mismo modal/vista que la creación.
