# Editor de páginas (bloques)

El panel edita las páginas públicas con un **editor de bloques** en `/admin/pages`
(permiso `content.write`). Sustituye al antiguo `/admin/editor` (GrapesJS), que se
retiró: el lienzo libre generaba HTML difícil de sanear y de renderizar.

## Flujo

1. **Páginas** → lista de páginas existentes y botón **Editar** (o **Editar inicio**
   si ya hay una home).
2. En el editor: barra superior con el título, estado (guardando/guardado), selector
   de ancho de vista (escritorio/tablet/móvil), **Previsualizar** y **Publicar**.
3. **Insertar**: el panel lateral agrupa bloques nativos (`heading`, `text`,
   `image`, `divider`, `spacer`, `html`) y los plugins instalados.
4. **Seleccionar** un bloque abre el inspector: nivel del título, texto, URL de
   imagen, alto del separador, tamaño de la sección (`full`/`half`/`third`).
5. **Publicar** guarda el `layout` en la página. La home es única y el backend
   desmarca la anterior.

## Atajos

| Tecla | Acción |
| --- | --- |
| `/` | Abre el insertador de bloques |
| `Esc` | Cierra el insertador / deselecciona |
| `Ctrl/Cmd + S` | Guarda y publica |
| `Ctrl/Cmd + Z` | Deshacer |
| `Ctrl/Cmd + Shift + Z` | Rehacer |
| `Supr` | Borra el bloque seleccionado |

## Bloques de plugin

En el lienzo se muestran como **marcador punteado** con el nombre del plugin; el
plugin real se monta solo en **Previsualizar** y en el sitio público. Así el editor
no ejecuta código de terceros mientras se edita.

## Modelo y compatibilidad

`Page.layout` sigue siendo la única fuente de verdad (`PageSection[]` con
`{ size, blocks }`). Los `id` de secciones/elementos son aditivos y se sintetizan al
cargar si faltan; no se migran registros. El render público no cambió.

## Límites conocidos (siguientes fases)

- Sin autoguardado ni historial de revisiones (fase 2/3 del diseño).
- Sin texto enriquecido: `text` es texto plano y `html` acepta HTML saneado.
- Sin edición en línea de todos los tipos: el texto se edita desde el inspector.
