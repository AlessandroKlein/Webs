# Blog

Cómo funciona el blog de Webs: posts, comentarios y publicación.

## Modelo

Un post pertenece a una organización y tiene: `title`, `body`, `category`,
`tags`, `status` (`published` | `draft` | `scheduled`), `excerpt`, `featuredImage`,
`authorId` y `publishedAt`. El `slug` es **único por organización**
(`UNIQUE(organizationId, slug)`) y se genera con `slugify(title)`
(normalización NFD, sin tildes, `[a-z0-9-]`); si colisiona, `uniqueSlug` agrega
`-2`, `-3`, etc.

## Endpoints

Todas las rutas están bajo `/api/v1/plugins/blog` (y su shim legacy
`/api/v1/blocks/blog`).

| Método | Ruta | Acceso | Notas |
|--------|------|--------|-------|
| `GET` | `/posts` | público | `?status` filtra; `?q` busca por título. Sin `limit&offset` → array plano (compat admin); con ellos → `{items,total,limit,offset}` con `limit` máx 50 |
| `GET` | `/posts/:slug` | público | solo `status: 'published'`; 404 si no existe o no está publicado |
| `GET` | `/posts/by-id/:id` | admin | bajo `/by-id` para no chocar con `/:slug` |
| `POST` | `/posts` | autenticado | `authorId` = usuario actual; `slug` generado; `publishedAt` si `published` |
| `PATCH` | `/posts/:id` | autenticado | permite editar slug (re-normaliza + `uniqueSlug`) |
| `DELETE` | `/posts/:id` | autenticado | borra el post |
| `GET` | `/posts/:slug/comments` | público | comentarios del post publicado, orden ascendente |
| `POST` | `/posts/:slug/comments` | autenticado | `{content, rating?}`; autor = `displayName` / `email` / "Anónimo"; 404 si el post no está publicado |

## Rutas públicas

- `/blog` — listado (`GET /api/v1/blocks/blog/posts?status=published&limit=&offset=`).
- `/blog/:slug` — post individual + comentarios (`GET .../posts/:slug` +
  `GET .../posts/:slug/comments`). El cuerpo se renderiza con
  `sanitizeHtml(post.body)` (saneado del HTML) antes de insertarse en el DOM.
  El formulario de comentarios aparece solo con sesión; sin sesión se enlaza
  a `/login`.

## Administración

`/admin/blog` (`BlogPage`) lista los posts y permite crear/editar/borrar
(`POST/PATCH/DELETE /posts`), con `slug`, `excerpt`, `featuredImage` y
`publishedAt` editables.

## Faltantes (no prometidos)

| Tema | Estado |
|------|--------|
| Moderación de comentarios | No existe: los comentarios autenticados se publican directo |
| Posts relacionados | No existe |
| Comentarios anidados | No; solo lista plana ordenada por creación |
| Programación automática de `scheduled` | El estado existe; no hay worker que publique a fecha/hora |
