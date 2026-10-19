# Cookies y persistencia

Webs usa cookies para **recordar sesiones** y **preferencias**, priorizando la
seguridad. Tres tipos:

## 1. Sesión (refresh token) — segura

| Cookie | Atributos |
| ------ | --------- |
| refresh token (opaca) | `HttpOnly` · `Secure` · `SameSite=Lax` · `path=/` |

- **No es un JWT legible por JS**: es un valor opaco cuyo hash se guarda en BD.
- **Sliding / inactividad**: cada vez que la app renueva el access token (≈15 min),
  se **rota** la sesión y se emite una nueva con expiración fresca:
  - **30 días** por defecto, **90 días** con "Recordarme".
  - Si no ingresás en ese tiempo, la sesión **expira** (debes iniciar sesión de nuevo).
- Se borra al cerrar sesión (`clearCookie`).

## 2. Preferencias (legibles por JS) — no sensibles

| Cookie | Valor | Expira |
| ------ | ----- | ------ |
| `webs-theme` | `light` / `dark` / `system` | 1 año |
| `webs-locale` | `es` / `en` / `pt` | 1 año |

- Atributos: `SameSite=Lax` · `Secure` (en HTTPS) · `path=/`.
- El **tema** se aplica **antes de pintar** (script inline en `index.html`) para
  evitar el "flash" de tema incorrecto.

## Seguridad

- El **JWT de acceso vive en memoria** (nunca en cookies/localStorage), mitigando XSS.
- Solo la cookie de sesión es `HttpOnly`; las de preferencia no guardan datos sensibles.
- `Secure` en producción (HTTPS) y `SameSite=Lax` mitiga CSRF.

## Dónde se implementa

- Backend: `apps/api/src/modules/auth/routes.ts` (`setRefreshCookie`, refresh con rotación).
- Tema: `packages/ui/src/theme.tsx` + `packages/ui/src/cookies.ts`.
- Idioma: `apps/web/src/lib/i18n.ts`.
