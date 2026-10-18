# API Tokens (JWT)

Los **API tokens** permiten que aplicaciones, scripts o integraciones accedan a
la API REST de Webs de forma segura, **sin usar credenciales de usuario** y con
**permisos acotados** (scopes). Se gestionan en **API Tokens** del panel.

## Cómo se crean

1. En el panel, **API Tokens → Crear token**.
2. Elegí un nombre, los permisos (scopes) y una caducidad opcional.
3. El token JWT se muestra **una sola vez**: copialo y guardalo seguro.

## Cómo se usan

El cliente envía el token en la cabecera `Authorization`:

```bash
curl -H "Authorization: Bearer <API_TOKEN>" https://tudominio.com/api/v1/content
```

## Cómo funciona (seguridad)

- El token es un **JWT** firmado con `JWT_SECRET` y payload
  `{ sub, type: 'api_token', tokenId, scopes }`.
- En cada petición, `authenticate` verifica la firma + expiración y consulta la
  base de datos para confirmar que el token **no fue revocado** y sigue vigente.
- El titular solo obtiene los **scopes** del token (no los permisos del usuario).
- La revocación es inmediata (marca `revokedAt`).

## Endpoints

| Método | Ruta | Permiso | Descripción |
| ------ | ---- | ------- | ----------- |
| GET | `/api/v1/api-tokens` | `apiToken.read` | Listar tokens (sin el secreto). |
| POST | `/api/v1/api-tokens` | `apiToken.write` | Crear token (devuelve el JWT una vez). |
| DELETE | `/api/v1/api-tokens/:id` | `apiToken.write` | Revocar token. |

> Los tokens de API usan el mismo esquema de permisos que el resto del sistema;
> el JWT de acceso de usuario sigue siendo la vía para el panel y la app web.
