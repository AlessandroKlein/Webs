# Compositor de publicación social enriquecido (M10)

Guía de uso del compositor «Nueva publicación» de la red social (`plugins/social`), implementado en
Milestone 10 (v2.8.0). Cubre galería multi-media, menciones, hashtags, encuestas, visibilidad, emoji,
contador de caracteres, vista previa de enlaces y autoguardado de borrador. Decisión de diseño en
`docs/adr/0024-compositor-social-enriquecido.md`; spec técnica en
`docs/architecture/compositor-social.md`.

## 1. Dónde está

- **Componente**: `apps/web/src/features/public/SocialComposer.tsx` (~400 líneas).
- **Página**: `apps/web/src/features/public/SocialPublicPage.tsx` (el modal inline `textarea + un
  input[type=file]` fue reemplazado por el compositor).
- **Backend**: `plugins/social/src/server.ts` — `POST /api/v1/plugins/social/posts`.

> El frontend usa `SOCIAL_BASE = '/api/v1/plugins/social'` (no el shim `/api/v1/blocks/social`, que
> es solo para el CRUD de plugins).

## 2. Galería multi-media

- Subida de **varias** imágenes/video en un post (`uploadFile` múltiple).
- Cada ítem admite **caption** (pie).
- Reordenar (↑/↓) y eliminar.
- Vista previa antes de publicar.
- El backend persiste `mediaUrls Json[]` (`[{ url, type: 'image'|'video', caption? }]`). El campo
  legacy `mediaUrl`/`mediaType` se conserva como espejo del primer ítem (retrocompat).

## 3. Menciones y hashtags

- **Menciones `@usuario`**: autocompletado con dropdown de usuarios de la organización (regex
  `@([A-Za-z0-9_.-]+)`). Al publicar, el backend resuelve cada `username` contra `User` de la misma
  organización, crea `SocialMention` (dedup, máx. 10) y notifica al mencionado (reutiliza
  `Notification`).
- **Hashtags `#tema`**: se extraen del texto, se normalizan a minúsculas y se indexan en
  `SocialHashtag`. En el feed son clicables y filtran (`GET /posts?tag=...`).

## 4. Encuestas

- Pregunta + **2..20 opciones**.
- **Un voto por usuario** por encuesta: el backend usa upsert con `@@unique([pollId, userId])`, de
  modo que volver a votar **reemplaza** el voto anterior (no duplica).
- Conteo en vivo en el feed (`GET /posts/:id/votes`); la opción elegida se marca si el usuario está
  autenticado.

## 5. Visibilidad

Selector con tres niveles, filtrado **en el servidor** (no hay leak en el cliente):

| Nivel | Quién lo ve |
|-------|-------------|
| `public` | todos (incluso anónimos) |
| `followers` | solo seguidores del autor |
| `private` | solo el autor |

`GET /posts` materializa el filtro en la `where` de Prisma según el solicitante (anónimo / autor /
seguidor / no-seguidor). Ver matriz completa en `docs/architecture/compositor-social.md` §5.

## 6. Emoji, contador y vista previa de enlace

- **Emoji picker** nativo (48 emojis), inserta en la posición del cursor.
- **Contador de caracteres** con límite 500 (marca en rojo/danger si excede).
- **Vista previa de enlace** inline: si el texto contiene una URL (o se adjunta `preview.url`), el
  backend hace unfurl **SSRF-safe** (deniega loopback/privados, re-valida IP con `node:dns`, timeout
  3–5 s, máx. 5 redirecciones, tope 512 KB, cache por URL) y devuelve `{ title, description, image,
  siteName }`.

## 7. Autoguardado de borrador

- El borrador se guarda en `localStorage` bajo la clave `webs.social.draft.v1`.
- Se recupera automáticamente al abrir el compositor.
- Se limpia al publicar.

## 8. Flujo de publicación

`publish` envía:

```jsonc
POST /api/v1/plugins/social/posts
{
  "author": "<userId>",
  "text": "Hola @juan mira #webs",
  "mediaUrls": [{ "url": "...", "type": "image", "caption": "portada" }],
  "visibility": "public",           // public | followers | private (default public)
  "poll": { "question": "¿?", "options": [{ "id": "a", "text": "Sí" }] }
}
```

El backend, en una transacción: valida `visibility`, normaliza media, extrae menciones/hashtags,
crea la encuesta (si hay), hace unfurl del preview y notifica menciones.

## 9. Verificación rápida

- Crear un post con 2 imágenes + caption y verificar galería en el feed.
- Mencionar a otro usuario → debe llegar notificación y la mención debe ser clicable.
- Publicar con `#tema` → filtrar el feed por ese tag.
- Crear encuesta y votar dos veces → el conteo no duplica (reemplaza).
- Publicar `private` → otro usuario autenticado no lo ve; el autor sí.
- Recargar a mitad de redacción → el borrador se recupera.

## 10. Referencias

- `docs/adr/0024-compositor-social-enriquecido.md` (decisión).
- `docs/architecture/compositor-social.md` (spec técnica + modelo Prisma).
- `docs/architecture/politica-dependencias.md` («todo nativo, sin modo de pago»).
- `docs/backlog.md` §3.7 (WB-45→WB-53).
