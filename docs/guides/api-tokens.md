# API Tokens (JWT)

Los **API tokens** permiten que aplicaciones, scripts o integraciones accedan a
la API REST de Webs de forma segura, **sin usar credenciales de usuario** y con
**permisos acotados** (scopes). Se gestionan en **API Tokens** del panel.

## Cómo se crean

1. En el panel, **API Tokens → Crear token** (cualquier usuario puede crear sus
   propios tokens).
2. Elegí nombre, permisos (scopes), caducidad y un **límite de peticiones/minuto**
   opcional.
3. El token JWT se muestra **una sola vez**: copialo y guardalo seguro.

Los **scopes** no pueden exceder los permisos que el propio usuario tiene (un
usuario no puede concederse más de lo que ya puede hacer).

## Cómo se usan

El cliente envía el token en la cabecera `Authorization`:

```bash
curl -H "Authorization: Bearer <API_TOKEN>" https://tudominio.com/api/v1/content
```

## Cómo funciona (seguridad)

- El token es un **JWT** firmado con `JWT_SECRET` y payload
  `{ sub, type: 'api_token', tokenId, scopes }`.
- En cada petición, `authenticate` verifica la firma + expiración, consulta la
  base de datos para confirmar que el token **no fue revocado** y sigue vigente,
  y aplica el **rate limit** del token si está configurado.
- El titular solo obtiene los **scopes** del token (no los permisos del usuario).
- La revocación es inmediata (marca `revokedAt`). Se registran `requestCount` y
  `lastUsedAt`.

## Endpoints

| Método | Ruta | Descripción |
| ------ | ---- | ----------- |
| GET | `/api/v1/api-tokens` | Listar tus tokens (sin el secreto). |
| POST | `/api/v1/api-tokens` | Crear token (devuelve el JWT una vez). |
| DELETE | `/api/v1/api-tokens/:id` | Revocar token. |
