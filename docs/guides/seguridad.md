# Seguridad y SSL/TLS

Webs se construye con **seguridad por defecto** y con SSL/TLS **opcional y
decidido por el usuario** (lo activás solo si querés).

## 1. HTTPS/TLS para la API

La API sirve HTTPS si activás TLS vía variables de entorno (en `apps/api/.env`):

```env
SSL_ENABLED=true
SSL_CERT_PATH=/etc/ssl/certs/webs.crt
SSL_KEY_PATH=/etc/ssl/private/webs.key
# o, para secretos de Kubernetes, pegar el PEM:
# SSL_CERT=-----BEGIN CERTIFICATE-----\n...\n-----END CERTIFICATE-----
# SSL_KEY=-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----
```

Si `SSL_ENABLED=false` (por defecto), la API escucha en HTTP plano.

## 2. HTTPS/TLS para el frontend

En producción, el TLS se termina en **nginx** (recomendado). Incluimos un ejemplo
completo con redirección HTTP→HTTPS y HSTS en
[`docker/nginx.ssl.conf.example`](../../docker/nginx.ssl.conf.example). Para un
certificado gratis y renovable, usá **Let's Encrypt** (certbot).

## 3. Cabeceras y cookies de seguridad (configurables en la UI)

En **Ajustes → Seguridad** podés activar/desactivar:

| Opción | Efecto |
| ------ | ------ |
| **HSTS** | Envía `Strict-Transport-Security` (solo en HTTPS). |
| **Cookies seguras** | Marca la cookie de sesión como `Secure` (solo por HTTPS). |
| **CSP** | Content-Security-Policy personalizada (vacío = desactivado). |

Además, la API aplica siempre: Helmet (cabeceras base), CORS con orígenes
permitidos, rate limiting y validación de entrada por esquema JSON.

## 4. Buenas prácticas

- **Secretos**: usá `JWT_SECRET` largo y aleatorio (`openssl rand -hex 32`); la
  API avisa en producción si se usa el valor por defecto.
- **Contraseñas**: hasheadas con bcrypt (coste 10).
- **Sesiones**: refresh token opaco hasheado en BD, con rotación al refrescar.
- **HTTP → HTTPS**: redirigí siempre en el proxy (ver nginx de ejemplo).
- **Certificados/keys**: nunca los comitees al repositorio.
